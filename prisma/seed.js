const { PrismaClient } = require('@prisma/client');
const { faker } = require('@faker-js/faker/locale/id_ID'); // Menggunakan bahasa & nama Indonesia
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Memulai proses pabrikasi data (Seeding)...');

  // 1. Persiapan Password Default (123)
  const passwordHash = await bcrypt.hash('123', 10);

  // 2. Membuat Role (Jika belum ada)
  const roles = [
    { id: 1, namaRole: 'Admin' },
    { id: 2, namaRole: 'Guru' },
    { id: 3, namaRole: 'Siswa' }
  ];
  for (const r of roles) {
    const existing = await prisma.role.findFirst({ where: { id: r.id } });
    if (!existing) await prisma.role.create({ data: r });
  }
  console.log('✔️ Role berhasil disiapkan.');

  // 3. Membuat Sekolah
  // Karena kolom titikKoordinat bertipe Unsupported, kita wajib menggunakan query SQL mentah
  await prisma.$executeRaw`
    INSERT INTO sekolah (id_sekolah, nama_sekolah, alamat, radius_meter, titik_koordinat)
    VALUES (1, 'SMK Negeri 1 Jakarta', 'Jalan Prof. Soedarto, Tembalang', 400, ST_GeomFromText('POINT(110.4327263 -7.0524271)', 4326))
    ON CONFLICT (id_sekolah) DO NOTHING;
  `;

  console.log('✔️ Entitas Sekolah berhasil dibangun.');

  // 4. Membuat 1 Guru Utama
  let guru = await prisma.user.findFirst({ where: { username: 'budi_guru' }, include: { guru: true } });
  if (!guru) {
    guru = await prisma.user.create({
      data: {
        roleId: 2,
        username: 'budi_guru',
        password: passwordHash,
        email: 'budi.santoso@smk1jkt.sch.id',
        guru: {
          create: { sekolahId: 1, namaLengkap: 'Budi Santoso, M.Kom', nip: '198001012010011001' }
        }
      },
      include: { guru: true }
    });
  }

  // 4.5 Membuat 1 Siswa Tetap Khusus Testing Geofencing (Diikat ke Polines)
  let siswaTesting = await prisma.user.findFirst({ where: { username: 'tejo' } });
  if (!siswaTesting) {
    siswaTesting = await prisma.user.create({
      data: {
        roleId: 3,
        username: 'tejo', // Gunakan username ini untuk login di emulator
        password: passwordHash, // Passwordnya sama: 123
        email: 'tejo.siswa@sekolah.ac.id',
        siswa: {
          create: { 
            sekolahId: 1, // PENTING: 2 adalah ID untuk kampus Polines
            namaLengkap: 'latejoki', 
            nis: '12345678' 
          }
        }
      }
    });
    console.log('✔️ Akun Siswa Testing (tejo) berhasil dibuat.');
  }

  // 5. Membuat Jadwal Absensi Dummy
  const jadwal = await prisma.jadwalAbsensi.create({
    data: {
      sekolahId: 1,
      namaJadwal: 'Reguler Pagi',
      hari: 'Senin-Jumat',
      tanggal: new Date(),
      jamMasukStart: new Date('2026-05-24T06:00:00Z'),
      jamMasukFinish: new Date('2026-05-24T07:15:00Z'),
      jamPulang: new Date('2026-05-24T15:00:00Z'),
      isLibur: false
    }
  });

  // 6. FACTORY UTAMA: Membuat 15 Siswa Acak beserta Riwayatnya
  console.log('⚙️ Sedang mencetak 15 Siswa acak beserta riwayat absensi dan izin...');
  const pilihanStatusAbsen = ['Hadir', 'Telat', 'Alpha', 'Izin', 'Sakit'];

  for (let i = 0; i < 15; i++) {
    // Faker mengarang identitas acak
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    
    // PERBAIKAN DI SINI: userName menjadi username
    const usernameSiswa = faker.internet.username({ firstName, lastName }).toLowerCase().replace(/[^a-z0-9]/g, '');

    // Membuat akun User & Profil Siswa
    const userSiswa = await prisma.user.create({
      data: {
        roleId: 3,
        username: usernameSiswa,
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        password: passwordHash,
        siswa: {
          create: { 
            sekolahId: 1, 
            namaLengkap: `${firstName} ${lastName}`, 
            nis: faker.string.numeric(8) // Generate 8 digit NIS acak
          }
        }
      },
      include: { siswa: true }
    });

    const idSiswa = userSiswa.siswa.id;

    // Membuat 5 Riwayat Absensi Acak untuk setiap siswa
    for (let j = 0; j < 5; j++) {
      const statusAcak = pilihanStatusAbsen[Math.floor(Math.random() * pilihanStatusAbsen.length)];
      
      await prisma.absensi.create({
        data: {
          siswaId: idSiswa,
          jadwalId: jadwal.id,
          tanggal: faker.date.recent({ days: 30 }), // Tanggal acak 30 hari ke belakang
          status: statusAcak,
          jamMasuk: ['Hadir', 'Telat'].includes(statusAcak) ? faker.date.recent() : null,
        }
      });
    }

    // Membuat 1 Riwayat Izin Acak untuk setiap siswa
    const jenisIzinAcak = Math.random() > 0.5 ? 'Sakit' : 'Kepentingan';
    const statusIzinAcak = Math.random() > 0.5 ? 'Disetujui' : 'Pending';

    await prisma.perizinan.create({
      data: {
        siswaId: idSiswa,
        tanggalMulai: faker.date.soon({ days: 2 }),
        tanggalSelesai: faker.date.soon({ days: 5 }),
        jenisIzin: jenisIzinAcak,
        alasan: faker.lorem.sentence(), // Membuat kalimat alasan acak
        status: statusIzinAcak,
        disetujuiOlehId: statusIzinAcak === 'Disetujui' ? guru.guru.id : null
      }
    });
  }

  console.log('✅ SEEDING BERHASIL! Database Anda sekarang sudah terisi penuh dengan data yang bervariasi.');
}

main()
  .catch((e) => {
    console.error('❌ Gagal melakukan seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });