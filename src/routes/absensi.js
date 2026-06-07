const express = require('express');
const router = express.Router();
const prisma = require('../db'); // Menggunakan instance prisma dari db.js sesuai auth.js

/**
 * Menghitung jarak Euclidean antara dua vektor (face embedding).
 * Sesuai konsep "Validasi Wajah" di absen.md.
 * @param {number[]} vec1 - Vektor embedding dari Flutter.
 * @param {number[]} vec2 - Vektor embedding dari database.
 * @returns {number} Jarak Euclidean.
 */
function calculateEuclideanDistance(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    throw new Error("Vektor embedding tidak valid atau dimensinya tidak cocok.");
  }
  let sum = 0;
  for (let i = 0; i < vec1.length; i++) {
    sum += (vec1[i] - vec2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// POST /api/absensi/masuk
// Endpoint utama untuk alur absensi sesuai dokumen absen.md
router.post('/masuk', async (req, res) => {
  const { siswaId, faceEmbedding, latitude, longitude } = req.body;

  if (!siswaId || !faceEmbedding || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ status: 'error', message: 'Data tidak lengkap: siswaId, faceEmbedding, latitude, dan longitude wajib diisi.' });
  }

  try {
    // --- Tahap 1: Ambil data siswa dan sekolah dari Database ---
    const siswa = await prisma.siswa.findUnique({
      where: { id: parseInt(siswaId) },
      include: { sekolah: true } // Sertakan data sekolah untuk geofencing
    });

    if (!siswa) {
      return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan.' });
    }
    if (!siswa.faceModel) {
      return res.status(400).json({ status: 'error', message: 'Siswa ini belum mendaftarkan data wajah (face model).' });
    }
    if (!siswa.sekolah) {
        return res.status(404).json({ status: 'error', message: 'Data sekolah untuk siswa ini tidak ditemukan.' });
    }

    // --- Tahap 2: Validasi Wajah (Backend) ---
    const storedEmbedding = JSON.parse(siswa.faceModel); // Asumsi face_model di DB adalah JSON string array
    const distance = calculateEuclideanDistance(faceEmbedding, storedEmbedding);
    const FACE_RECOGNITION_THRESHOLD = 0.6; // Threshold bisa disesuaikan, semakin kecil semakin ketat

    if (distance > FACE_RECOGNITION_THRESHOLD) {
      return res.status(401).json({ status: 'error', message: `Wajah tidak dikenali. (Jarak: ${distance.toFixed(2)})` });
    }

    // --- Tahap 3: Validasi Lokasi Berlapis (Geofencing di Backend) ---
    // Menggunakan PostGIS via Prisma Raw Query untuk mencegah Fake GPS
    const locationCheckResult = await prisma.$queryRaw`
        SELECT ST_DWithin(
            titik_koordinat,
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
            radius_meter
        ) as "isWithinRadius"
        FROM sekolah WHERE id_sekolah = ${siswa.sekolahId}
    `;

    if (!locationCheckResult[0]?.isWithinRadius) {
        return res.status(403).json({ status: 'error', message: 'Anda berada di luar radius sekolah yang diizinkan.' });
    }

    // --- Tahap 4: Validasi Jadwal Absensi ---
    const now = new Date();
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
    // Menggabungkan tanggal hari ini dengan jam dari database untuk perbandingan
    const jamMasukFinishString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${jadwal.jamMasukFinish}`;
    const jamMasukFinish = new Date(jamMasukFinishString);
    const status = now <= jamMasukFinish ? 'Hadir' : 'Telat';

    // Format data titik koordinat untuk PostGIS.
    // CATATAN: Fitur ini memerlukan 'postgis' di dalam previewFeatures di schema.prisma
    const koordinatMasukPoint = { type: 'Point', coordinates: [longitude, latitude] };

    const absensiBaru = await prisma.absensi.create({
        data: {
            siswaId: siswa.id,
            jadwalId: jadwal.id,
            tanggal: now,
            jamMasuk: now,
            koordinatMasuk: koordinatMasukPoint,
            // fotoMasuk: 'URL/path_to_photo', // Perlu logic upload file terpisah
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