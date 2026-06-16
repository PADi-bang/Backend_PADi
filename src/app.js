//App_PADi\backend\src\app.js

const express = require('express');
const cors = require('cors');
const path = require('path'); // Tambahan untuk path
const dashboardRoutes = require('./routes/dashboard');
const guruRoutes = require('./routes/guru');
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Untuk parsing body JSON
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Untuk parsing body URL-encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- JADWAL OTOMATIS (CRON JOBS) ---
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prismaCron = new PrismaClient();

// Fungsi mengecek semester aktif dan update semua Tahun Akademik yg aktif
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
        
        // Update semua TA aktif
        await prismaCron.masterTahunAkademik.updateMany({
            where: { isActive: true },
            data: { semester: semesterHarusnya }
        });
        console.log(`[Cron] Sync Semester Selesai. Set ke: ${semesterHarusnya}`);
    } catch(err) {
        console.error('[Cron] Gagal sync semester:', err.message);
    }
}

// 1. Cron Job: Setiap tanggal 1 setiap bulan, cek dan update semester
cron.schedule('0 0 1 * *', () => {
    console.log('[Cron] Menjalankan pengecekan pergantian semester...');
    syncSemesterAktif();
});

// 2. Cron Job: Setiap tanggal 1 Juli, otomatis tambah Angkatan baru dan nonaktifkan angkatan tertua (jika lebih dari 3)
cron.schedule('0 0 1 7 *', async () => {
    try {
        console.log('[Cron] Menjalankan pengecekan angkatan baru...');
        const tahunSekarang = new Date().getFullYear();
        
        // Cek apakah angkatan tahun ini sudah ada
        const existing = await prismaCron.masterAngkatan.findFirst({
            where: { nomorAngkatan: tahunSekarang.toString() }
        });
        
        if (!existing) {
            // Buat angkatan baru
            await prismaCron.masterAngkatan.create({
                data: { nomorAngkatan: tahunSekarang.toString(), sekolahId: 1, isActive: true }
            });
            console.log(`[Cron] Berhasil menambah angkatan baru: ${tahunSekarang}`);
            
            // Ambil semua angkatan yang aktif
            const activeAngkatans = await prismaCron.masterAngkatan.findMany({
                where: { isActive: true },
                orderBy: { nomorAngkatan: 'desc' }
            });
            
            // Jika ada lebih dari 4 yang aktif, nonaktifkan sisanya (yang lebih tua)
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
        console.error('[Cron] Gagal update angkatan:', err.message);
    }
});

// ---> [BARU] Buka Akses Folder Uploads agar file bisa dilihat <---
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// --- Pendaftaran Rute ---
// Impor file-file rute Anda di sini
const authRoutes = require('./routes/auth');
const absensiRoutes = require('./routes/absensi');

app.use('/api/auth', authRoutes);
app.use('/api/guru', guruRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/absensi', absensiRoutes);

const jadwalRoutes = require('./routes/jadwal');
app.use('/api/jadwal', jadwalRoutes);

// ---> TAMBAHAN RUTE ADMIN UNTUK FITUR CRUD & SEARCH <---
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
app.use('/api/admin/master', require('./routes/master'));
app.use('/api/admin/enrolment', require('./routes/enrolment'));
app.use('/api/guru', guruRoutes);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/absensi', require('./routes/absensi'));
app.use('/api/jadwal', require('./routes/jadwal'));
app.use('/api/admin', require('./routes/admin'));

// ---> [BARU] RUTE PERIZINAN <---
app.use('/api/perizinan', require('./routes/perizinan'));

module.exports = app;