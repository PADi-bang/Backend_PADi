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

const { PrismaClient } = require('@prisma/client');
const { PrismaSessionStore } = require('@quixo3/prisma-session-store');
const prismaSessionClient = new PrismaClient();

// --- [BARU] MIDDLEWARE SESSION (DIPERBARUI MENGGUNAKAN POSTGRESQL/PRISMA) ---
// Diperlukan untuk menyimpan status login user admin dengan permanen di database
app.use(session({
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000 // 1 minggu
    },
    secret: 'padi-geofencing-secret-key-xyz',
    resave: false,
    saveUninitialized: true,
    store: new PrismaSessionStore(
        prismaSessionClient,
        {
            checkPeriod: 2 * 60 * 1000,  // 2 menit
            dbRecordIdIsSessionId: true,
            dbRecordIdFunction: undefined,
        }
    )
}));

// app.use(express.static(publicPath)); // Dipindahkan ke bawah agar rute Web Admin dieksekusi lebih dulu
// --- JADWAL OTOMATIS (CRON JOBS) & INIT ---
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const { initCronNotifications } = require('./utils/cronNotifications');

// Inisialisasi notifikasi terjadwal
initCronNotifications();

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

// [DIHAPUS] cron.schedule('0 0 1 7 *') untuk kenaikan kelas otomatis dihapus berdasarkan permintaan.
// Harap gunakan endpoint API atau Web Admin untuk memicu kenaikan kelas secara manual.

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

app.use('/api/perizinan', require('./routes/perizinan'));
app.use('/api/notifikasi', require('./routes/notifikasi')); // Tambahkan rute notifikasi yang hilang

// --- [BARU] MOUNT RUTE BROWSER WEB ADMIN (MENAMPILKAN INTERFACE EJS) ---
// Pengguna browser laptop mengakses halaman admin lewat rute utama ini
const webAdminRoutes = require('./routes/webAdmin');
app.use(webAdminRoutes);

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
    if (req.path.startsWith('/api')) {
        res.status(500).json({ status: 'error', message: err.message || 'Global Server Error' });
    } else {
        res.status(500).send("Global Server Error: " + err.message);
    }
});

module.exports = app;