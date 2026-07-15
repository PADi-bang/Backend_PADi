const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('=== MEMULAI DATABASE SEEDING UNTUK TESTING ===');

  console.log('1. Membersihkan data lama di database...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "Session", notifikasi, absensi, perizinan, 
      enrolment_siswa, enrolment_guru, enrolment_kelas, 
      siswa, guru, admin, jadwal_absensi, 
      master_kelas, master_angkatan, master_tahun_akademik, 
      master_tingkat, sekolah, "user", role, pengaturan 
    RESTART IDENTITY CASCADE;
  `);

  console.log('2. Membuat data Pengaturan Default...');
  await prisma.pengaturan.createMany({
    data: [
      { kunci: 'bulan_mulai_ganjil', nilai: '7' },
      { kunci: 'bulan_selesai_ganjil', nilai: '12' },
      { kunci: 'bulan_mulai_genap', nilai: '1' },
      { kunci: 'bulan_selesai_genap', nilai: '6' }
    ]
  });

  console.log('3. Membuat data Role...');
  await prisma.role.createMany({
    data: [
      { id: 1, namaRole: 'Admin' },
      { id: 2, namaRole: 'Guru' },
      { id: 3, namaRole: 'Siswa' }
    ]
  });

  console.log('4. Membuat data Sekolah...');
  await prisma.sekolah.create({
    data: {
      id: 1,
      namaSekolah: 'SMK Negeri 1 Malang',
      alamat: 'Jl. Surabaya No. 1, Malang',
      isGeofenceActive: true
    }
  });

  // Update area_sekolah (geofence) menggunakan raw PostGIS Query
  // Geofence Malang (lng lat), koordinat harus ditutup kembali
  const polyStr = 'POLYGON((112.600 -8.000, 112.700 -8.000, 112.700 -7.900, 112.600 -7.900, 112.600 -8.000))';
  await prisma.$executeRawUnsafe(`
    UPDATE sekolah 
    SET area_sekolah = ST_GeomFromText($1, 4326) 
    WHERE id_sekolah = 1
  `, polyStr);

  console.log('5. Membuat data Master Tingkat, Kelas, Angkatan, dan Tahun Akademik...');
  // Master Tingkat
  await prisma.masterTingkat.createMany({
    data: [
      { id: 1, namaTingkat: 'X' },
      { id: 2, namaTingkat: 'XI' },
      { id: 3, namaTingkat: 'XII' }
    ]
  });

  // Master Kelas
  await prisma.masterKelas.createMany({
    data: [
      { id: 1, sekolahId: 1, tingkatId: 1, namaKelas: 'IPA 1' },
      { id: 2, sekolahId: 1, tingkatId: 2, namaKelas: 'IPA 1' },
      { id: 3, sekolahId: 1, tingkatId: 3, namaKelas: 'IPA 1' }
    ]
  });

  // Master Angkatan
  await prisma.masterAngkatan.createMany({
    data: [
      { id: 1, sekolahId: 1, nomorAngkatan: 'Angkatan ke-1', isActive: true }, // Untuk kelas X
      { id: 2, sekolahId: 1, nomorAngkatan: 'Angkatan ke-2', isActive: true }, // Untuk kelas XI
      { id: 3, sekolahId: 1, nomorAngkatan: 'Angkatan ke-3', isActive: true }  // Untuk kelas XII
    ]
  });

  // Master Tahun Akademik
  await prisma.masterTahunAkademik.create({
    data: {
      id: 1,
      sekolahId: 1,
      tahunAjaran: '2025/2026',
      semester: 'Ganjil',
      isActive: true
    }
  });

  console.log('6. Membuat data Enrolment Kelas (Rombel)...');
  await prisma.enrolmentKelas.createMany({
    data: [
      { id: 1, sekolahId: 1, kelasId: 1, tahunAkademikId: 1, keterangan: 'Kelas X IPA 1' },
      { id: 2, sekolahId: 1, kelasId: 2, tahunAkademikId: 1, keterangan: 'Kelas XI IPA 1' },
      { id: 3, sekolahId: 1, kelasId: 3, tahunAkademikId: 1, keterangan: 'Kelas XII IPA 1' }
    ]
  });

  console.log('7. Membuat data User, Admin, Guru, dan Siswa...');
  const passwordAdmin = bcrypt.hashSync('admin123', 10);
  const passwordGuru = bcrypt.hashSync('guru123', 10);
  const passwordSiswa = bcrypt.hashSync('siswa123', 10);

  // Admin User
  await prisma.user.create({
    data: {
      id: 1,
      roleId: 1,
      username: 'admin',
      password: passwordAdmin,
      email: 'admin@padi.com',
      admin: {
        create: {
          id: 1,
          sekolahId: 1,
          namaAdmin: 'Administrator Web'
        }
      }
    }
  });

  // 3 Guru Users
  const gurus = [
    { id: 2, username: 'budi', email: 'budi.utomo@padi.com', idGuru: 1, nama: 'Drs. Budi Utomo', nip: '198001012005011001' },
    { id: 3, username: 'siti', email: 'siti.aminah@padi.com', idGuru: 2, nama: 'Siti Aminah, S.Pd.', nip: '198502022010022002' },
    { id: 4, username: 'ahmad', email: 'ahmad.fauzi@padi.com', idGuru: 3, nama: 'Ahmad Fauzi, M.Pd.', nip: '197803032003011003' }
  ];

  for (const g of gurus) {
    await prisma.user.create({
      data: {
        id: g.id,
        roleId: 2,
        username: g.username,
        password: passwordGuru,
        email: g.email,
        guru: {
          create: {
            id: g.idGuru,
            sekolahId: 1,
            namaLengkap: g.nama,
            nip: g.nip
          }
        }
      }
    });
  }

  // 9 Siswa Users
  const siswas = [
    // Angkatan ke-1 -> Kelas X (enrolmentKelasId 1)
    { id: 5, username: 'aditya', email: 'aditya.pratama@padi.com', idSiswa: 1, nama: 'Aditya Pratama', nis: '10001', angkatanId: 1 },
    { id: 6, username: 'beni', email: 'beni.saputra@padi.com', idSiswa: 2, nama: 'Beni Saputra', nis: '10002', angkatanId: 1 },
    { id: 7, username: 'citra', email: 'citra.lestari@padi.com', idSiswa: 3, nama: 'Citra Lestari', nis: '10003', angkatanId: 1 },

    // Angkatan ke-2 -> Kelas XI (enrolmentKelasId 2)
    { id: 8, username: 'dina', email: 'dina.mariana@padi.com', idSiswa: 4, nama: 'Dina Mariana', nis: '10004', angkatanId: 2 },
    { id: 9, username: 'eko', email: 'eko.prasetyo@padi.com', idSiswa: 5, nama: 'Eko Prasetyo', nis: '10005', angkatanId: 2 },
    { id: 10, username: 'farhan', email: 'farhan.maulana@padi.com', idSiswa: 6, nama: 'Farhan Maulana', nis: '10006', angkatanId: 2 },

    // Angkatan ke-3 -> Kelas XII (enrolmentKelasId 3)
    { id: 11, username: 'gita', email: 'gita.cahyani@padi.com', idSiswa: 7, nama: 'Gita Cahyani', nis: '10007', angkatanId: 3 },
    { id: 12, username: 'hendra', email: 'hendra.wijaya@padi.com', idSiswa: 8, nama: 'Hendra Wijaya', nis: '10008', angkatanId: 3 },
    { id: 13, username: 'indah', email: 'indah.permata@padi.com', idSiswa: 9, nama: 'Indah Permata', nis: '10009', angkatanId: 3 }
  ];

  // Face model mock (192 float embedding)
  const mockFaceModel = JSON.stringify(new Array(192).fill(0.05));

  for (const s of siswas) {
    await prisma.user.create({
      data: {
        id: s.id,
        roleId: 3,
        username: s.username,
        password: passwordSiswa,
        email: s.email,
        siswa: {
          create: {
            id: s.idSiswa,
            sekolahId: 1,
            namaLengkap: s.nama,
            nis: s.nis,
            angkatanId: s.angkatanId,
            faceModel: mockFaceModel
          }
        }
      }
    });
  }

  console.log('8. Membuat data Enrolment Siswa & Guru...');
  // Enrolment Guru (Setiap Guru mengampu 1 kelas)
  await prisma.enrolmentGuru.createMany({
    data: [
      { id: 1, guruId: 1, enrolmentKelasId: 1, isActive: true }, // Guru X di Kelas X IPA 1
      { id: 2, guruId: 2, enrolmentKelasId: 2, isActive: true }, // Guru Y di Kelas XI IPA 1
      { id: 3, guruId: 3, enrolmentKelasId: 3, isActive: true }  // Guru Z di Kelas XII IPA 1
    ]
  });

  // Enrolment Siswa (Setiap Siswa masuk ke kelas sesuai angkatannya)
  await prisma.enrolmentSiswa.createMany({
    data: [
      { id: 1, siswaId: 1, enrolmentKelasId: 1, isActive: true },
      { id: 2, siswaId: 2, enrolmentKelasId: 1, isActive: true },
      { id: 3, siswaId: 3, enrolmentKelasId: 1, isActive: true },

      { id: 4, siswaId: 4, enrolmentKelasId: 2, isActive: true },
      { id: 5, siswaId: 5, enrolmentKelasId: 2, isActive: true },
      { id: 6, siswaId: 6, enrolmentKelasId: 2, isActive: true },

      { id: 7, siswaId: 7, enrolmentKelasId: 3, isActive: true },
      { id: 8, siswaId: 8, enrolmentKelasId: 3, isActive: true },
      { id: 9, siswaId: 9, enrolmentKelasId: 3, isActive: true }
    ]
  });

  console.log('9. Membuat Jadwal Absensi Aktif...');
  // Sesi reguler utama
  const jamMasukStart = new Date(Date.UTC(1970, 0, 1, 6, 0, 0));
  const jamMasukFinish = new Date(Date.UTC(1970, 0, 1, 7, 30, 0));
  const jamPulang = new Date(Date.UTC(1970, 0, 1, 15, 0, 0));

  await prisma.jadwalAbsensi.create({
    data: {
      id: 1,
      sekolahId: 1,
      namaJadwal: 'Jadwal Reguler Utama SMKN 1 Malang',
      hari: 'Senin, Selasa, Rabu, Kamis, Jumat',
      jamMasukStart: jamMasukStart,
      jamMasukFinish: jamMasukFinish,
      jamPulang: jamPulang,
      isLibur: false,
      isActive: true,
      kelas: {
        connect: [{ id: 1 }, { id: 2 }, { id: 3 }]
      }
    }
  });

  console.log('10. Men-generate data presensi historis (log absensi) & perizinan selama 30 hari...');
  const absensiData = [];
  const perizinanData = [];

  const today = new Date();
  
  // Menggunakan perulangan 30 hari ke belakang
  for (let i = 1; i <= 30; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - i);

    const dayOfWeek = targetDate.getDay();
    // Skip akhir pekan (Sabtu & Minggu)
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const dateStr = targetDate.toISOString().split('T')[0];
    const currentTargetDate = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()));

    // Iterasi untuk 9 siswa
    for (let sId = 1; sId <= 9; sId++) {
      // Deterministic pseudo-random status distribution berdasarkan (sId + i)
      const rand = (sId * 17 + i * 31) % 100;
      let status = 'Hadir';
      let jamMasukStr = null;
      let jamPulangStr = null;
      let keterangan = '-';

      // 5% Alpha, 3% Sakit, 3% Izin, 14% Telat, 75% Hadir
      if (rand < 5) {
        status = 'Alpha';
        keterangan = 'Tanpa Keterangan';
      } else if (rand < 8) {
        status = 'Sakit';
        keterangan = 'Sakit demam / flu';
      } else if (rand < 11) {
        status = 'Izin';
        keterangan = 'Ada kepentingan keluarga mendesak';
      } else if (rand < 25) {
        status = 'Telat';
        // Jam masuk telat: antara 07:31 s.d. 08:15
        const minutesLate = 1 + (rand % 45); // 1-45 menit terlambat
        const totalMinutes = 7 * 60 + 30 + minutesLate;
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        jamMasukStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
        jamPulangStr = '15:05:00';
        keterangan = `Telat ${minutesLate} menit`;
      } else {
        status = 'Hadir';
        // Jam masuk tepat waktu: antara 06:15 s.d. 07:25
        const startOffset = rand % 70; // 0-69 menit
        const totalMinutes = 6 * 60 + 15 + startOffset;
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        jamMasukStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
        jamPulangStr = '15:00:00';
      }

      // Jika status Sakit atau Izin, buat data perizinan di tabel Perizinan agar datanya sinkron
      if (status === 'Sakit' || status === 'Izin') {
        const disetujuiOlehId = sId <= 3 ? 1 : (sId <= 6 ? 2 : 3); // Guru X, Y, atau Z
        perizinanData.push({
          siswaId: sId,
          tanggalMulai: currentTargetDate,
          tanggalSelesai: currentTargetDate,
          jenisIzin: status === 'Sakit' ? 'Sakit' : 'Kepentingan',
          alasan: keterangan,
          status: 'Disetujui',
          disetujuiOlehId: disetujuiOlehId,
          fileBukti: `file_izin/mock_surat_izin_${sId}_${dateStr}.pdf`
        });
      }

      absensiData.push({
        siswaId: sId,
        jadwalId: 1,
        tanggalStr: dateStr,
        jamMasuk: jamMasukStr,
        jamPulang: jamPulangStr,
        status: status,
        keterangan: keterangan,
        // Titik koordinat acak dekat SMKN 1 Malang (sekitar 112.621392, -7.981899)
        lng: 112.621392 + (rand % 10 - 5) * 0.0001,
        lat: -7.981899 + (rand % 10 - 5) * 0.0001
      });
    }
  }

  // Masukkan perizinan terlebih dahulu
  console.log(`- Memasukkan ${perizinanData.length} data perizinan disetujui...`);
  for (const p of perizinanData) {
    await prisma.perizinan.create({
      data: {
        siswaId: p.siswaId,
        tanggalMulai: p.tanggalMulai,
        tanggalSelesai: p.tanggalSelesai,
        jenisIzin: p.jenisIzin,
        alasan: p.alasan,
        status: p.status,
        disetujuiOlehId: p.disetujuiOlehId,
        fileBukti: p.fileBukti
      }
    });
  }

  // Masukkan absensi historis menggunakan raw query PostgreSQL untuk input data spasial PostGIS & database Time murni
  console.log(`- Memasukkan ${absensiData.length} data absensi historis...`);
  for (const a of absensiData) {
    const jamMasukVal = a.jamMasuk ? `'${a.jamMasuk}'::time` : 'NULL';
    const jamPulangVal = a.jamPulang ? `'${a.jamPulang}'::time` : 'NULL';
    const fotoMasukVal = a.jamMasuk ? `'/uploads/foto_absen/foto_masuk/mock_masuk.jpg'` : 'NULL';
    const fotoPulangVal = a.jamPulang ? `'/uploads/foto_absen/foto_pulang/mock_pulang.jpg'` : 'NULL';

    await prisma.$executeRawUnsafe(`
      INSERT INTO absensi (id_siswa, id_jadwal, tanggal, jam_masuk, jam_pulang, status, keterangan, koordinat_masuk, koordinat_pulang, foto_masuk, foto_pulang)
      VALUES (
        $1, $2, $3::date, 
        ${jamMasukVal}, ${jamPulangVal}, 
        $4::"AbsensiStatus", $5, 
        ${a.jamMasuk ? `ST_SetSRID(ST_MakePoint(${a.lng}, ${a.lat}), 4326)::geography` : 'NULL'},
        ${a.jamPulang ? `ST_SetSRID(ST_MakePoint(${a.lng}, ${a.lat}), 4326)::geography` : 'NULL'},
        ${fotoMasukVal}, ${fotoPulangVal}
      )
    `, a.siswaId, a.jadwalId, a.tanggalStr, a.status, a.keterangan);
  }

  console.log('11. Membuat beberapa contoh Notifikasi & Izin Pending untuk bahan testing saat ini...');
  // Contoh izin pending dari siswa_x1 (Aditya) dan siswa_y1 (Dina) untuk hari ini/besok
  await prisma.perizinan.createMany({
    data: [
      {
        siswaId: 1, // Aditya Pratama
        tanggalMulai: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())),
        tanggalSelesai: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1)),
        jenisIzin: 'Sakit',
        alasan: 'Badan panas demam tinggi',
        status: 'Pending',
        fileBukti: 'file_izin/mock_surat_dokter_aditya.pdf'
      },
      {
        siswaId: 4, // Dina Mariana
        tanggalMulai: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())),
        tanggalSelesai: new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())),
        jenisIzin: 'Kepentingan',
        alasan: 'Ada acara keluarga besar di luar kota',
        status: 'Pending',
        fileBukti: 'file_izin/mock_surat_izin_dina.pdf'
      }
    ]
  });

  // Contoh beberapa Notifikasi untuk admin/guru
  await prisma.notifikasi.createMany({
    data: [
      { userId: 1, judul: 'Sistem Siap', tipe: 'Sistem', isiPesan: 'Seeder database pengujian berhasil di-load.', isRead: false },
      { userId: 2, judul: 'Pengajuan Izin', tipe: 'Pengingat', isiPesan: 'Aditya Pratama (X IPA 1) mengajukan izin Sakit.', isRead: false },
      { userId: 3, judul: 'Pengajuan Izin', tipe: 'Pengingat', isiPesan: 'Dina Mariana (XI IPA 1) mengajukan izin Kepentingan.', isRead: false }
    ]
  });

  console.log('=== DATABASE SEEDING BERHASIL DISELESAIKAN ===');
}

main()
  .catch((e) => {
    console.error('Terjadi error saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
