const express = require('express');
const router = express.Router();
const prisma = require('../db'); 
const { Prisma } = require('@prisma/client'); 

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

// POST /api/absensi/masuk
router.post('/masuk', async (req, res) => {
  const { userId, faceEmbedding, latitude, longitude, fotoMasuk } = req.body; 

  if (!userId || !faceEmbedding || latitude === undefined || longitude === undefined || !fotoMasuk) {
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
    const distance = calculateEuclideanDistance(faceEmbedding, storedEmbedding);
    const FACE_RECOGNITION_THRESHOLD = 0.8; 

    if (distance > FACE_RECOGNITION_THRESHOLD) {
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
        return res.status(500).json({ status: 'error', message: 'Gagal memvalidasi lokasi sekolah.' });
    }
    if (!locationCheckResult[0]?.isWithinArea) {
        return res.status(403).json({ status: 'error', message: 'Anda berada di luar area sekolah.' });
    }

    // Mengunci waktu saat ini ke WIB murni
    const now = new Date(); 
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const nowWIB = new Date(utcTime + (3600000 * 7)); 
    
    const dayOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][nowWIB.getDay()];
    
    const jadwal = await prisma.jadwalAbsensi.findFirst({
        where: { sekolahId: siswa.sekolahId, hari: dayOfWeek, isLibur: false }
    });

    if (!jadwal) return res.status(404).json({ status: 'error', message: `Tidak ada jadwal aktif untuk hari ${dayOfWeek}.` });

    // Membangun batas deteksi hari ini murni berdasarkan kalender WIB
    const year = nowWIB.getFullYear();
    const month = String(nowWIB.getMonth() + 1).padStart(2, '0');
    const day = String(nowWIB.getDate()).padStart(2, '0');
    
    const todayStart = new Date(`${year}-${month}-${day}T00:00:00+07:00`);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const existingAbsensi = await prisma.absensi.findFirst({
        where: {
            siswaId: siswa.id,
            tanggal: { gte: todayStart, lt: tomorrowStart },
            jamMasuk: { not: null }
        }
    });

    if (existingAbsensi) {
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
    const tanggalWIBString = `${year}-${month}-${day}`;

    const result = await prisma.$queryRaw(Prisma.sql`
      INSERT INTO absensi (id_siswa, id_jadwal, tanggal, jam_masuk, status, keterangan, koordinat_masuk, foto_masuk)
      VALUES (${siswa.id}, ${jadwal.id}, ${tanggalWIBString}::date, ${waktuWIBString}::time, ${status}::"AbsensiStatus", ${keterangan}, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), ${fotoMasuk})
      RETURNING
        id_absensi, id_siswa, id_jadwal, tanggal, jam_masuk, jam_pulang, status, keterangan, foto_masuk, foto_pulang,
        ST_AsGeoJSON(koordinat_masuk) as koordinat_masuk;
    `);

    const absensiBaru = result[0];
    res.status(201).json({ status: 'success', message: `Absensi berhasil! Status: ${status}`, data: absensiBaru });

  } catch (err) {
    console.error("Error alur absensi masuk:", err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server.' });
  }
});

// POST /api/absensi/pulang
router.post('/pulang', async (req, res) => {
  const { userId, faceEmbedding, latitude, longitude, fotoPulang } = req.body;

  if (!userId || !faceEmbedding || latitude === undefined || longitude === undefined || !fotoPulang) {
    return res.status(400).json({ status: 'error', message: 'Data tidak lengkap.' });
  }

  try {
    const siswa = await prisma.siswa.findUnique({ 
      where: { userId: parseInt(userId) },
      include: { sekolah: true } 
    });

    if (!siswa) return res.status(404).json({ status: 'error', message: 'Profil siswa tidak ditemukan.' });
    if (!siswa.faceModel) return res.status(400).json({ status: 'error', message: 'Belum mendaftarkan wajah.' });

    const storedEmbedding = JSON.parse(siswa.faceModel); 
    const distance = calculateEuclideanDistance(faceEmbedding, storedEmbedding);
    if (distance > 0.8) return res.status(401).json({ status: 'error', message: `Wajah tidak dikenali.` });

    const locationCheckResult = await prisma.$queryRaw`
        SELECT ST_Covers(
            area_sekolah, 
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as "isWithinArea"
        FROM sekolah WHERE id_sekolah = ${siswa.sekolahId}
    `;

    if (!locationCheckResult?.[0]?.isWithinArea) {
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
        SELECT id_absensi as id 
        FROM absensi 
        WHERE id_siswa = ${siswa.id} 
          AND tanggal = ${tanggalWIBString}::date 
          AND jam_masuk IS NOT NULL 
          AND jam_pulang IS NULL 
        LIMIT 1
    `);

    if (!cariAbsensi || cariAbsensi.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Anda belum melakukan absensi masuk hari ini atau sudah pernah absen pulang.' });
    }

    const absensiHariIni = cariAbsensi[0];

    // Merakit string jam kepulangan statis (WIB)
    const jamSekarang = nowWIB.getHours();
    const menitSekarang = nowWIB.getMinutes();
    const detikSekarang = nowWIB.getSeconds();
    
    const strJam = String(jamSekarang).padStart(2, '0');
    const strMenit = String(menitSekarang).padStart(2, '0');
    const strDetik = String(detikSekarang).padStart(2, '0');
    const waktuWIBString = `${strJam}:${strMenit}:${strDetik}`;

    const result = await prisma.$queryRaw(Prisma.sql`
      UPDATE absensi
      SET 
        jam_pulang = ${waktuWIBString}::time,
        foto_pulang = ${fotoPulang},
        koordinat_pulang = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
      WHERE id_absensi = ${absensiHariIni.id}
      RETURNING
        id_absensi, jam_pulang, foto_pulang,
        ST_AsGeoJSON(koordinat_pulang) as koordinat_pulang;
    `);

    res.status(200).json({ status: 'success', message: 'Absensi pulang berhasil!', data: result[0] });

  } catch (err) {
    console.error("Error alur absensi pulang:", err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server.' });
  }
});

module.exports = router;