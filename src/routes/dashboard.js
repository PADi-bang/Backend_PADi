const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// GET /api/dashboard/:userId
// Mengambil data statistik kehadiran dan riwayat berdasarkan ID Akun (User)
router.get('/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // 1. Cari Profil Siswa dari ID User yang sedang login
    // Ingat: Akun (User) dan Profil (Siswa) beda tabel di database Anda!
    const siswa = await prisma.siswa.findUnique({
      where: { userId: userId }
    });

    if (!siswa) {
      return res.status(404).json({ status: 'error', message: 'Data profil siswa tidak ditemukan' });
    }

    const idSiswa = siswa.id;

    // 2. Menghitung Statistik Bulan Ini
    const hariIni = new Date();
    const awalBulan = new Date(hariIni.getFullYear(), hariIni.getMonth(), 1);
    const akhirBulan = new Date(hariIni.getFullYear(), hariIni.getMonth() + 1, 0);

    // Ambil semua data absensi di bulan berjalan
    const absensiBulanIni = await prisma.absensi.findMany({
      where: {
        siswaId: idSiswa,
        tanggal: {
          gte: awalBulan,
          lte: akhirBulan
        }
      }
    });

    const totalHariAktif = absensiBulanIni.length;
    // Siswa dihitung hadir jika statusnya "Hadir" atau "Telat"
    const jumlahHadir = absensiBulanIni.filter(a => a.status === 'Hadir' || a.status === 'Telat').length;
    
    // Mencegah error pembagian dengan nol (0) jika data bulan ini kosong
    const persentase = totalHariAktif > 0 ? Math.round((jumlahHadir / totalHariAktif) * 100) : 0;

    // 3. Ambil 5 Riwayat Absensi Terakhir
    const riwayatAbsensi = await prisma.absensi.findMany({
      where: { siswaId: idSiswa },
      orderBy: { tanggal: 'desc' },
      take: 5
    });

    // 4. Ambil 5 Riwayat Perizinan Terakhir
    const riwayatPerizinan = await prisma.perizinan.findMany({
      where: { siswaId: idSiswa },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // 5. Kirim semua data yang sudah dibungkus ke Flutter
    res.status(200).json({
      status: 'success',
      data: {
        hadirBulanIni: jumlahHadir,
        persentaseKehadiran: persentase,
        riwayatAbsensi: riwayatAbsensi,
        riwayatPerizinan: riwayatPerizinan
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
  }
});

module.exports = router;