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
      include: { siswa: true } 
    });

    // 3. Ambil Rekap Absensi Siswa HARI INI (Semua Siswa Terdaftar)
    const hariIni = new Date();
    hariIni.setHours(0, 0, 0, 0); 
    const besok = new Date(hariIni);
    besok.setDate(besok.getDate() + 1);

    // Tarik SEMUA siswa untuk ditampilkan di rekap
    const semuaSiswa = await prisma.siswa.findMany();

    const absensiHariIni = await prisma.absensi.findMany({
      where: {
        tanggal: { gte: hariIni, lt: besok }
      }
    });

    // Gabungkan data: Jika siswa tidak ada di absensiHariIni, berarti dia Alpha
    let rekapAbsensiKelas = semuaSiswa.map(siswa => {
        const absenSiswa = absensiHariIni.find(a => a.siswaId === siswa.id);
        return {
            id: siswa.id,
            nama: siswa.namaLengkap,
            nis: siswa.nis,
            status: absenSiswa ? absenSiswa.status : 'Alpa', // Sesuai label di frontend
            jamMasuk: absenSiswa ? absenSiswa.jamMasuk : null
        };
    });

    // 4. Hitung Persentase Kehadiran Kelas Hari Ini berdasarkan seluruh siswa
    const totalSiswa = semuaSiswa.length;
    const totalHadir = rekapAbsensiKelas.filter(a => a.status === 'Hadir' || a.status === 'Telat').length;
    const persentase = totalSiswa > 0 ? Math.round((totalHadir / totalSiswa) * 100) : 0;

    // 5. Data Jadwal Mengajar (Dipertahankan dari kode Anda)
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
        rekapAbsensiKelas: rekapAbsensiKelas, 
        jadwalMengajar: jadwalMengajar
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
  }
});

module.exports = router;