const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// GET /api/guru/dashboard/:userId
router.get('/dashboard/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // 1. Cari Identitas Guru
    const guru = await prisma.guru.findUnique({ where: { userId: userId } });
    if (!guru) {
      return res.status(404).json({ status: 'error', message: 'Data profil guru tidak ditemukan' });
    }

    // 2. Hitung Berapa Surat Izin Siswa yang Masih "Pending"
    const izinPending = await prisma.perizinan.findMany({
      where: { status: 'Pending' },
      include: { siswa: true } // Tarik juga data nama siswanya
    });

    // 3. Ambil Rekap Absensi Siswa HARI INI
    const hariIni = new Date();
    hariIni.setHours(0, 0, 0, 0); // Mulai dari jam 00:00
    const besok = new Date(hariIni);
    besok.setDate(besok.getDate() + 1); // Sampai besok jam 00:00

    const absensiHariIni = await prisma.absensi.findMany({
      where: {
        tanggal: { gte: hariIni, lt: besok }
      },
      include: { siswa: true } // Tarik identitas siswanya
    });

    // 4. Hitung Persentase Kehadiran Kelas Hari Ini
    const totalAbsen = absensiHariIni.length;
    const totalHadir = absensiHariIni.filter(a => a.status === 'Hadir' || a.status === 'Telat').length;
    const persentase = totalAbsen > 0 ? Math.round((totalHadir / totalAbsen) * 100) : 0;

    // 5. Data Jadwal Mengajar 
    // (Karena di database belum ada relasi detail jam mengajar guru, kita buat data dinamis yang bisa diatur)
    const jadwalMengajar = [
      { kelas: "XII RPL 1", waktu: "07:00 WIB", mapel: "Pemrograman Web", isDark: true },
      { kelas: "XII RPL 2", waktu: "10:00 WIB", mapel: "Basis Data", isDark: false }
    ];

    // Kirim semua data ke Flutter
    res.status(200).json({
      status: 'success',
      data: {
        jumlahIzinPending: izinPending.length,
        persentaseKehadiranKelas: persentase,
        rekapAbsensiKelas: absensiHariIni,
        jadwalMengajar: jadwalMengajar
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
  }
});

module.exports = router;