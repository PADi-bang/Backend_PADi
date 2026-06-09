const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); // Untuk Web Admin menembak API internal
const session = require('express-session'); // Untuk sesi login Web Admin

// --- Impor Rute API (Untuk Flutter & Web Admin) ---
const authRoutes = require('./routes/auth');
const guruRoutes = require('./routes/guru');
const dashboardRoutes = require('./routes/dashboard');
const jadwalRoutes = require('./routes/jadwal');
const absensiRoutes = require('./routes/absensi');

const app = express();

// --- Pengaturan Web Admin (EJS) ---
app.set('view engine', 'ejs');
// Mundur satu folder ('..') karena file ini berada di dalam folder 'src'
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Middleware Dasar ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Setup Session Web Admin ---
app.use(session({
    secret: 'rahasia_admin_padi_super_aman',
    resave: false,
    saveUninitialized: false
}));

// --- Middleware Proteksi Halaman Web Admin ---
const cekAdmin = (req, res, next) => {
    if (req.session.token && req.session.role === 'Admin') {
        next();
    } else {
        res.redirect('/?error=Silakan login sebagai Admin terlebih dahulu');
    }
};

// ==========================================
// 1. PENDAFTARAN RUTE API (Untuk Flutter)
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/guru', guruRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/jadwal', jadwalRoutes);
app.use('/api/absensi', absensiRoutes);


// ==========================================
// 2. RUTE HALAMAN WEB ADMIN (EJS)
// ==========================================

// Halaman Login Web Admin
app.get('/', (req, res) => {
    res.render('login', { error: req.query.error });
});

// Proses Login Web Admin (Menembak API Internal)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Trik Sakti: Mengambil domain aktif secara dinamis (bisa localhost / vercel)
        const host Aktif = `${req.protocol}://${req.get('host')}`;
        
        const response = await axios.post(`${hostAktif}/api/auth/login`, {
            email: email,
            password: password
        });

        const data = response.data;

        if (data.status === 'success' && data.data.role === 'Admin') {
            req.session.token = data.token;
            req.session.role = data.data.role;
            res.redirect('/dashboard');
        } else {
            res.redirect('/?error=Akses Ditolak: Anda bukan Admin!');
        }
    } catch (err) {
        console.error("Gagal Login API:", err.message);
        res.redirect('/?error=Kombinasi email dan password salah');
    }
});

// Halaman Dashboard Admin
app.get('/dashboard', cekAdmin, (req, res) => {
    res.render('dashboard');
});

// Halaman Daftar Siswa
app.get('/daftar-siswa', cekAdmin, (req, res) => {
    res.render('daftar_siswa');
});

// Halaman Daftar Guru
app.get('/daftar-guru', cekAdmin, (req, res) => {
    res.render('daftar_guru');
});

// Halaman Jadwal (Menembak API Internal)
app.get('/jadwal', cekAdmin, async (req, res) => {
    try {
        const hostAktif = `${req.protocol}://${req.get('host')}`;
        const response = await axios.get(`${hostAktif}/api/jadwal`);
        const data = response.data.data;
        res.render('jadwal', { jadwalList: data.jadwal, kelasList: data.kelas });
    } catch (error) {
        console.error("Error fetching jadwal:", error.message);
        res.render('jadwal', { jadwalList: [], kelasList: [] });
    }
});

// Proses Logout Web Admin
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});


// ==========================================
// 3. KONFIGURASI PORT (Lokal & Vercel)
// ==========================================
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000; // Kita satukan di port 3000 untuk lokal
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server Gabungan berjalan di port ${PORT}`);
    });
}

module.exports = app;