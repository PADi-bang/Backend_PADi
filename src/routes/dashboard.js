const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ==========================================
// 1. RUTE WEB ADMIN (Harus di atas)
// GET /api/dashboard/stats
// ==========================================
router.get('/stats', async (req, res) => {
  try {
      const totalAdmin = await prisma.user.count({ where: { roleId: 1 } });
      const totalGuru = await prisma.user.count({ where: { roleId: 2 } });
      const totalSiswa = await prisma.user.count({ where: { roleId: 3 } });

      const attendanceWeekly = [totalSiswa * 0.8, totalSiswa * 0.85, totalSiswa * 0.9, totalSiswa * 0.88, totalSiswa * 0.95, totalSiswa * 0.92, totalSiswa * 0.9];
      const statusChart = [85, 10, 5]; 

      // === LOGIKA DINAMIS: TARIK SISWA BERMASALAH HARI INI ===
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // Tarik siswa yang Alpha atau Telat hari ini
      const absensiBermasalah = await prisma.absensi.findMany({
          where: {
              tanggal: { gte: startOfDay },
              status: { in: ['Alpha', 'Telat'] }
          },
          include: { siswa: true },
          take: 2, 
          orderBy: { id: 'desc' }
      });

      // Tarik siswa yang sedang Izin/Sakit hari ini
      const perizinanHariIni = await prisma.perizinan.findMany({
          where: {
              tanggalMulai: { lte: new Date() },
              tanggalSelesai: { gte: startOfDay },
              status: 'Disetujui'
          },
          include: { siswa: true },
          take: 1, 
          orderBy: { id: 'desc' }
      });

      let siswaPerluPerhatian = [];

      absensiBermasalah.forEach(a => {
          if (a.siswa) {
              siswaPerluPerhatian.push({
                  nama: a.siswa.namaLengkap,
                  inisial: a.siswa.namaLengkap.substring(0, 2).toUpperCase(),
                  statusText: a.status === 'Alpha' ? 'Alpha (Tanpa Keterangan)' : 'Terlambat Masuk',
                  theme: a.status === 'Alpha' ? 'red' : 'orange'
              });
          }
      });

      perizinanHariIni.forEach(p => {
          if (p.siswa) {
              siswaPerluPerhatian.push({
                  nama: p.siswa.namaLengkap,
                  inisial: p.siswa.namaLengkap.substring(0, 2).toUpperCase(),
                  statusText: p.jenisIzin === 'Sakit' ? 'Izin (Sakit)' : 'Izin (Kepentingan)',
                  theme: 'blue'
              });
          }
      });

      res.status(200).json({
          status: 'success',
          data: {
              totalSiswa,
              totalGuru,
              totalAdmin,
              attendanceWeekly,
              statusChart,
              siswaPerluPerhatian // Kirim data dinamis ke EJS
          }
      });
  } catch (err) {
      console.error("Error API Stats:", err.message);
      res.status(500).json({ status: 'error', message: 'Gagal mengambil statistik Web Admin' });
  }
});

// ==========================================
// 2. RUTE FLUTTER SISWA (KODE ASLI ANDA - TIDAK DIUBAH)
// GET /api/dashboard/:userId
// ==========================================
router.get('/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    const siswa = await prisma.siswa.findUnique({
      where: { userId: userId }
    });

    if (!siswa) {
      return res.status(404).json({ status: 'error', message: 'Data profil siswa tidak ditemukan' });
    }

    const idSiswa = siswa.id;

    const hariIni = new Date();
    const awalBulan = new Date(hariIni.getFullYear(), hariIni.getMonth(), 1);
    const akhirBulan = new Date(hariIni.getFullYear(), hariIni.getMonth() + 1, 0);

    const absensiBulanIni = await prisma.absensi.findMany({
      where: {
        siswaId: idSiswa,
        tanggal: { gte: awalBulan, lte: akhirBulan }
      }
    });

    const totalHariAktif = absensiBulanIni.length;
    const jumlahHadir = absensiBulanIni.filter(a => a.status === 'Hadir' || a.status === 'Telat').length;
    const persentase = totalHariAktif > 0 ? Math.round((jumlahHadir / totalHariAktif) * 100) : 0;

    const riwayatAbsensi = await prisma.absensi.findMany({
      where: { siswaId: idSiswa },
      orderBy: { tanggal: 'desc' },
      take: 5
    });

    const riwayatPerizinan = await prisma.perizinan.findMany({
      where: { siswaId: idSiswa },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

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