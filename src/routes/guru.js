const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const verifyToken = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/guru/dashboard/:userId
router.get('/dashboard/:userId', verifyToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Keamanan: Cek apakah user yang request sesuai dengan ID token (atau memiliki role Admin)
    if (req.user.id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ status: 'error', message: 'Akses ditolak: Anda tidak memiliki izin untuk melihat dashboard ini.' });
    }

    const guru = await prisma.guru.findUnique({ where: { userId: userId } });
    if (!guru) return res.status(404).json({ status: 'error', message: 'Data profil guru tidak ditemukan' });

    const izinPending = await prisma.perizinan.findMany({
      where: { status: 'Pending' },
      include: { siswa: true } 
    });

    // 3. Ambil Rekap Absensi Siswa HARI INI
    // [PERBAIKAN] Menggunakan zona waktu WIB untuk konsistensi data
    const nowWIBString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const nowWIB = new Date(nowWIBString);

    const year = nowWIB.getFullYear();
    const month = nowWIB.getMonth();
    const day = nowWIB.getDate();
    
    // Gunakan UTC Date agar sesuai dengan format Prisma @db.Date
    const todayStartWIB = new Date(Date.UTC(year, month, day));
    const tomorrowStartWIB = new Date(Date.UTC(year, month, day + 1));

    const absensiHariIni = await prisma.absensi.findMany({
      where: {
        tanggal: { gte: todayStartWIB, lt: tomorrowStartWIB }
      },
      include: { siswa: true } // Tarik identitas siswanya
    });

    const semuaSiswa = await prisma.siswa.findMany();

    // [PERBAIKAN] Logika filter tanggal diperlebar agar tidak meleset karena zona waktu
    const izinHariIni = await prisma.perizinan.findMany({
        where: {
            status: 'Disetujui',
            tanggalMulai: { lt: tomorrowStartWIB }, // Izin dimulai sebelum besok
            tanggalSelesai: { gte: todayStartWIB } // Izin selesai setelah hari ini dimulai
        }
    });

    // Gabungkan Absensi dan Izin
    let rekapAbsensiKelas = semuaSiswa.map(siswa => {
        const absenSiswa = absensiHariIni.find(a => a.siswaId === siswa.id);
        const izinSiswa = izinHariIni.find(p => p.siswaId === siswa.id);

        let statusSiswa = 'Alpa';
        let keterangan = null;

        if (absenSiswa) {
            statusSiswa = absenSiswa.status;
        } else if (izinSiswa) {
            statusSiswa = izinSiswa.jenisIzin === 'Sakit' ? 'Sakit' : 'Izin';
            keterangan = izinSiswa.alasan;
        }

        return {
            id: siswa.id,
            nama: siswa.namaLengkap,
            nis: siswa.nis,
            status: statusSiswa,
            jamMasuk: absenSiswa ? absenSiswa.jamMasuk : null,
            keterangan: keterangan
        };
    });

    const totalSiswa = semuaSiswa.length;
    const totalHadir = rekapAbsensiKelas.filter(a => a.status === 'Hadir' || a.status === 'Telat').length;
    const persentase = totalSiswa > 0 ? Math.round((totalHadir / totalSiswa) * 100) : 0;

    const jadwalAktif = await prisma.jadwalAbsensi.findMany({
      where: { isActive: true },
      select: {
        id: true,
        namaJadwal: true,
        jamMasukStart: true,
        jamMasukFinish: true,
        jamPulang: true,
        isLibur: true
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        jumlahIzinPending: izinPending.length,
        persentaseKehadiranKelas: persentase,
        rekapAbsensiKelas: rekapAbsensiKelas, 
        jadwalAktif: jadwalAktif
      }
    });

  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
  }
});

module.exports = router;