const express = require('express');
const cors = require('cors');
const path = require('path'); // Wajib untuk membaca folder EJS/Public

// --- Impor Rute API ---
const dashboardRoutes = require('./routes/dashboard');
const guruRoutes = require('./routes/guru');
const authRoutes = require('./routes/auth');
const absensiRoutes = require('./routes/absensi'); // Rute baru Anda

const app = express();

// --- Pengaturan Web Admin (EJS) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Pendaftaran Rute API ---
app.use('/api/guru', guruRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/absensi', absensiRoutes); 

// --- Rute Utama Web Admin ---
app.get('/', (req, res) => {
    // Memanggil file views/Login.ejs saat halaman depan dibuka
    res.render('Login'); 
});

// --- Konfigurasi Port (Aman untuk Vercel & Lokal) ---
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 API & Web Admin berjalan di port ${PORT}`);
    });
}

// Wajib diekspor untuk Vercel Serverless
module.exports = app;