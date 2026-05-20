# Dokumentasi Skema Database: Proyek Absensi Digital (PBL 2026)

## 1. Autentikasi & Pengguna (User Management)
> Kelompok tabel ini mengurus hak akses dan detail profil setiap aktor yang ada di dalam aplikasi.

### Tabel `role`
> Menyimpan jenis hak akses pengguna.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_role` | INT | **Primary Key** |
| `nama_role` | VARCHAR | Nama peran (misal: Admin, Guru, Siswa) |

### Tabel `user`
> Tabel pusat untuk login (credential) semua jenis pengguna.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_user` | INT | **Primary Key** |
| `id_role` | INT | Foreign Key → `role(id_role)` |
| `username` | VARCHAR | Username untuk login |
| `password` | VARCHAR | Kata sandi pengguna |
| `email` | VARCHAR | Alamat email |
| `fcm_token` | VARCHAR | Untuk keperluan Push Notification |

### Tabel `admin`
> Profil untuk pengguna dengan hak akses admin sekolah.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_admin` | INT | **Primary Key** |
| `id_user` | INT | Foreign Key → `user(id_user)` |
| `id_sekolah` | INT | Foreign Key → `sekolah(id_sekolah)` |
| `nama_admin` | VARCHAR | Nama lengkap admin |

### Tabel `guru`
> Profil untuk tenaga pendidik / guru.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_guru` | INT | **Primary Key** |
| `id_user` | INT | Foreign Key → `user(id_user)` |
| `id_sekolah` | INT | Foreign Key → `sekolah(id_sekolah)` |
| `nama_lengkap` | VARCHAR | Nama lengkap guru |
| `NIP` | VARCHAR | Nomor Induk Pegawai |

### Tabel `siswa`
> Profil untuk peserta didik, dilengkapi dengan data biometrik untuk fitur absensi.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_siswa` | INT | **Primary Key** |
| `id_user` | INT | Foreign Key → `user(id_user)` |
| `id_sekolah` | INT | Foreign Key → `sekolah(id_sekolah)` |
| `nama_lengkap` | VARCHAR | Nama lengkap siswa |
| `NIS` | VARCHAR | Nomor Induk Siswa |
| `face_model` | TEXT | Data model wajah untuk deteksi Face Recognition |

---

## 2. Master Data Institusi & Akademik
> Kelompok tabel ini menyimpan data statis terkait sekolah, pembagian kelas, dan kalender akademik.

### Tabel `sekolah`
> Menyimpan informasi instansi beserta titik koordinat untuk pembatasan geofencing absensi.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_sekolah` | INT | **Primary Key** |
| `nama_sekolah` | VARCHAR | Nama instansi |
| `alamat` | TEXT | Alamat lengkap instansi |
| `radius_meter` | INT | Batas jarak absensi yang diizinkan (dalam meter) |
| `titik_koordinat` | GEOGRAPHY(Point, 4326) | Titik koordinat instansi dalam format spasial PostGIS |

### Tabel `master_kelas`
> Menyimpan nama-nama rombongan belajar.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_kelas` | INT | **Primary Key** |
| `id_sekolah` | INT | Foreign Key → `sekolah(id_sekolah)` |
| `nama_kelas` | VARCHAR | Contoh: A, B, C, atau X IPA 1 |

### Tabel `master_angkatan`
> Menyimpan tahun masuk atau tingkatan kelas.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_angkatan` | INT | **Primary Key** |
| `id_sekolah` | INT | Foreign Key → `sekolah(id_sekolah)` |
| `nomor_angkatan` | VARCHAR | Contoh: 1, 2, 3 (Kelas 10,11,12) atau 2024 |

### Tabel `master_tahun_akademik`
> Menyimpan periode akademik yang sedang berjalan.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_tahun_akademik` | INT | **Primary Key** |
| `id_sekolah` | INT | Foreign Key → `sekolah(id_sekolah)` |
| `tahun_ajaran` | VARCHAR | Contoh: 2025/2026 |
| `semester` | VARCHAR | Ganjil / Genap |
| `is_active` | BOOLEAN | Indikator tahun ajaran yang sedang berjalan |

---

## 3. Relasi / Enrolment (Penempatan)
> Tabel pivot ini menghubungkan entitas Siswa dan Guru dengan Kelas tertentu pada Tahun Akademik tertentu.

### Tabel `enrolment_kelas`
> Tabel yang merakit/menggabungkan Kelas, Angkatan, dan Tahun Akademik menjadi satu rombongan belajar yang utuh.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_enrolment_kelas` | INT | **Primary Key** |
| `id_sekolah` | INT | Foreign Key → `sekolah(id_sekolah)` |
| `id_kelas` | INT | Foreign Key → `master_kelas(id_kelas)` |
| `id_angkatan` | INT | Foreign Key → `master_angkatan(id_angkatan)` |
| `id_tahun_akademik` | INT | Foreign Key → `master_tahun_akademik(id_tahun_akademik)` |
| `keterangan` | VARCHAR | Hasil Gabungan: Kelas A + Angkatan 1 + Tahun 2026 |

### Tabel `enrolment_siswa`
> Menempatkan siswa ke dalam rombongan belajar tertentu.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_enrolment_siswa` | INT | **Primary Key** |
| `id_siswa` | INT | Foreign Key → `siswa(id_siswa)` |
| `id_enrolment_kelas` | INT | Foreign Key → `enrolment_kelas(id_enrolment_kelas)` (Rombel yang dimasuki) |
| `is_active` | BOOLEAN | `True` jika ini adalah kelas aktifnya sekarang |

### Tabel `enrolment_guru`
> Menempatkan guru sebagai wali kelas/pengajar di rombongan belajar tertentu.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_enrolment_guru` | INT | **Primary Key** |
| `id_guru` | INT | Foreign Key → `guru(id_guru)` |
| `id_enrolment_kelas` | INT | Foreign Key → `enrolment_kelas(id_enrolment_kelas)` (Wali di rombel mana) |
| `is_active` | BOOLEAN | `True` jika sedang menjabat |

---

## 4. Transaksi Operasional Aplikasi
> Tabel yang akan paling sering bertambah datanya setiap hari, mencakup absensi, izin, dan notifikasi.

### Tabel `jadwal_absensi`
> Aturan waktu absensi harian yang berlaku di sekolah.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_jadwal` | INT | **Primary Key** |
| `id_sekolah` | INT | Foreign Key → `sekolah(id_sekolah)` |
| `nama_jadwal` | VARCHAR | Nama sesi absensi |
| `hari` | VARCHAR | Hari berlakunya jadwal |
| `tanggal` | DATE | Tanggal spesifik jadwal |
| `jam_masuk_start` | TIME | Waktu awal mulai absensi masuk |
| `jam_masuk_finish` | TIME | Batas akhir absensi masuk (sebelum dianggap telat) |
| `jam_pulang` | TIME | Waktu absensi pulang |
| `is_libur` | BOOLEAN | Indikator hari libur |

### Tabel `absensi`
> Data log harian hasil rekaman kehadiran siswa.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_absensi` | INT | **Primary Key** |
| `id_siswa` | INT | Foreign Key → `siswa(id_siswa)` |
| `id_jadwal` | INT | Foreign Key → `jadwal_absensi(id_jadwal)` |
| `tanggal` | DATE | Tanggal pencatatan absensi |
| `jam_masuk` | TIME | Jam aktual siswa melakukan check-in |
| `jam_pulang` | TIME | Jam aktual siswa melakukan check-out |
| `koordinat_masuk` | GEOGRAPHY(Point, 4326) | Titik koordinat saat check-in dalam format spasial PostGIS |
| `koordinat_pulang` | GEOGRAPHY(Point, 4326) | Titik koordinat saat check-out dalam format spasial PostGIS |
| `foto_masuk` | VARCHAR | URL/Path bukti foto check-in |
| `foto_pulang` | VARCHAR | URL/Path bukti foto check-out |
| `status` | VARCHAR | Status kehadiran (Hadir, Telat, Alpha, dll) |
| `keterangan` | TEXT | Catatan tambahan |

### Tabel `perizinan`
> Mencatat pengajuan izin atau sakit dari siswa.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_perizinan` | INT | **Primary Key** |
| `id_siswa` | INT | Foreign Key → `siswa(id_siswa)` |
| `tanggal_mulai` | DATE | Tanggal awal izin |
| `tanggal_selesai` | DATE | Tanggal akhir izin |
| `jenis_izin` | VARCHAR | Tipe izin (Sakit / Kepentingan) |
| `alasan` | TEXT | Detail alasan izin |
| `file_bukti` | VARCHAR | URL/Path dokumen bukti (surat dokter, dll) |
| `status` | VARCHAR | Status persetujuan (Pending, Disetujui, Ditolak) |
| `disetujui_oleh` | INT | Foreign Key → `guru(id_guru)` (Guru yang menyetujui) |
| `created_at` | TIMESTAMP | Waktu pengajuan dibuat |

### Tabel `notifikasi`
> Log pemberitahuan (push notification) yang dikirim ke aplikasi pengguna.

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id_notifikasi` | INT | **Primary Key** |
| `id_user` | INT | Foreign Key → `user(id_user)` |
| `judul` | VARCHAR | Judul pemberitahuan |
| `tipe` | VARCHAR | Kategori notifikasi (Sistem, Pengingat, Peringatan) |
| `isi_pesan` | TEXT | Detail pesan notifikasi |
| `is_read` | BOOLEAN | Indikator apakah sudah dibaca |
| `created_at` | TIMESTAMP | Waktu notifikasi dibuat |