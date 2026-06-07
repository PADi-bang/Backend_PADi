# Arsitektur & Alur Absensi App_PADi (Edge AI & Geofencing)

Dokumen ini menjelaskan alur kerja (*flow*) sistem absensi pada aplikasi App_PADi. Untuk menjaga performa *server* dan memastikan akurasi data, sistem ini menerapkan pemrosesan **Edge AI (Face Embedding di sisi Klien)** dan **Geofencing Berlapis**.

---

## 1. Konsep Utama
1. **Frontend-Heavy Processing:** Pemrosesan gambar (*Face Extraction*) dilakukan sepenuhnya di perangkat *smartphone* siswa (Flutter). *Server* (Express.js) hanya menerima deretan angka (*array/vector*).
2. **Geofencing sebagai Kunci UI:** Tombol "Ambil Foto/Absen" pada aplikasi tidak akan bisa ditekan (disabled) jika siswa berada di luar radius sekolah.

---

## 2. Alur Tahapan Absensi (Step-by-Step)

### Tahap 1: Inisialisasi Lokasi & Geofencing (Sisi Flutter)
1. Saat siswa membuka halaman Absensi, Flutter melakukan *request* ke API Backend untuk mengambil data sekolah:
   * Titik Koordinat Pusat (Latitude & Longitude).
   * Batas Radius yang diizinkan (misal: `50` meter).
2. Flutter menyalakan modul GPS *smartphone* untuk mendapatkan koordinat lokasi siswa saat ini secara *real-time*.
3. Flutter menghitung jarak antara lokasi siswa dengan lokasi sekolah secara lokal.
4. **Logika UI:**
   * Jika Jarak `>` Radius: Tombol Kamera **dikunci** (warna abu-abu) dan muncul peringatan *"Anda berada di luar area sekolah"*.
   * Jika Jarak `<=` Radius: Tombol Kamera **dibuka** (aktif) dan siswa diizinkan mengambil foto.

### Tahap 2: Ekstraksi Face Embedding (Sisi Flutter)
1. Siswa menekan tombol kamera dan melakukan swafoto (*selfie*).
2. Aplikasi Flutter (menggunakan model TFLite seperti MobileFaceNet) memproses foto tersebut secara *offline* di HP siswa.
3. Model AI membuang gambar visualnya dan hanya menghasilkan **Face Embedding** (Array berisi 128 atau 512 angka desimal).
4. Flutter merakit *payload* JSON untuk dikirim ke *server*, berisi:
   * `id_siswa`
   * `face_embedding` (Array Wajah)
   * `lat_absen` & `lon_absen` (Koordinat saat menekan tombol)

### Tahap 3: Validasi & Penyimpanan (Sisi Express.js Backend)
1. *Backend* menerima *request* dari Flutter.
2. **Validasi Wajah:** *Backend* mengambil `face_model` (embedding asli yang terdaftar) milik `id_siswa` tersebut dari *database* PostgreSQL.
3. *Backend* menghitung jarak kemiripan (*Euclidean Distance*) antara *embedding* dari Flutter dengan *embedding* di *database*.
   * Jika jarak `< 0.4` (Threshold): Wajah Cocok.
   * Jika jarak `>= 0.4`: Wajah Tidak Dikenali, proses absensi ditolak.
4. **Validasi Lokasi Berlapis (Keamanan):** Meskipun Flutter sudah mengecek lokasi, *Backend* (menggunakan Knex.js & PostGIS) wajib mengecek ulang `lat_absen` & `lon_absen` terhadap `titik_koordinat` sekolah di *database* untuk mencegah siswa mengakali aplikasi dengan aplikasi *Fake GPS* yang dimodifikasi.
5. **Simpan ke Database:** Jika wajah cocok dan lokasi valid, *Backend* mencatat jam masuk/pulang ke tabel `absensi`.
6. *Backend* mengirimkan respons sukses dan memicu fitur *Push Notification* (Tabel `notifikasi`).

---

## 3. Kebutuhan Stack & Library

### Mobile (Flutter)
* `geolocator`: Untuk mendapatkan titik koordinat *real-time* perangkat.
* `tflite_flutter`: Untuk menjalankan model *Face Recognition* (misal: MobileFaceNet.tflite) secara lokal.
* `image_picker` / `camera`: Untuk menangkap foto *selfie*.

### Server (Express.js)
* `knex` & `pg`: Untuk mengeksekusi operasi Geodatabase (PostGIS) dan menyimpan data.
* `prisma`: Mengelola skema dan tabel *database*.
* (Catatan: *Backend* **tidak membutuhkan** library pengolah gambar seperti *canvas* atau *face-api.js*, karena menerima data wajah sudah dalam bentuk teks angka).