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
app.use('/api/guru', guruRoutes);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/absensi', require('./routes/absensi'));
app.use('/api/jadwal', require('./routes/jadwal'));
app.use('/api/admin', require('./routes/admin'));

// ---> [BARU] RUTE PERIZINAN <---
app.use('/api/perizinan', require('./routes/perizinan'));

module.exports = app;