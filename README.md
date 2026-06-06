# App_PADi - Backend & Database

Selamat datang di repositori **Backend & Database App_PADi (Platform Absensi Digital)**. Dokumen ini disusun untuk membantu pengerjaan sisi server, pengelolaan API, serta manajemen database menggunakan Node.js, Express, dan Prisma ORM dengan PostgreSQL.

---

## 📖 Deskripsi Proyek (Backend)

Repositori ini bertugas sebagai penyedia layanan REST API yang menangani seluruh logika bisnis, otentikasi data pengguna, manajemen sesi, dan manipulasi database untuk aplikasi App_PADi.

### Teknologi yang Digunakan

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database Client (ORM):** Prisma ORM
- **Database Engine:** PostgreSQL

---

## 📁 Struktur Direktori Backend

Penting untuk mengetahui di mana letak file yang harus dikerjakan agar struktur kode tetap rapi:

```text
backend/
├── prisma/                  # 🗄️ Path Database (skema tabel & migrasi)
│   ├── schema.prisma        # -> File skema utama database
│   └── migrations/          # -> History perubahan struktur tabel
├── src/                     # 💻 Path Backend utama (logika, rute API)
│   ├── app.js               # -> Inisialisasi Express & registrasi rute
│   ├── config/              # -> Konfigurasi sistem (database client, dll)
│   ├── middleware/          # -> Validasi & proteksi keamanan (JWT)
│   └── routes/              # -> Tempat membuat file endpoint API
├── index.js                 # 🚀 Entry point utama untuk menjalankan server
├── init-db.js               # 🌱 Script inisialisasi data dummy / seed awal
└── .env                     # 🔒 Berisi variabel rahasia (Database URL & JWT Secret)
```

---

## 🗄️ 1. Alur Pengerjaan Database (Prisma ORM & PostgreSQL)

**Path Utama:** `backend/prisma/schema.prisma`

Bagian ini dikerjakan oleh tim database atau saat ada penambahan fitur yang membutuhkan kolom/tabel baru (contoh: tabel `Presensi`).

### Langkah Pengerjaan (Step-by-Step):

1. Buka file `backend/prisma/schema.prisma`.
2. Tambahkan model (tabel) baru atau ubah relasi sesuai kebutuhan tim.
3. Buka terminal di folder `backend/`, lalu jalankan migrasi untuk memperbarui database lokal masing-masing:

```bash
npx prisma migrate dev --name <nama_perubahan>

```

4. Jalankan perintah `npx prisma generate` agar Prisma Client mengenali struktur tabel yang baru di dalam kode Node.js.
5. Jika membutuhkan data bawaan awal (seperti akun admin default), jalankan skrip inisialisasi data:

```bash
node init-db.js

```

### Contoh Kode (`schema.prisma`):

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Contoh model tabel Presensi
model Presensi {
  id        Int      @id @default(autoincrement())
  userId    Int
  waktu     DateTime @default(now())
  status    String   // "Hadir", "Izin", "Sakit"
  lokasi    String?  // Koordinat GPS
}

```

---

## ⚙️ 2. Alur Pengerjaan Backend (Node.js + Express)

**Path Utama:** `backend/src/routes/` dan `backend/src/app.js`

Bagian ini fokus pada pembuatan rute API (endpoint) yang nantinya akan dipanggil oleh aplikasi mobile (frontend).

### Langkah Pengerjaan (Step-by-Step):

1. Pastikan dependensi sudah terinstal. Masuk folder `backend/` lalu jalankan:

```bash
npm install

```

2. Salin atau buat file `.env` di direktori utama backend, pastikan konfigurasi variabel rahasia sudah terisi:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/app_padi?schema=public"
JWT_SECRET="rahasia_super_aman"

```

3. Buat file baru di `backend/src/routes/` untuk endpoint baru Anda (misal: `presensi.js`).
4. Tulis logika penanganan request menggunakan Express dan Prisma Client.
5. Daftarkan file rute tersebut di `backend/src/app.js` agar bisa diakses publik.
6. Untuk endpoint privat, bungkus rute menggunakan middleware yang ada di `backend/src/middleware/auth.js`.
7. Jalankan server lokal untuk uji coba:

```bash
node index.js

```

### Contoh Kode API (`backend/src/routes/presensi.js`):

```javascript
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Endpoint mencatat kehadiran (POST /api/presensi)
router.post("/", async (req, res) => {
  try {
    const { userId, status, lokasi } = req.body;

    const presensiBaru = await prisma.presensi.create({
      data: { userId, status, lokasi },
    });

    res.status(201).json({
      success: true,
      message: "Presensi berhasil disimpan!",
      data: presensiBaru,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Terjadi kesalahan pada server" });
  }
});

module.exports = router;
```

---

## 🤝 Alur Git & Branching Tim Backend & Database

Sesuai kesepakatan bersama kelompok agar tidak bentrok kode (_merge conflict_):

- **Branch Pengerjaan:** Selalu gunakan branch `backend-dev` atau `database-dev` sesuai tugas divisimu. Jangan _commit_ langsung ke `main`.
- **Workflow harian:**

```bash
git checkout backend-dev
git pull origin backend-dev
# ... lakukan coding di folder masing-masing ...
git add .
git commit -m "feat(backend): membuat endpoint presensi masuk"
git push origin backend-dev

```

---

## ⚠️ Aturan Penting Tim Backend & Database

1. Selalu lakukan `git pull` sebelum membuat perubahan baru.
2. JANGAN PERNAH _commit_ dan _push_ file `.env` ke GitHub (pastikan `.env` sudah masuk di dalam file `.gitignore`).
3. Selalu diskusikan perubahan struktur tabel (`schema.prisma`) dengan anggota tim lain sebelum melakukan migrasi.

---

## ✅ Checklist Backend & Database

- [ ] Setup file `.env` dengan PostgreSQL lokal
- [ ] Jalankan `npx prisma migrate dev` sukses
- [ ] Endpoint REST API Otentikasi (`auth.js`)
- [ ] Endpoint REST API Kehadiran (`presensi.js`)
- [ ] Proteksi Route dengan JWT Middleware
