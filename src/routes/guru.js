const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// GET /api/guru/dashboard/:userId
router.get('/dashboard/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

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
    const month = String(nowWIB.getMonth() + 1).padStart(2, '0');
    const day = String(nowWIB.getDate()).padStart(2, '0');
    
    const todayStartWIB = new Date(`${year}-${month}-${day}T00:00:00+07:00`);
    const tomorrowStartWIB = new Date(todayStartWIB);
    tomorrowStartWIB.setDate(tomorrowStartWIB.getDate() + 1);

    const absensiHariIni = await prisma.absensi.findMany({
      where: {
        tanggal: { gte: todayStartWIB, lt: tomorrowStartWIB }
      },
      include: { siswa: true } // Tarik identitas siswanya
    const hariIni = new Date();
    hariIni.setHours(0, 0, 0, 0); 
    const besok = new Date(hariIni);
    besok.setDate(besok.getDate() + 1);

    const semuaSiswa = await prisma.siswa.findMany();

    const absensiHariIni = await prisma.absensi.findMany({
      where: { tanggal: { gte: hariIni, lt: besok } }
    });

    // [PERBAIKAN] Logika filter tanggal diperlebar agar tidak meleset karena zona waktu
    const izinHariIni = await prisma.perizinan.findMany({
        where: {
            status: 'Disetujui',
            tanggalMulai: { lt: besok }, // Izin dimulai sebelum besok
            tanggalSelesai: { gte: hariIni } // Izin selesai setelah hari ini dimulai
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

    const jadwalMengajar = [
      { kelas: "XII RPL 1", waktu: "07:00 WIB", mapel: "Pemrograman Web", isDark: true },
      { kelas: "XII RPL 2", waktu: "10:00 WIB", mapel: "Basis Data", isDark: false }
    ];

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
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
  }
});

module.exports = router;