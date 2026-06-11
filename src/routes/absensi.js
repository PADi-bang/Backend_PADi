const express = require('express');
const router = express.Router();
const prisma = require('../db'); // Menggunakan instance prisma dari db.js sesuai auth.js

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
  const { userId, faceEmbedding, latitude, longitude } = req.body; 

  if (!userId || !faceEmbedding || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ status: 'error', message: 'Data tidak lengkap: userId, faceEmbedding, latitude, dan longitude wajib diisi.' });
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
    const FACE_RECOGNITION_THRESHOLD = 0.6; // Nilai 0.6 sekarang akan menjadi sangat akurat setelah L2 Norm aktif

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
    const now = new Date();
    // Penting: Server diasumsikan berjalan di zona waktu yang sama dengan sekolah (misal: WIB/Asia/Jakarta).
    // Jika tidak, penentuan 'dayOfWeek' bisa salah di sekitar jam tengah malam.
    const dayOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][now.getDay()];
    
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

    // Cek apakah sudah pernah absen masuk hari ini untuk mencegah data ganda
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existingAbsensi = await prisma.absensi.findFirst({
        where: {
            siswaId: siswa.id,
            tanggal: { gte: todayStart },
            jamMasuk: { not: null }
        }
    });

    if (existingAbsensi) {
        return res.status(409).json({ status: 'error', message: 'Anda sudah melakukan absensi masuk hari ini.' });
    }

    // --- Tahap 5: Tentukan Status & Simpan Absensi ke Database ---
    // [PERBAIKAN ZONA WAKTU] Logika penentuan status 'Telat' dibuat lebih aman.
    // Ini membuat objek Date untuk batas waktu absensi PADA HARI INI,
    // menggunakan waktu dari jadwal dan tanggal dari saat ini.
    const jamMasukFinishDb = new Date(jadwal.jamMasukFinish);
    const deadlineAbsen = new Date(); // Mengambil tanggal & waktu saat ini
    
    // Atur jam, menit, dan detik pada 'deadlineAbsen' agar sesuai dengan jadwal,
    // dengan mengabaikan tanggal yang tersimpan di database.
    deadlineAbsen.setHours(jamMasukFinishDb.getHours());
    deadlineAbsen.setMinutes(jamMasukFinishDb.getMinutes());
    deadlineAbsen.setSeconds(0); // Detik bisa di-nol-kan untuk toleransi
    deadlineAbsen.setMilliseconds(0);

    const status = now <= deadlineAbsen ? 'Hadir' : 'Telat';

    const koordinatMasukPoint = { type: 'Point', coordinates: [longitude, latitude] };

    const absensiBaru = await prisma.absensi.create({
        data: {
            siswaId: siswa.id,
            jadwalId: jadwal.id,
            tanggal: now,
            jamMasuk: now,
            koordinatMasuk: koordinatMasukPoint,
            status: status,
            keterangan: `Absen masuk via aplikasi mobile terdeteksi ${status}.`
        }
    });

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

module.exports = router;