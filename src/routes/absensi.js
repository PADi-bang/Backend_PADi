const express = require('express');
const router = express.Router();
const prisma = require('../db'); // Menggunakan instance prisma dari db.js sesuai auth.js
const { Prisma } = require('@prisma/client'); // [PERBAIKAN] Impor 'Prisma' untuk query tagged template

/**
 * Menormalisasi vektor ke dalam satuan skala yang seragam (L2 Normalization).
 * @param {number[]} vector - Vektor embedding mentah.
 * @returns {number[]} Vektor yang telah dinormalisasi.
 */
function l2Normalize(vector) {
  const sum = vector.reduce((acc, val) => acc + val * val, 0);
  const magnitude = Math.sqrt(sum);
  if (magnitude === 0) return vector; // Cegah pembagian dengan nol
  return vector.map(val => val / magnitude);
}

/**
 * Menghitung jarak Euclidean antara dua vektor (face embedding).
 * Sesuai konsep "Validasi Wajah" di absen.md dengan tambahan L2 Normalization.
 * @param {number[]} vec1 - Vektor embedding dari Flutter.
 * @param {number[]} vec2 - Vektor embedding dari database.
 * @returns {number} Jarak Euclidean yang ternormalisasi.
 */
function calculateEuclideanDistance(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    throw new Error("Vektor embedding tidak valid atau dimensinya tidak cocok.");
  }

  // [PERBAIKAN] Normalisasikan kedua vektor terlebih dahulu sebelum dihitung selisihnya
  const norm1 = l2Normalize(vec1);
  const norm2 = l2Normalize(vec2);

  let sum = 0;
  for (let i = 0; i < norm1.length; i++) {
    sum += (norm1[i] - norm2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// POST /api/absensi/masuk
// Endpoint utama untuk alur absensi sesuai dokumen absen.md
router.post('/masuk', async (req, res) => {
  const { userId, faceEmbedding, latitude, longitude, fotoMasuk } = req.body; 

  // [PERBAIKAN MINOR] Tambahkan !fotoMasuk untuk memastikan gambar bukti tidak kosong
  if (!userId || !faceEmbedding || latitude === undefined || longitude === undefined || !fotoMasuk) {
    return res.status(400).json({ status: 'error', message: 'Data tidak lengkap: userId, faceEmbedding, latitude, longitude, dan fotoMasuk wajib diisi.' });
  }

  try {
    // --- Tahap 1: Ambil data siswa dan sekolah dari Database ---
    const siswa = await prisma.siswa.findUnique({ 
      where: { userId: parseInt(userId) },
      include: { sekolah: true } 
    });

    if (!siswa) {
      return res.status(404).json({ status: 'error', message: 'Profil siswa untuk user ini tidak ditemukan.' });
    }
    if (!siswa.faceModel) {
      return res.status(400).json({ status: 'error', message: 'Siswa ini belum mendaftarkan data wajah (face model).' });
    }
    if (!siswa.sekolah) {
        return res.status(404).json({ status: 'error', message: 'Data sekolah untuk siswa ini tidak ditemukan.' });
    }

    // --- Tahap 2: Validasi Wajah (Backend) ---
    const storedEmbedding = JSON.parse(siswa.faceModel); 
    const distance = calculateEuclideanDistance(faceEmbedding, storedEmbedding);
    const FACE_RECOGNITION_THRESHOLD = 0.8; // Nilai 0.6 sekarang akan menjadi sangat akurat setelah L2 Norm aktif

    if (distance > FACE_RECOGNITION_THRESHOLD) {
      return res.status(401).json({ status: 'error', message: `Wajah tidak dikenali. (Jarak: ${distance.toFixed(2)})` });
    }

    // --- Tahap 3: Validasi Lokasi Berlapis (Geofencing di Backend) ---
    const locationCheckResult = await prisma.$queryRaw`
        SELECT ST_Covers(
            area_sekolah, 
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as "isWithinArea"
        FROM sekolah WHERE id_sekolah = ${siswa.sekolahId}
    `;

    if (!locationCheckResult || !Array.isArray(locationCheckResult) || locationCheckResult.length === 0) {
        console.error("Query Geofencing PostGIS tidak mengembalikan hasil yang valid untuk sekolahId:", siswa.sekolahId);
        return res.status(500).json({ status: 'error', message: 'Gagal memvalidasi lokasi sekolah. Data sekolah mungkin tidak lengkap.' });
    }

    if (!locationCheckResult[0]?.isWithinArea) {
        return res.status(403).json({ status: 'error', message: 'Anda berada di luar area sekolah yang diizinkan.' });
    }

    // --- Tahap 4: Validasi Jadwal Absensi ---
    // Mengunci waktu saat ini ke WIB (Asia/Jakarta) untuk menghindari bug shift hari di server UTC
    const now = new Date(); // Waktu UTC saat ini, untuk disimpan ke DB
    const nowWIBString = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const nowWIB = new Date(nowWIBString);
    
    const dayOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][nowWIB.getDay()];
    
    const jadwal = await prisma.jadwalAbsensi.findFirst({
        where: {
            sekolahId: siswa.sekolahId,
            hari: dayOfWeek,
            isLibur: false
        }
    });

    if (!jadwal) {
        return res.status(404).json({ status: 'error', message: `Tidak ada jadwal absensi aktif untuk hari ${dayOfWeek}.` });
    }

    // Buat batas awal hari ini (00:00:00 WIB) yang aman untuk server UTC
    const year = nowWIB.getFullYear();
    const month = String(nowWIB.getMonth() + 1).padStart(2, '0');
    const day = String(nowWIB.getDate()).padStart(2, '0');
    // ISO string dengan offset +07:00 (WIB)
    const todayStart = new Date(`${year}-${month}-${day}T00:00:00+07:00`); 

    const existingAbsensi = await prisma.absensi.findFirst({
        where: {
            siswaId: siswa.id,
            tanggal: { gte: todayStart }, // `tanggal` di DB adalah UTC, `todayStart` juga dikonversi ke UTC oleh Prisma
            jamMasuk: { not: null }
        }
    });

    if (existingAbsensi) {
        return res.status(409).json({ status: 'error', message: 'Anda sudah melakukan absensi masuk hari ini.' });
    }

    // --- Tahap 5: Tentukan Status & Simpan Absensi ke Database ---
    // [SOLUSI] Konversi ke Menit Absolut untuk perbandingan waktu yang aman dari zona waktu.

    // 1. Gunakan `nowWIB` dari Tahap 4 untuk mendapatkan jam dan menit
    const jamSekarang = nowWIB.getHours();
    const menitSekarang = nowWIB.getMinutes();
    
    // Ubah jadi total menit dari tengah malam (misal 07:15 = (7 * 60) + 15 = 435)
    const totalMenitSekarang = (jamSekarang * 60) + menitSekarang;

    // 2. Ekstrak jadwal batas dari database Prisma
    const jamMasukFinishDb = new Date(jadwal.jamMasukFinish);
    
    // CATATAN: Gunakan getUTCHours() karena Prisma membaca tipe Time dari DB sebagai UTC.
    // Jam 07:00:00 di DB akan menjadi objek Date dengan waktu 07:00:00 UTC.
    const jamBatas = jamMasukFinishDb.getUTCHours(); 
    const menitBatas = jamMasukFinishDb.getUTCMinutes();
    
    const totalMenitBatas = (jamBatas * 60) + menitBatas;

    // 3. Bandingkan nilainya secara matematis murni
    const status = totalMenitSekarang <= totalMenitBatas ? 'Hadir' : 'Telat';

    let keterangan;
    if (status === 'Telat') {
      const menitTelat = totalMenitSekarang - totalMenitBatas;
      if (menitTelat >= 60) {
        const jam = Math.floor(menitTelat / 60);
        const menit = menitTelat % 60;
        keterangan = `Telat ${jam} jam`;
        if (menit > 0) {
          keterangan += ` ${menit} menit`;
        }
      } else {
        keterangan = `Telat ${menitTelat} menit`;
      }
    } else {
      keterangan = '-';
    }
    
    // 4. Lanjutkan eksekusi insert geospasial
    const result = await prisma.$queryRaw(Prisma.sql`
      INSERT INTO absensi (id_siswa, id_jadwal, tanggal, jam_masuk, status, keterangan, koordinat_masuk, foto_masuk)
      VALUES (${siswa.id}, ${jadwal.id}, ${now}, ${now}, ${status}::"AbsensiStatus", ${keterangan}, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), ${fotoMasuk})
      RETURNING
        id_absensi,
        id_siswa,
        id_jadwal,
        tanggal,
        jam_masuk,
        jam_pulang,
        status,
        keterangan,
        foto_masuk,
        foto_pulang,
        ST_AsGeoJSON(koordinat_masuk) as koordinat_masuk;
    `);

    const absensiBaru = result[0];
    res.status(201).json({
      status: 'success',
      message: `Absensi berhasil! Status Anda: ${status}`,
      data: absensiBaru
    });

  } catch (err) {
    console.error("Error pada alur absensi:", err);
    if (err instanceof SyntaxError) {
        return res.status(400).json({ status: 'error', message: 'Format faceModel di database atau faceEmbedding dari request tidak valid (bukan JSON array).' });
    }
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server.' });
  }
});

// POST /api/absensi/pulang
// Endpoint untuk siswa melakukan absensi pulang.
router.post('/pulang', async (req, res) => {
  // Terima semua data yang dibutuhkan dari Flutter
  const { userId, faceEmbedding, latitude, longitude, fotoPulang } = req.body;

  // 1. Validasi data input dasar
  if (!userId || !faceEmbedding || latitude === undefined || longitude === undefined || !fotoPulang) {
    return res.status(400).json({ status: 'error', message: 'Data tidak lengkap: userId, faceEmbedding, lokasi, dan fotoPulang wajib diisi.' });
  }

  try {
    // 2. Ambil data siswa dan sekolah (sama seperti absen masuk)
    const siswa = await prisma.siswa.findUnique({ 
      where: { userId: parseInt(userId) },
      include: { sekolah: true } 
    });

    if (!siswa) {
      return res.status(404).json({ status: 'error', message: 'Profil siswa untuk user ini tidak ditemukan.' });
    }
    if (!siswa.faceModel) {
      return res.status(400).json({ status: 'error', message: 'Siswa ini belum mendaftarkan data wajah (face model).' });
    }

    // 3. Validasi Wajah (sama seperti absen masuk)
    const storedEmbedding = JSON.parse(siswa.faceModel); 
    const distance = calculateEuclideanDistance(faceEmbedding, storedEmbedding);
    const FACE_RECOGNITION_THRESHOLD = 0.8;

    if (distance > FACE_RECOGNITION_THRESHOLD) {
      return res.status(401).json({ status: 'error', message: `Wajah tidak dikenali. (Jarak: ${distance.toFixed(2)})` });
    }

    // 4. Validasi Lokasi Berlapis (Geofencing, sama seperti absen masuk)
    const locationCheckResult = await prisma.$queryRaw`
        SELECT ST_Covers(
            area_sekolah, 
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as "isWithinArea"
        FROM sekolah WHERE id_sekolah = ${siswa.sekolahId}
    `;

    if (!locationCheckResult?.[0]?.isWithinArea) {
        return res.status(403).json({ status: 'error', message: 'Anda berada di luar area sekolah yang diizinkan untuk absen pulang.' });
    }

    // --- INI BAGIAN YANG BERBEDA DARI ABSEN MASUK ---
    // 5. Cari data absensi masuk hari ini yang belum ada jam pulangnya
    
    // Mengunci waktu ke WIB untuk mencari data hari ini, menghindari bug shift hari di server UTC
    const nowWIBString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const nowWIB = new Date(nowWIBString);
    
    const year = nowWIB.getFullYear();
    const month = String(nowWIB.getMonth() + 1).padStart(2, '0');
    const day = String(nowWIB.getDate()).padStart(2, '0');
    const todayStart = new Date(`${year}-${month}-${day}T00:00:00+07:00`);

    const absensiHariIni = await prisma.absensi.findFirst({
        where: {
            siswaId: siswa.id,
            tanggal: { gte: todayStart }, // `tanggal` di DB adalah UTC, `todayStart` juga dikonversi ke UTC oleh Prisma
            jamMasuk: { not: null }, // Pastikan sudah absen masuk
            jamPulang: null          // Dan belum absen pulang
        }
    });

    if (!absensiHariIni) {
        return res.status(404).json({ status: 'error', message: 'Anda belum melakukan absensi masuk hari ini atau sudah pernah absen pulang.' });
    }

    // 6. Update data absensi dengan jam pulang, foto, dan koordinat
    const now = new Date();
    const result = await prisma.$queryRaw(Prisma.sql`
      UPDATE absensi
      SET 
        jam_pulang = ${now},
        foto_pulang = ${fotoPulang},
        koordinat_pulang = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
      WHERE id_absensi = ${absensiHariIni.id}
      RETURNING
        id_absensi,
        jam_pulang,
        foto_pulang,
        ST_AsGeoJSON(koordinat_pulang) as koordinat_pulang;
    `);

    const absensiUpdated = result[0];
    res.status(200).json({
      status: 'success',
      message: 'Absensi pulang berhasil!',
      data: absensiUpdated
    });

  } catch (err) {
    console.error("Error pada alur absensi pulang:", err);
    if (err instanceof SyntaxError) {
        return res.status(400).json({ status: 'error', message: 'Format faceModel di database atau faceEmbedding dari request tidak valid.' });
    }
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server.' });
  }
});

module.exports = router;