const express = require('express');
const router = express.Router();
const prisma = require('../db'); 
const { Prisma } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;


/**
 * Menormalisasi vektor ke dalam satuan skala yang seragam (L2 Normalization).
 */
function l2Normalize(vector) {
  const sum = vector.reduce((acc, val) => acc + val * val, 0);
  const magnitude = Math.sqrt(sum);
  if (magnitude === 0) return vector; 
  return vector.map(val => val / magnitude);
}

/**
 * Menghitung jarak Euclidean antara dua vektor (face embedding).
 */
function calculateEuclideanDistance(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    throw new Error("Vektor embedding tidak valid atau dimensinya tidak cocok.");
  }
  const norm1 = l2Normalize(vec1);
  const norm2 = l2Normalize(vec2);
  let sum = 0;
  for (let i = 0; i < norm1.length; i++) {
    sum += (norm1[i] - norm2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// [BARU] Konfigurasi Multer untuk menangani unggahan foto absensi
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // [DIUBAH] Tentukan subfolder berdasarkan endpoint yang diakses
        const subfolder = req.path.includes('/masuk') ? 'foto_masuk' : 'foto_pulang';
        const dir = path.join('uploads', 'foto_absen', subfolder);

        fs.mkdir(dir, { recursive: true })
            .then(() => cb(null, dir))
            .catch(err => cb(err));
    },
    filename: function (req, file, cb) {
        // Nama file sementara, akan diganti di dalam logika route
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    // [REKOMENDASI] Batasi ukuran file maksimal 2MB
    limits: { fileSize: 2 * 1024 * 1024 } 
});

// POST /api/absensi/masuk
router.post('/masuk', upload.single('fotoMasuk'), async (req, res) => {
  // [DIUBAH] 'fotoMasuk' sekarang ada di req.file, sisanya di req.body
  const { userId, faceEmbedding: faceEmbeddingJson, latitude, longitude } = req.body; 

  if (!userId || !faceEmbeddingJson || latitude === undefined || longitude === undefined || !req.file) {
    return res.status(400).json({ status: 'error', message: 'Data tidak lengkap: userId, faceEmbedding, latitude, longitude, dan fotoMasuk wajib diisi.' });
  }

  try {
    const siswa = await prisma.siswa.findUnique({ 
      where: { userId: parseInt(userId) },
      include: { sekolah: true } 
    });

    if (!siswa) return res.status(404).json({ status: 'error', message: 'Profil siswa tidak ditemukan.' });
    if (!siswa.faceModel) return res.status(400).json({ status: 'error', message: 'Belum mendaftarkan data wajah.' });
    if (!siswa.sekolah) return res.status(404).json({ status: 'error', message: 'Data sekolah tidak ditemukan.' });

    const storedEmbedding = JSON.parse(siswa.faceModel);
    const faceEmbedding = JSON.parse(faceEmbeddingJson); // [DIUBAH] Parse JSON string dari form-data
    const distance = calculateEuclideanDistance(faceEmbedding, storedEmbedding);
    const FACE_RECOGNITION_THRESHOLD = 0.8; 

    if (distance > FACE_RECOGNITION_THRESHOLD) {
      // [PENTING] Hapus file sampah karena absensi dibatalkan
      if (req.file) await fs.unlink(req.file.path).catch(err => console.error("Gagal hapus file sampah (wajah):", err));
      return res.status(401).json({ status: 'error', message: `Wajah tidak dikenali. (Jarak: ${distance.toFixed(2)})` });
    }

    const locationCheckResult = await prisma.$queryRaw`
        SELECT ST_Covers(
            area_sekolah, 
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as "isWithinArea"
        FROM sekolah WHERE id_sekolah = ${siswa.sekolahId}
    `;

    if (!locationCheckResult || !Array.isArray(locationCheckResult) || locationCheckResult.length === 0) {
        // [PENTING] Hapus file sampah karena validasi gagal di server
        if (req.file) await fs.unlink(req.file.path).catch(err => console.error("Gagal hapus file sampah (validasi lokasi):", err));
        return res.status(500).json({ status: 'error', message: 'Gagal memvalidasi lokasi sekolah.' });
    }
    if (!locationCheckResult[0]?.isWithinArea) {
        // [PENTING] Hapus file sampah karena absensi dibatalkan
        if (req.file) await fs.unlink(req.file.path).catch(err => console.error("Gagal hapus file sampah (luar area):", err));
        return res.status(403).json({ status: 'error', message: 'Anda berada di luar area sekolah.' });
    }

    // Mengunci waktu saat ini ke WIB murni
    const now = new Date(); 
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const nowWIB = new Date(utcTime + (3600000 * 7)); 
    
    // Membangun batas deteksi hari ini murni berdasarkan kalender WIB
    const year = nowWIB.getFullYear();
    const month = String(nowWIB.getMonth() + 1).padStart(2, '0');
    const day = String(nowWIB.getDate()).padStart(2, '0');

    const todayStart = new Date(`${year}-${month}-${day}T00:00:00+07:00`);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // Tahap 4: Validasi Jadwal Absensi
    const dayOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][nowWIB.getDay()];
    
    // Ambil HANYA jadwal yang saat ini sedang DIAKTIFKAN oleh admin
    const jadwal = await prisma.jadwalAbsensi.findFirst({
        where: {
            sekolahId: siswa.sekolahId,
            isActive: true
        }
    });

    if (!jadwal) return res.status(404).json({ status: 'error', message: `Belum ada jadwal yang diaktifkan oleh Admin.` });
    if (jadwal.isLibur) return res.status(403).json({ status: 'error', message: `Hari ini ditetapkan sebagai hari libur oleh Admin.` });

    let berlakuHariIni = false;
    
    if (jadwal.tanggal && jadwal.tanggal.length > 0) {
        // Jika ini jadwal khusus, cek apakah tanggal hari ini ada di dalam array tanggal yang diset
        const isTodayInTanggal = jadwal.tanggal.some(d => {
            const dateObj = new Date(d);
            return dateObj.getFullYear() === year && 
                   String(dateObj.getMonth() + 1).padStart(2, '0') === month && 
                   String(dateObj.getDate()).padStart(2, '0') === day;
        });
        if (isTodayInTanggal) berlakuHariIni = true;
    } else {
        // Jika ini jadwal reguler, cek apakah hari ini (Senin, Selasa, dst) ada di dalam pengaturan jadwal
        if (jadwal.hari && jadwal.hari.includes(dayOfWeek)) {
            berlakuHariIni = true;
        }
    }

    if (!berlakuHariIni) {
        // [PENTING] Hapus file sampah
        if (req.file) await fs.unlink(req.file.path).catch(err => console.error("Gagal hapus file sampah:", err));
        return res.status(404).json({ status: 'error', message: `Jadwal aktif saat ini ('${jadwal.namaJadwal}') tidak berlaku untuk hari ini.` });
    }

    // [PERBAIKAN] Gunakan Raw Query untuk mengecek absensi yang sudah ada.
    // Ini untuk menghindari masalah timezone antara Prisma ORM (DateTime) dan PostgreSQL (Date).
    // Logika ini sekarang konsisten dengan cara data dimasukkan dan cara endpoint /pulang bekerja.
    const tanggalWIBString = `${year}-${month}-${day}`;
    const existingAbsensi = await prisma.$queryRaw(Prisma.sql`
        SELECT id_absensi 
        FROM absensi 
        WHERE id_siswa = ${siswa.id} 
          AND tanggal = ${tanggalWIBString}::date 
          AND jam_masuk IS NOT NULL
    `);

    if (existingAbsensi && existingAbsensi.length > 0) {
        // [PENTING] Hapus file sampah karena absensi dibatalkan
        if (req.file) await fs.unlink(req.file.path).catch(err => console.error("Gagal hapus file sampah (duplikat):", err));
        return res.status(409).json({ status: 'error', message: 'Anda sudah melakukan absensi masuk hari ini.' });
    }

    // Perhitungan waktu absen siswa saat ini (WIB)
    const jamSekarang = nowWIB.getHours();
    const menitSekarang = nowWIB.getMinutes();
    const detikSekarang = nowWIB.getSeconds();
    const totalMenitSekarang = (jamSekarang * 60) + menitSekarang;

    // Karena jadwal.jamMasukFinish bertipe TIME, Prisma membacanya sebagai objek Date tahun 1970 UTC.
    // Kita WAJIB mengekstraknya menggunakan getUTCHours() agar nilainya tetap murni "07:15"
    const jamMasukFinishDb = new Date(jadwal.jamMasukFinish);
    const jamBatas = jamMasukFinishDb.getUTCHours(); 
    const menitBatas = jamMasukFinishDb.getUTCMinutes();
    const totalMenitBatas = (jamBatas * 60) + menitBatas;

    const status = totalMenitSekarang <= totalMenitBatas ? 'Hadir' : 'Telat';

    let keterangan = '-';
    if (status === 'Telat') {
      const menitTelat = totalMenitSekarang - totalMenitBatas;
      if (menitTelat >= 60) {
        const jam = Math.floor(menitTelat / 60);
        const menit = menitTelat % 60;
        keterangan = `Telat ${jam} jam${menit > 0 ? ` ${menit} menit` : ''}`;
      } else {
        keterangan = `Telat ${menitTelat} menit`;
      }
    }
    
    // Merakit teks jam dan tanggal secara manual agar PostgreSQL menerima data statis murni tanpa Timezone Bleed
    const strJam = String(jamSekarang).padStart(2, '0');
    const strMenit = String(menitSekarang).padStart(2, '0');
    const strDetik = String(detikSekarang).padStart(2, '0');
    const waktuWIBString = `${strJam}:${strMenit}:${strDetik}`; 

    // [BARU] Proses rename file dan siapkan path untuk disimpan ke DB
    const baseName = `${siswa.namaLengkap}_Masuk_${tanggalWIBString}`
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '');
    const uniqueSuffix = Date.now();
    const fileExtension = path.extname(req.file.originalname);
    const finalFileName = `${baseName}_${uniqueSuffix}${fileExtension}`;

    const oldPath = req.file.path;
    const newPath = path.join(req.file.destination, finalFileName);
    await fs.rename(oldPath, newPath);

    // [PERBAIKAN] Ambil path relatif terhadap folder uploads, lalu tambahkan prefix /uploads/
    const relativePath = path.relative('uploads', newPath).replace(/\\/g, '/');
    const fotoMasukPath = `/uploads/${relativePath}`;

    const result = await prisma.$queryRaw(Prisma.sql`
      INSERT INTO absensi (id_siswa, id_jadwal, tanggal, jam_masuk, status, keterangan, koordinat_masuk, foto_masuk)
      VALUES (${siswa.id}, ${jadwal.id}, ${tanggalWIBString}::date, ${waktuWIBString}::time, ${status}::"AbsensiStatus", ${keterangan}, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), ${fotoMasukPath})
      RETURNING
        id_absensi, id_siswa, id_jadwal, tanggal, jam_masuk, jam_pulang, status, keterangan, foto_masuk, foto_pulang,
        ST_AsGeoJSON(koordinat_masuk) as koordinat_masuk;
    `);

    const absensiBaru = result[0];
    res.status(201).json({ status: 'success', message: `Absensi berhasil! Status: ${status}`, data: absensiBaru });

  } catch (err) {
    console.error("Error alur absensi masuk:", err);
    // [PENTING] Hapus file jika ada error tak terduga setelah upload
    if (req.file) await fs.unlink(req.file.path).catch(e => console.error("Gagal hapus file sampah di catch block (masuk):", e));
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server.' });
  }
});

// POST /api/absensi/pulang
router.post('/pulang', upload.single('fotoPulang'), async (req, res) => {
  const { userId, faceEmbedding: faceEmbeddingJson, latitude, longitude } = req.body;

  if (!userId || !faceEmbeddingJson || latitude === undefined || longitude === undefined || !req.file) {
    return res.status(400).json({ status: 'error', message: 'Data tidak lengkap: userId, faceEmbedding, latitude, longitude, dan fotoPulang wajib diisi.' });
  }

  try {
    const siswa = await prisma.siswa.findUnique({ 
      where: { userId: parseInt(userId) },
      include: { sekolah: true } 
    });

    if (!siswa) return res.status(404).json({ status: 'error', message: 'Profil siswa tidak ditemukan.' });
    if (!siswa.faceModel) return res.status(400).json({ status: 'error', message: 'Belum mendaftarkan wajah.' });

    const storedEmbedding = JSON.parse(siswa.faceModel);
    const faceEmbedding = JSON.parse(faceEmbeddingJson); // [DIUBAH] Parse JSON string dari form-data
    const distance = calculateEuclideanDistance(faceEmbedding, storedEmbedding);
    if (distance > 0.8) {
      if (req.file) await fs.unlink(req.file.path).catch(err => console.error("Gagal hapus file sampah (wajah):", err));
      return res.status(401).json({ status: 'error', message: `Wajah tidak dikenali.` });
    }

    const locationCheckResult = await prisma.$queryRaw`
        SELECT ST_Covers(
            area_sekolah, 
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as "isWithinArea"
        FROM sekolah WHERE id_sekolah = ${siswa.sekolahId}
    `;

    if (!locationCheckResult?.[0]?.isWithinArea) {
        if (req.file) await fs.unlink(req.file.path).catch(err => console.error("Gagal hapus file sampah (luar area):", err));
        return res.status(403).json({ status: 'error', message: 'Anda berada di luar area sekolah.' });
    }

    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const nowWIB = new Date(utcTime + (3600000 * 7));
    
    const year = nowWIB.getFullYear();
    const month = String(nowWIB.getMonth() + 1).padStart(2, '0');
    const day = String(nowWIB.getDate()).padStart(2, '0');
    
    // [PERBAIKAN FINAL] Kita merakit string tanggal dan mencarinya menggunakan Raw SQL murni
    const tanggalWIBString = `${year}-${month}-${day}`;

    const cariAbsensi = await prisma.$queryRaw(Prisma.sql`
        SELECT id_absensi as id, id_jadwal
        FROM absensi 
        WHERE id_siswa = ${siswa.id} 
          AND tanggal = ${tanggalWIBString}::date 
          AND jam_masuk IS NOT NULL 
          AND jam_pulang IS NULL 
        LIMIT 1
    `);

    if (!cariAbsensi || cariAbsensi.length === 0) {
        if (req.file) await fs.unlink(req.file.path).catch(err => console.error("Gagal hapus file sampah (absen masuk tidak ada):", err));
        return res.status(404).json({ status: 'error', message: 'Anda belum melakukan absensi masuk hari ini atau sudah pernah absen pulang.' });
    }

    const absensiHariIni = cariAbsensi[0];

    // --- [BARU] VALIDASI BELUM WAKTUNYA PULANG ---
    // 1. Ambil data jadwal absensi yang digunakan saat absen masuk pagi tadi
    const jadwal = await prisma.jadwalAbsensi.findUnique({
        where: { id: absensiHariIni.id_jadwal } // Kita ambil ID jadwal dari data absen masuk
    });

    if (jadwal && jadwal.jamPulang) {
        // Konversi jam pulang dari database ke total menit (Sama seperti logika absen masuk)
        const jamPulangDb = new Date(jadwal.jamPulang);
        const batasJamPulang = jamPulangDb.getUTCHours(); 
        const batasMenitPulang = jamPulangDb.getUTCMinutes();
        const totalMenitBatasPulang = (batasJamPulang * 60) + batasMenitPulang;

        // Hitung waktu sekarang
        const jamSekarang = nowWIB.getHours();
        const menitSekarang = nowWIB.getMinutes();
        const totalMenitSekarang = (jamSekarang * 60) + menitSekarang;

        // Jika waktu sekarang masih kurang dari batas jam pulang, tolak!
        if (totalMenitSekarang < totalMenitBatasPulang) {
            // Opsional: Buat pesan yang rapi (misal: "Belum waktunya pulang. Jadwal pulang: 15:00")
            const strBatasJam = String(batasJamPulang).padStart(2, '0');
            const strBatasMenit = String(batasMenitPulang).padStart(2, '0');
            
            // [PENTING] Hapus file sampah karena absensi dibatalkan
            if (req.file) await fs.unlink(req.file.path).catch(err => console.error("Gagal hapus file sampah (belum waktu pulang):", err));
            return res.status(403).json({ 
                status: 'error', 
                message: `Belum waktunya pulang. Jadwal kepulangan hari ini adalah pukul ${strBatasJam}:${strBatasMenit} WIB.` 
            });
        }
    }
    // --- [SELESAI VALIDASI WAKTU PULANG] ---

    // Merakit string jam kepulangan statis (WIB)
    const jamSekarang = nowWIB.getHours();
    const menitSekarang = nowWIB.getMinutes();
    const detikSekarang = nowWIB.getSeconds();
    
    const strJam = String(jamSekarang).padStart(2, '0');
    const strMenit = String(menitSekarang).padStart(2, '0');
    const strDetik = String(detikSekarang).padStart(2, '0');
    const waktuWIBString = `${strJam}:${strMenit}:${strDetik}`;

    // [BARU] Proses rename file dan siapkan path untuk disimpan ke DB
    const baseName = `${siswa.namaLengkap}_Pulang_${tanggalWIBString}`
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '');
    const uniqueSuffix = Date.now();
    const fileExtension = path.extname(req.file.originalname);
    const finalFileName = `${baseName}_${uniqueSuffix}${fileExtension}`;

    const oldPath = req.file.path;
    const newPath = path.join(req.file.destination, finalFileName);
    await fs.rename(oldPath, newPath);

    // [PERBAIKAN] Ambil path relatif terhadap folder uploads, lalu tambahkan prefix /uploads/
    const relativePath = path.relative('uploads', newPath).replace(/\\/g, '/');
    const fotoPulangPath = `/uploads/${relativePath}`;

    const result = await prisma.$queryRaw(Prisma.sql`
      UPDATE absensi
      SET 
        jam_pulang = ${waktuWIBString}::time,
        foto_pulang = ${fotoPulangPath},
        koordinat_pulang = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
      WHERE id_absensi = ${absensiHariIni.id}
      RETURNING
        id_absensi, jam_pulang, foto_pulang,
        ST_AsGeoJSON(koordinat_pulang) as koordinat_pulang;
    `);

    res.status(200).json({ status: 'success', message: 'Absensi pulang berhasil!', data: result[0] });

  } catch (err) {
    console.error("Error alur absensi pulang:", err);
    // [PENTING] Hapus file jika ada error tak terduga setelah upload
    if (req.file) await fs.unlink(req.file.path).catch(e => console.error("Gagal hapus file sampah di catch block (pulang):", e));
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server.' });
  }
});

module.exports = router;