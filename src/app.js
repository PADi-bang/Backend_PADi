//App_PADi\backend\src\app.js

const express = require('express');
const cors = require('cors');
const path = require('path'); 
const session = require('express-session'); // ---> [BARU] Tambahan untuk session login admin
const dashboardRoutes = require('./routes/dashboard');
const guruRoutes = require('./routes/guru');
const app = express();

const publicPath = path.join(__dirname, '../public');

// --- [BARU] KONFIGURASI TEMPLATE ENGINE EJS ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views')); // Menunjuk ke folder views di luar folder src

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true })); 

// --- [BARU] MIDDLEWARE SESSION ---
// Diperlukan untuk menyimpan status login user admin di browser
app.use(session({
    secret: 'padi-geofencing-secret-key-xyz',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set ke true jika nanti production sudah pakai HTTPS
}));

// app.use(express.static(publicPath)); // Dipindahkan ke bawah agar rute Web Admin dieksekusi lebih dulu
// --- JADWAL OTOMATIS (CRON JOBS) & INIT ---
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prismaCron = new PrismaClient();

// Inisialisasi Admin Default
async function initDefaultAdmin() {
    try {
        const exist = await prismaCron.user.findFirst({ where: { roleId: 1 } });
        if (!exist) {
            const password = await bcrypt.hash('admin123', 10);
            await prismaCron.user.create({
                data: {
                    username: 'admin',
                    password: password,
                    email: 'admin@padi.com',
                    roleId: 1,
                    admin: { create: { namaAdmin: 'Administrator', sekolahId: 1 } }
                }
            });
            console.log('[Init] Default Admin dibuat: admin / admin123');
        }
    } catch(err) { console.log('[Init] Gagal buat admin default', err.message); }
}
initDefaultAdmin();

async function syncSemesterAktif() {
    try {
        const bulanSekarang = new Date().getMonth() + 1;
        let mulaiGanjil = 7; let selesaiGanjil = 12;
        let mulaiGenap = 1; let selesaiGenap = 6;
        
        const settings = await prismaCron.pengaturan.findMany();
        settings.forEach(c => {
            if(c.kunci === 'bulan_mulai_ganjil') mulaiGanjil = parseInt(c.nilai);
            if(c.kunci === 'bulan_selesai_ganjil') selesaiGanjil = parseInt(c.nilai);
            if(c.kunci === 'bulan_mulai_genap') mulaiGenap = parseInt(c.nilai);
            if(c.kunci === 'bulan_selesai_genap') selesaiGenap = parseInt(c.nilai);
        });

        let isGanjil = false;
        if (mulaiGanjil <= selesaiGanjil) {
            if (bulanSekarang >= mulaiGanjil && bulanSekarang <= selesaiGanjil) isGanjil = true;
        } else {
            if (bulanSekarang >= mulaiGanjil || bulanSekarang <= selesaiGanjil) isGanjil = true;
        }

        const semesterHarusnya = isGanjil ? 'Ganjil' : 'Genap';
        
        await prismaCron.masterTahunAkademik.updateMany({
            where: { isActive: true },
            data: { semester: semesterHarusnya }
        });
        console.log(`[Cron] Sync Semester Selesai. Set ke: ${semesterHarusnya}`);
    } catch(err) {
        console.error('[Cron] Gagal sync semester:', err.message);
    }
}

cron.schedule('0 0 1 * *', () => {
    console.log('[Cron] Menjalankan pengecekan pergantian semester...');
    syncSemesterAktif();
});

cron.schedule('0 0 1 7 *', async () => {
    try {
        console.log('[Cron] Menjalankan pengecekan angkatan & TA baru...');
        const tahunSekarang = new Date().getFullYear();
        const tahunDepan = tahunSekarang + 1;
        const newTaString = `${tahunSekarang}/${tahunDepan}`;

        // 1. Cek & Buat Tahun Akademik Baru
        const existingTa = await prismaCron.masterTahunAkademik.findFirst({
            where: { tahunAjaran: newTaString }
        });

        if (!existingTa) {
            const oldTa = await prismaCron.masterTahunAkademik.findFirst({ where: { isActive: true, sekolahId: 1 } });
            
            await prismaCron.masterTahunAkademik.updateMany({ data: { isActive: false } });
            
            const newTa = await prismaCron.masterTahunAkademik.create({
                data: { tahunAjaran: newTaString, semester: 'Ganjil', isActive: true, sekolahId: 1 }
            });
            console.log(`[Cron] Berhasil menambah Tahun Akademik baru: ${newTaString}`);

            if (oldTa) {
                const oldEnrolments = await prismaCron.enrolmentKelas.findMany({
                    where: { tahunAkademikId: oldTa.id },
                    include: {
                        masterKelas: true,
                        enrolmentSiswa: { where: { isActive: true } }
                    }
                });

                for (const ek of oldEnrolments) {
                    for (const es of ek.enrolmentSiswa) {
                        if (es.statusKenaikan === 'Belum Diproses' || es.statusKenaikan === 'Lulus') continue;
                        let targetKelasId = null;
                        if (es.statusKenaikan === 'Tidak Naik / Cuti') {
                            targetKelasId = ek.kelasId;
                        } else if (es.statusKenaikan === 'Naik Kelas') {
                            const nextKelas = await prismaCron.masterKelas.findFirst({
                                where: { sekolahId: ek.masterKelas.sekolahId, tingkatId: ek.masterKelas.tingkatId + 1, namaKelas: ek.masterKelas.namaKelas }
                            });
                            if (nextKelas) targetKelasId = nextKelas.id;
                        }
                        if (targetKelasId) {
                            let newEk = await prismaCron.enrolmentKelas.findFirst({ where: { kelasId: targetKelasId, tahunAkademikId: newTa.id } });
                            if (!newEk) {
                                newEk = await prismaCron.enrolmentKelas.create({ data: { sekolahId: ek.masterKelas.sekolahId, kelasId: targetKelasId, tahunAkademikId: newTa.id, keterangan: '' } });
                            }
                            const existingEs = await prismaCron.enrolmentSiswa.findFirst({ where: { enrolmentKelasId: newEk.id, siswaId: es.siswaId } });
                            if (!existingEs) {
                                await prismaCron.enrolmentSiswa.create({ data: { enrolmentKelasId: newEk.id, siswaId: es.siswaId, isActive: true, statusKenaikan: 'Belum Diproses' } });
                            }
                        }
                    }
                }
                console.log(`[Cron] Berhasil memproses kenaikan kelas ke TA baru`);
            }
        }

        // 2. Cek & Buat Angkatan Baru
        const lastAngkatan = await prismaCron.masterAngkatan.findFirst({
            where: { sekolahId: 1 },
            orderBy: { id: 'desc' }
        });
        
        let nextAngkatanNumber = 1;
        if (lastAngkatan && lastAngkatan.nomorAngkatan.startsWith('Angkatan ke-')) {
            const num = parseInt(lastAngkatan.nomorAngkatan.replace('Angkatan ke-', ''));
            if (!isNaN(num)) nextAngkatanNumber = num + 1;
        }

        const newAngkatanString = `Angkatan ke-${nextAngkatanNumber}`;
        const existingAngkatan = await prismaCron.masterAngkatan.findFirst({
            where: { nomorAngkatan: newAngkatanString }
        });

        if (!existingAngkatan) {
            await prismaCron.masterAngkatan.create({
                data: { nomorAngkatan: newAngkatanString, sekolahId: 1, isActive: true }
            });
            console.log(`[Cron] Berhasil menambah angkatan baru: ${newAngkatanString}`);
            
            const activeAngkatans = await prismaCron.masterAngkatan.findMany({
                where: { isActive: true, sekolahId: 1 },
                orderBy: { id: 'desc' }
            });
            
            if (activeAngkatans.length > 4) {
                for (let i = 4; i < activeAngkatans.length; i++) {
                    await prismaCron.masterAngkatan.update({
                        where: { id: activeAngkatans[i].id },
                        data: { isActive: false }
                    });
                    console.log(`[Cron] Menonaktifkan angkatan tertua: ${activeAngkatans[i].nomorAngkatan}`);
                }
            }
        }

    } catch (err) {
        console.error('[Cron] Gagal update TA/angkatan otomatis:', err.message);
    }
});

async function checkAndRevertJadwalKhusus() {
    try {
        const activeJadwal = await prismaCron.jadwalAbsensi.findFirst({
            where: { isActive: true }
        });
        
        if (activeJadwal && activeJadwal.tanggal && activeJadwal.tanggal.length > 0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const maxDate = new Date(Math.max(...activeJadwal.tanggal.map(d => new Date(d))));
            maxDate.setHours(0, 0, 0, 0);
            
            if (maxDate < today) {
                console.log(`[Cron/Init] Jadwal Khusus '${activeJadwal.namaJadwal}' sudah selesai. Mengembalikan ke jadwal reguler...`);
                
                const semuaJadwal = await prismaCron.jadwalAbsensi.findMany();
                const regulerList = semuaJadwal.filter(j => !j.tanggal || j.tanggal.length === 0);
                
                let regulerJadwal = regulerList.find(j => j.namaJadwal.toLowerCase().includes('utama')) || regulerList[0];
                
                if (regulerJadwal) {
                    await prismaCron.jadwalAbsensi.updateMany({
                        data: { isActive: false }
                    });
                    
                    await prismaCron.jadwalAbsensi.update({
                        where: { id: regulerJadwal.id },
                        data: { isActive: true }
                    });
                    console.log(`[Cron/Init] Berhasil mengaktifkan jadwal reguler: '${regulerJadwal.namaJadwal}'`);
                } else {
                    console.log(`[Cron/Init] Tidak ditemukan jadwal reguler untuk diaktifkan.`);
                }
            }
        }
    } catch (err) {
        console.error('[Cron/Init] Gagal mengecek jadwal khusus:', err.message);
    }
}

checkAndRevertJadwalKhusus();

cron.schedule('1 0 * * *', () => {
    console.log('[Cron] Mengecek kedaluwarsa jadwal khusus harian...');
    checkAndRevertJadwalKhusus();
});

// Buka Akses Folder Uploads agar file bisa dilihat
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


// --- Pendaftaran Rute ---
const authRoutes = require('./routes/auth');
const absensiRoutes = require('./routes/absensi');

app.use('/api/auth', authRoutes);
app.use('/api/guru', guruRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/absensi', absensiRoutes);

const jadwalRoutes = require('./routes/jadwal');
app.use('/api/jadwal', jadwalRoutes);

// TAMBAHAN RUTE ADMIN UNTUK FITUR CRUD & SEARCH
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
app.use('/api/admin/master', require('./routes/master'));
app.use('/api/admin/enrolment', require('./routes/enrolment'));

// --- [BARU] MOUNT RUTE BROWSER WEB ADMIN (MENAMPILKAN INTERFACE EJS) ---
// Pengguna browser laptop mengakses halaman admin lewat rute utama ini
const webAdminRoutes = require('./routes/webAdmin');
app.use(webAdminRoutes); 

app.use('/api/perizinan', require('./routes/perizinan'));

// --- PUBLIC PATH Diletakkan di sini ---
// Agar aset statis (termasuk index.html Flutter jika ada) tidak memblokir rute web admin seperti / dan /login
app.use(express.static(publicPath)); 


// --- [DIPERBAIKI] FALLBACK ROUTE FOR FLUTTER WEB ---
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  
  // Kunci Sukses Monolith: Tambahkan rute '/admin' ke dalam pengecekan bypass,
  // agar request halaman admin tidak tidak sengaja "tertelan" oleh file index.html milik Flutter Web.
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/admin')) {
      return next();
  }

  const indexHtmlPath = path.join(publicPath, 'index.html');
  res.sendFile(indexHtmlPath, err => {
    if (err) next();
  });
});

app.use((err, req, res, next) => {
    console.error("EXPRESS GLOBAL ERROR:", err);
    res.status(500).send("Global Server Error: " + err.message);
});

module.exports = app;