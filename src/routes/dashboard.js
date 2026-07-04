const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const verifyToken = require('../middleware/auth');

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

      // === LOGIKA DINAMIS: TARIK STATISTIK ===
      const nowWIBString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
      const nowWIB = new Date(nowWIBString);
      const year = nowWIB.getFullYear();
      const month = nowWIB.getMonth();
      const day = nowWIB.getDate();
      
      const startOfDay = new Date(Date.UTC(year, month, day));

      // 1. Cari tanggal target (hari ini, atau fallback ke tanggal absensi terakhir yang ada datanya)
      let targetDate = startOfDay;
      const todayCount = await prisma.absensi.count({
          where: { tanggal: { gte: startOfDay } }
      });

      if (todayCount === 0) {
          const latestPresentRecord = await prisma.absensi.findFirst({
              where: { status: { in: ['Hadir', 'Telat'] } },
              orderBy: { tanggal: 'desc' }
          });
          if (latestPresentRecord) {
              const d = new Date(latestPresentRecord.tanggal);
              targetDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          }
      }

      const startOfTargetDay = targetDate;
      const endOfTargetDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1);

      // Hitung absensi pada targetDate
      const hadirCount = await prisma.absensi.count({ where: { tanggal: { gte: startOfTargetDay, lte: endOfTargetDay }, status: 'Hadir' } });
      const telatCount = await prisma.absensi.count({ where: { tanggal: { gte: startOfTargetDay, lte: endOfTargetDay }, status: 'Telat' } });
      const izinSakitCount = await prisma.absensi.count({ where: { tanggal: { gte: startOfTargetDay, lte: endOfTargetDay }, status: { in: ['Izin', 'Sakit'] } } });
      const alphaCount = await prisma.absensi.count({ where: { tanggal: { gte: startOfTargetDay, lte: endOfTargetDay }, status: 'Alpha' } });

      const totalAbsensi = hadirCount + telatCount + izinSakitCount + alphaCount;
      let statusChart = [85, 10, 5]; // Default fallback jika benar-benar kosong
      if (totalAbsensi > 0) {
          const presentPercent = Math.round(((hadirCount + telatCount) / totalAbsensi) * 100);
          const izinPercent = Math.round((izinSakitCount / totalAbsensi) * 100);
          const alphaPercent = Math.max(0, 100 - presentPercent - izinPercent);
          statusChart = [presentPercent, izinPercent, alphaPercent];
      }

      // 2. Grafik Mingguan (Weekly Attendance)
      let weekAnchor = startOfDay;
      const dayOfWeek = startOfDay.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);

      const weekCount = await prisma.absensi.count({
          where: { tanggal: { gte: startOfWeek } }
      });

      if (weekCount === 0) {
          const latestPresentRecord = await prisma.absensi.findFirst({
              where: { status: { in: ['Hadir', 'Telat'] } },
              orderBy: { tanggal: 'desc' }
          });
          if (latestPresentRecord) {
              const d = new Date(latestPresentRecord.tanggal);
              weekAnchor = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          }
      }

      const anchorDayOfWeek = weekAnchor.getDay();
      const anchorDiffToMonday = anchorDayOfWeek === 0 ? -6 : 1 - anchorDayOfWeek;
      const anchorStartOfWeek = new Date(weekAnchor);
      anchorStartOfWeek.setDate(anchorStartOfWeek.getDate() + anchorDiffToMonday);

      const attendanceWeekly = [];
      for (let d = 0; d < 7; d++) {
          const dayStart = new Date(anchorStartOfWeek);
          dayStart.setDate(dayStart.getDate() + d);
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

          const count = await prisma.absensi.count({
              where: {
                  tanggal: { gte: dayStart, lte: dayEnd },
                  status: { in: ['Hadir', 'Telat'] }
              }
          });
          attendanceWeekly.push(count);
      }

      // 3. Persentase Keterlambatan per Tingkat (all-time / global untuk stabilitas data)
      const allLateAbsens = await prisma.absensi.findMany({
          where: { status: 'Telat' },
          include: {
              siswa: {
                  include: {
                      enrolmentSiswa: {
                          where: { isActive: true },
                          include: {
                              enrolmentKelas: {
                                  include: {
                                      masterKelas: {
                                          include: { tingkat: true }
                                      }
                                  }
                              }
                          }
                      }
                  }
              }
          }
      });

      let lateX = 0;
      let lateXI = 0;
      let lateXII = 0;

      allLateAbsens.forEach(a => {
          if (a.siswa && a.siswa.enrolmentSiswa && a.siswa.enrolmentSiswa.length > 0) {
              const activeEnrol = a.siswa.enrolmentSiswa[0];
              if (activeEnrol.enrolmentKelas && activeEnrol.enrolmentKelas.masterKelas && activeEnrol.enrolmentKelas.masterKelas.tingkat) {
                  const tingkatName = activeEnrol.enrolmentKelas.masterKelas.tingkat.namaTingkat;
                  if (tingkatName === 'X') lateX++;
                  else if (tingkatName === 'XI') lateXI++;
                  else if (tingkatName === 'XII') lateXII++;
              }
          }
      });

      const totalLate = lateX + lateXI + lateXII;
      let latePercentX = 0;
      let latePercentXI = 0;
      let latePercentXII = 0;

      if (totalLate > 0) {
          latePercentX = Math.round((lateX / totalLate) * 100);
          latePercentXI = Math.round((lateXI / totalLate) * 100);
          latePercentXII = Math.max(0, 100 - latePercentX - latePercentXI);
      }

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
              tanggalMulai: { lte: startOfDay },
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
              siswaPerluPerhatian,
              lateDistribution: {
                  X: latePercentX,
                  XI: latePercentXI,
                  XII: latePercentXII
              }
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
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Keamanan: Cek apakah user yang request sesuai dengan ID token (atau memiliki role Guru/Admin)
    if (req.user.id !== userId && req.user.role !== 'Guru' && req.user.role !== 'Admin') {
      return res.status(403).json({ status: 'error', message: 'Akses ditolak: Anda tidak memiliki izin untuk melihat dashboard ini.' });
    }

    const siswa = await prisma.siswa.findUnique({
      where: { userId: userId },
      include: {
        sekolah: true
      }
    });

    if (!siswa) {
      return res.status(404).json({ status: 'error', message: 'Data profil siswa tidak ditemukan' });
    }

    const idSiswa = siswa.id;

    // Ambil data geofence poligon menggunakan ST_AsGeoJSON
    let geofence = null;
    if (siswa.sekolah) {
      geofence = {
        isActive: siswa.sekolah.isGeofenceActive,
        polygon: null
      };

      if (siswa.sekolahId) {
        const geofenceResult = await prisma.$queryRaw`
          SELECT ST_AsGeoJSON(area_sekolah) as polygon_geojson
          FROM sekolah
          WHERE id_sekolah = ${siswa.sekolahId} AND area_sekolah IS NOT NULL;
        `;

        if (geofenceResult.length > 0 && geofenceResult[0].polygon_geojson) {
          const geoJson = JSON.parse(geofenceResult[0].polygon_geojson);
          // Format GeoJSON adalah [ [ [lon, lat], [lon, lat] ] ]. Kita ambil array koordinatnya.
          geofence.polygon = geoJson.coordinates[0];
        }
      }
    }

    const hariIni = new Date();
    // Gunakan Date.UTC agar batasan bulan mencakup tanggal yang tersimpan sebagai UTC Midnight oleh Prisma
    const awalBulan = new Date(Date.UTC(hariIni.getFullYear(), hariIni.getMonth(), 1));
    const akhirBulan = new Date(Date.UTC(hariIni.getFullYear(), hariIni.getMonth() + 1, 0, 23, 59, 59, 999));

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

    // Ambil jadwal aktif
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
        hadirBulanIni: jumlahHadir,
        persentaseKehadiran: persentase,
        riwayatAbsensi: riwayatAbsensi,
        riwayatPerizinan: riwayatPerizinan,
        jadwalAktif: jadwalAktif,
        geofence: geofence
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
  }
});

module.exports = router;