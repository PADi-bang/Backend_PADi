const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Memulai proses seeding...');

  // 1. Hapus data lama (gunakan transaksi untuk keamanan)
  // Urutan penghapusan penting untuk menghindari error foreign key
  await prisma.$transaction([
    prisma.$executeRawUnsafe('TRUNCATE TABLE "user", "sekolah", "role" RESTART IDENTITY CASCADE;'),
    prisma.$executeRawUnsafe('TRUNCATE TABLE "jadwal_absensi", "absensi" RESTART IDENTITY CASCADE;')
  ]);
  console.log('Data lama berhasil dibersihkan.');

  // 2. Buat data Role
  const roleAdmin = await prisma.role.create({ data: { namaRole: 'Admin' } });
  const roleGuru = await prisma.role.create({ data: { namaRole: 'Guru' } });
  const roleSiswa = await prisma.role.create({ data: { namaRole: 'Siswa' } });
  console.log('Data Role berhasil dibuat.');

  // 3. Buat data Sekolah (tanpa titik_koordinat)
  const sekolah = await prisma.sekolah.create({
    data: {
      namaSekolah: 'SMK Negeri 1 Contoh',
      alamat: 'Jl. Pendidikan No. 123, Kota Belajar',
      radiusMeter: 500,
      // titikKoordinat dibiarkan kosong (null)
    },
  });
  console.log(`Data Sekolah '${sekolah.namaSekolah}' berhasil dibuat.`);

  // 4. Buat data Pengguna (User)
  const hashedPassword = await bcrypt.hash('password123', 10);

  const adminUser = await prisma.user.create({
    data: {
      username: 'admin_sekolah',
      email: 'admin@smkn1contoh.sch.id',
      password: hashedPassword,
      roleId: roleAdmin.id,
    },
  });

  const guruUser = await prisma.user.create({
    data: {
      username: 'budi.guru',
      email: 'budi.guru@smkn1contoh.sch.id',
      password: hashedPassword,
      roleId: roleGuru.id,
    },
  });

  const siswaUser = await prisma.user.create({
    data: {
      username: 'ani.siswa',
      email: 'ani.siswa@smkn1contoh.sch.id',
      password: hashedPassword,
      roleId: roleSiswa.id,
    },
  });
  console.log('Data User (Admin, Guru, Siswa) berhasil dibuat.');

  // 5. Buat data profil turunan (Admin, Guru, Siswa)
  await prisma.admin.create({
    data: {
      userId: adminUser.id,
      sekolahId: sekolah.id,
      namaAdmin: 'Administrator Sekolah',
    },
  });

  const guru = await prisma.guru.create({
    data: {
      userId: guruUser.id,
      sekolahId: sekolah.id,
      namaLengkap: 'Budi Santoso, S.Pd.',
      nip: '199001012020121001',
    },
  });

  const siswa = await prisma.siswa.create({
    data: {
      userId: siswaUser.id,
      sekolahId: sekolah.id,
      namaLengkap: 'Ani Lestari',
      nis: '202410001',
    },
  });
  console.log('Data profil Admin, Guru, dan Siswa berhasil dibuat.');

  // 6. Buat Jadwal Absensi
  const hariIni = new Date();
  const namaHari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][hariIni.getDay()];

  const jadwal = await prisma.jadwalAbsensi.create({
    data: {
      sekolahId: sekolah.id,
      namaJadwal: 'Absensi Harian',
      hari: namaHari,
      tanggal: hariIni,
      jamMasukStart: new Date(hariIni.setHours(6, 0, 0, 0)),
      jamMasukFinish: new Date(hariIni.setHours(7, 30, 0, 0)),
      jamPulang: new Date(hariIni.setHours(15, 0, 0, 0)),
      isLibur: false,
    },
  });
  console.log('Data Jadwal Absensi berhasil dibuat.');

  // 7. Buat data Absensi (tanpa koordinat_masuk)
  await prisma.absensi.create({
    data: {
      siswaId: siswa.id,
      jadwalId: jadwal.id,
      tanggal: hariIni,
      jamMasuk: new Date(hariIni.setHours(7, 15, 0, 0)),
      status: 'Hadir',
      keterangan: 'Absensi masuk via Prisma seeder',
      // koordinatMasuk dibiarkan kosong (null)
    },
  });
  console.log('Data Absensi berhasil dibuat.');

}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('Proses seeding selesai.');
  });