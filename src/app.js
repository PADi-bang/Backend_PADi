const express = require('express');
const cors = require('cors');
const path = require('path'); // Tambahan wajib untuk membaca folder EJS & Public

// Impor Rute API Anda
const dashboardRoutes = require('./routes/dashboard');
const guruRoutes = require('./routes/guru');
const authRoutes = require('./routes/auth');

const app = express();

// --- 1. PENGATURAN WEB ADMIN (EJS) ---
// Memberitahu Express bahwa kita menggunakan EJS
app.set('view engine', 'ejs');
// Menentukan lokasi folder 'views' (pastikan folder views berada sejajar dengan app.js)
app.set('views', path.join(__dirname, 'views'));
// Mengizinkan akses publik ke folder 'public' (untuk file CSS/Gambar web)
app.use(express.static(path.join(__dirname, 'public')));

// --- 2. MIDDLEWARE UMUM ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 3. PENDAFTARAN RUTE API (UNTUK FLUTTER MOBILE) ---
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/guru', guruRoutes);

// --- 4. PENDAFTARAN RUTE WEB ADMIN (AKSES BROWSER) ---
// Saat web utama (localhost:3000 atau URL Render) dibuka, tampilkan halaman Login
app.get('/', (req, res) => {
    // Memanggil file views/Login.ejs
    res.render('Login'); 
});

// Jika Anda sudah menghubungkan rute web admin di file terpisah (misal di folder routes),
// Anda bisa memanggilnya seperti ini:
// const webAdminRoutes = require('./routes/index');
// app.use('/', webAdminRoutes);

// --- 5. KONFIGURASI PORT DEPLOYMENT (WAJIB UNTUK SERVER CLOUD) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API & Web Admin berjalan sukses di port ${PORT}`);
});

module.exports = app;