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

  // 3. Membuat Sekolah dengan Geofencing Poligon
  const poligonCoords = [
    [110.4327263, -7.0524271], [110.4337617, -7.0523935], [110.4337296, -7.0529312],
    [110.4339683, -7.0529472], [110.4335794, -7.054344], [110.4352939, -7.0549562],
    [110.435449, -7.0544472], [110.4355802, -7.0539044], [110.4357049, -7.0533015],
    [110.4358444, -7.0527704], [110.436075, -7.0519878], [110.4352972, -7.0515433],
    [110.433771, -7.0507181], [110.4333311, -7.0511333], [110.4330119, -7.051703],
    [110.432888, -7.0520138], [110.4327263, -7.0524271]
  ];
  const poligonWKT = `POLYGON((${poligonCoords.map(p => p.join(' ')).join(', ')}))`;

  await prisma.$executeRaw`
    INSERT INTO sekolah (id_sekolah, nama_sekolah, alamat, area_sekolah)
    VALUES (1, 'SMK Negeri 1 Jakarta', 'Jalan Prof. Soedarto, Tembalang', ST_GeomFromText(${poligonWKT}, 4326))
    ON CONFLICT (id_sekolah) DO UPDATE SET
      area_sekolah = ST_GeomFromText(${poligonWKT}, 4326);
  `;

  console.log('✔️ Entitas Sekolah berhasil dibangun/diperbarui dengan geofence poligon.');

  // 4. Membuat 1 Guru Utama
  let guru = await prisma.user.findFirst({ where: { username: 'budi' }, include: { guru: true } });
  if (!guru) {
    guru = await prisma.user.create({
      data: {
        roleId: 2,
        username: 'budi',
        password: passwordHash,
        email: 'budi.guru@sekolah.ac.id',
        guru: {
          create: { sekolahId: 1, namaLengkap: 'Budi Santoso, M.Kom', nip: '198001012010011001' }
        }
      },
      include: { guru: true }
    });
  }

  // 4.5 Membuat 3 Siswa Tetap Khusus Testing
  let siswaTesting = await prisma.user.findFirst({ where: { username: 'baim' } });
  if (!siswaTesting) {
    siswaTesting = await prisma.user.create({
      data: {
        roleId: 3,
        username: 'baim',
        password: passwordHash,
        email: 'baim.siswa@sekolah.ac.id',
        siswa: {
          create: { 
            sekolahId: 1, 
            namaLengkap: 'embaim', 
            nis: '12345678',
            faceModel: '[0.0006491118110716343, 0.005302769131958485, -0.0063703786581754684, -0.008057360537350178, -0.012992298230528831, -0.026257842779159546, -0.16570362448692322, -6.648353883065283e-05, -0.11280183494091034, 0.1706414818763733, -0.0035458137281239033, -0.0006506404024548829, -0.005958933383226395, 0.0016502165235579014, -0.004181317053735256, 0.0031513285357505083, -0.012769711203873158, -0.004790236707776785, -0.00024293246679008007, -0.004771238658577204, 0.23905889689922333, -0.040792178362607956, -0.16622425615787506, 0.012956592254340649, -0.1987038254737854, -0.002174563705921173, -0.007649865932762623, 0.04333935305476189, 0.0935540571808815, -0.16644306480884552, 0.007217285223305225, -0.18672634661197662, 0.03794373571872711, -0.0046233003959059715, 0.014857259579002857, -0.021613771095871925, 0.14010822772979736, -0.00455110240727663, 0.007031665649265051, -0.06562452763319016, -0.010308084078133106, 0.0005620739539153874, 0.010414245538413525, -0.008389310911297798, 0.005550920031964779, 0.033768486231565475, 0.04176798090338707, 0.13416914641857147, -0.0010404572822153568, -0.017253613099455833, -0.003990094177424908, -0.003048680955544114, -0.1176331639289856, -0.000549645978026092, -0.06729082018136978, 0.009241687133908272, -0.0045710364356637, 0.002099050674587488, 0.0035268107894808054, 0.005028702784329653, -0.01719743199646473, -0.04741063341498375, -0.040917348116636276, 0.04513394087553024, 0.0012104240013286471, 0.19309695065021515, -0.0021115450654178858, 0.04927287623286247, 0.009074190631508827, -0.0006159524200484157, -0.014210791327059269, -0.3071468472480774, -0.30837008357048035, -0.00228205812163651, 0.06221497431397438, 0.0009775793878361583, 4.325123882154003e-05, -0.0052015520632267, 0.062195051461458206, 0.1478644162416458, -0.0014049409655854106, -0.0214645117521286, -0.0020664238836616278, 0.02968643233180046, -0.12511152029037476, -0.0008489849278703332, -0.00112506456207484, 0.006401487160474062, 0.03712420165538788, 0.10894336551427841, -0.04584445804357529, -0.004829781129956245, -0.0009466403280384839, -0.016644811257719994, -0.03791842237114906, -0.06070418283343315, -0.025943253189325333, -0.05353308096528053, -0.008025881834328175, 0.003815567120909691, 0.0037687220610678196, -0.00458818394690752, -0.0076973834075033665, 3.7857644201721996e-05, 0.0006695728516206145, 0.004834027029573917, -0.1643146425485611, 0.00336977350525558, -0.013376851566135883, 0.0036891282070428133, -0.07915946841239929, 5.161005901754834e-05, 0.015722792595624924, -0.04047635570168495, -0.00734638562425971, -0.026249993592500687, 0.002710386412218213, -0.014018983580172062, 0.11580920219421387, 0.12001851201057434, -0.0645214393734932, 0.0025122580118477345, 0.08893907070159912, -0.0035591318737715483, 0.0046983459033071995, -0.0033624928910285234, 0.009566452354192734, -0.013036176562309265, 0.013631248846650124, -0.2266809344291687, 0.0028837460558861494, 0.008464556187391281, -0.010510742664337158, -0.04391118511557579, 0.011050472036004066, -0.0014452324248850346, 0.019318334758281708, -0.07026747614145279, -0.014789181761443615, -0.00041837969911284745, 0.0024191110860556364, -0.0014212310779839754, 0.0047865561209619045, -0.198826402425766, -0.03328144922852516, 0.16878873109817505, -0.022242959588766098, -0.004151701461523771, 0.007040943950414658, 0.004848890472203493, -0.019633812829852104, -0.14950215816497803, 0.05890616402029991, -0.010068233124911785, 0.00269586150534451, 0.0022885636426508427, -0.0013171577593311667, 0.010579260997474194, 0.02525983937084675, 0.0005599450669251382, -0.0021066502667963505, 0.0007388962549157441, 0.005576703231781721, -0.0010959907667711377, -0.0022357809357345104, 0.00027285702526569366, -0.00939637329429388, 0.10286492109298706, -0.004896185826510191, -0.0054181236773729324, -0.024713121354579926, 0.007404550909996033, -0.0031542677897959948, 0.15179070830345154, 0.018246926367282867, -0.0013264624867588282, 0.02164330519735813,0.01158613059669733, -0.00255343085154891, -0.0021456715185195208, -0.015219256281852722, 0.06546888500452042, -0.0023422017693519592, 0.008758376352488995, -0.11915605515241623, -0.03488760441541672, -0.061379458755254745, -0.1113666519522667, 0.1757955700159073, -0.1470073014497757, -0.010124682448804379, -0.005891632754355669]'
          }
        }
      }
    });
    console.log('✔️ Akun Siswa Testing (baim) berhasil dibuat.');
  }

  let siswaTejo = await prisma.user.findFirst({ where: { username: 'fariz' } });
  if (!siswaTejo) {
    await prisma.user.create({
      data: {
        roleId: 3,
        username: 'fariz',
        password: passwordHash,
        email: 'fariz.siswa@sekolah.ac.id',
        siswa: {
          create: {
            sekolahId: 1,
            namaLengkap: 'ifariza',
            nis: '11112222',
          }
        }
      }
    });
    console.log('✔️ Akun Siswa Testing (fariz) berhasil dibuat.');
  }

  let siswaSiti = await prisma.user.findFirst({ where: { username: 'cezar' } });
  if (!siswaSiti) {
    await prisma.user.create({
      data: {
        roleId: 3,
        username: 'cezar',
        password: passwordHash,
        email: 'cezar.siswa@sekolah.ac.id',
        siswa: {
          create: { 
            sekolahId: 1, 
            namaLengkap: 'pacezaru', 
            nis: '33334444',
            faceModel: null
          } 
        }
      }
    });
    console.log('✔️ Akun Siswa Testing (cezar) berhasil dibuat.');
  }

  // 5. Membuat Jadwal Absensi (Reguler & Khusus)
  console.log('✔️ Menyiapkan jadwal absensi harian...');
  
  // Bersihkan data lama untuk menghindari foreign key constraint error saat re-seed
  await prisma.absensi.deleteMany({ where: { siswa: { sekolahId: 1 } } });
  await prisma.jadwalAbsensi.deleteMany({ where: { sekolahId: 1 } });

  const hariKerja = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  const jadwalDibuat = [];

  // 5a. PEMBUATAN JADWAL REGULER (tanggal = null)
  for (const hari of hariKerja) {
    const jadwalBaru = await prisma.jadwalAbsensi.create({
      data: {
        sekolahId: 1,
        namaJadwal: `Reguler Pagi - ${hari}`,
        hari: hari,
        tanggal: null, // [PERBAIKAN]: Set null agar berlaku berulang setiap minggu
        jamMasukStart: new Date('1970-01-01T06:00:00Z'),
        jamMasukFinish: new Date('1970-01-01T07:15:00Z'),
        jamPulang: new Date('1970-01-01T15:00:00Z'),
        isLibur: false
      }
    });
    jadwalDibuat.push(jadwalBaru);
  }
  console.log('   ↳ Jadwal Reguler Senin-Jumat berhasil dibuat (Berlaku berulang).');

  // Menggunakan jadwal reguler pertama untuk pengisian riwayat dummy siswa acak
  const jadwalRiwayat = jadwalDibuat[0];

  // 6. FACTORY UTAMA: Membuat 15 Siswa Acak beserta Riwayatnya
  console.log('⚙️ Sedang mencetak 15 Siswa acak beserta riwayat absensi dan izin...');
  const pilihanStatusAbsen = ['Hadir', 'Telat', 'Alpha', 'Izin', 'Sakit'];

  for (let i = 0; i < 15; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const usernameSiswa = faker.internet.username({ firstName, lastName }).toLowerCase().replace(/[^a-z0-9]/g, '');

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
            nis: faker.string.numeric(8)
          }
        }
      },
      include: { siswa: true }
    });

    const idSiswa = userSiswa.siswa.id;

    // Membuat 5 Riwayat Absensi Acak untuk setiap siswa
    for (let j = 0; j < 5; j++) {
      const statusAcak = pilihanStatusAbsen[Math.floor(Math.random() * pilihanStatusAbsen.length)];
      
      // Mengarang jam masuk dummy agar sinkron dengan tipe data @db.Time
      let jamMasukDummy = null;
      if (statusAcak === 'Hadir') {
        jamMasukDummy = new Date('1970-01-01T06:45:00Z'); // Jam masuk aman (Hadir)
      } else if (statusAcak === 'Telat') {
        jamMasukDummy = new Date('1970-01-01T07:30:00Z'); // Jam masuk telat
      }

      await prisma.absensi.create({
        data: {
          siswaId: idSiswa,
          jadwalId: jadwalRiwayat.id,
          tanggal: faker.date.recent({ days: 30 }), 
          status: statusAcak,
          jamMasuk: jamMasukDummy // [PERBAIKAN]: Terkunci di format jam netral 1970
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
        alasan: faker.lorem.sentence(), 
        status: statusIzinAcak,
        disetujuiOlehId: statusIzinAcak === 'Disetujui' ? guru.guru.id : null
      }
    });
  }

  // 7. [BARU] Membuat Relasi Kelas & Enrolment
  console.log('📚 Membuat relasi kelas, angkatan, dan tahun akademik...');

  // 7a. Buat Master Data Akademik (jika belum ada)
  const tingkatNames = ["X", "XI", "XII"];
  const tingkatMap = {};
  for (const name of tingkatNames) {
    let t = await prisma.masterTingkat.findFirst({ where: { namaTingkat: name } });
    if (!t) {
      t = await prisma.masterTingkat.create({ data: { namaTingkat: name } });
    }
    tingkatMap[name] = t.id;
  }

  const tahunAkademik = await prisma.masterTahunAkademik.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, sekolahId: 1, tahunAjaran: '2025/2026', semester: 'Ganjil', isActive: true }
  });
  const angkatan = await prisma.masterAngkatan.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, sekolahId: 1, nomorAngkatan: '12' }
  });
  const kelas = await prisma.masterKelas.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, sekolahId: 1, namaKelas: 'RPL 1', tingkatId: tingkatMap["X"] }
  });

  // 7b. Buat Rombongan Belajar (Enrolment Kelas)
  const rombel = await prisma.enrolmentKelas.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      sekolahId: 1,
      tahunAkademikId: tahunAkademik.id,
      angkatanId: angkatan.id,
      kelasId: kelas.id,
      keterangan: `Kelas ${kelas.namaKelas} - Angkatan ${angkatan.nomorAngkatan} - TA ${tahunAkademik.tahunAjaran}`
    }
  });

  // 7c. Tetapkan Guru Budi sebagai Wali Kelas di Rombel tersebut
  await prisma.enrolmentGuru.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, guruId: guru.guru.id, enrolmentKelasId: rombel.id, isActive: true }
  });
  console.log(`   ↳ Guru Budi ditetapkan sebagai wali kelas di ${rombel.keterangan}.`);

  // 7d. [BARU] Masukkan semua siswa yang sudah dibuat ke dalam Rombel
  console.log('   ↳ Memasukkan semua siswa ke dalam rombel...');

  // Hapus enrolment siswa lama di rombel ini untuk menghindari duplikasi saat re-seed
  await prisma.enrolmentSiswa.deleteMany({
    where: { enrolmentKelasId: rombel.id }
  });

  const allSiswaInSchool = await prisma.siswa.findMany({
    where: { sekolahId: 1 },
    select: { id: true }
  });

  await prisma.enrolmentSiswa.createMany({
    data: allSiswaInSchool.map(siswa => ({
      siswaId: siswa.id,
      enrolmentKelasId: rombel.id,
      isActive: true
    }))
  });
  console.log(`   ↳ ${allSiswaInSchool.length} siswa berhasil dimasukkan ke kelas ${kelas.namaKelas}.`);

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