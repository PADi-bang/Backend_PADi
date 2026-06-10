// d:\college\TI-2C\sem 4\App_PADi\backend\src\app.js

const express = require('express');
const cors = require('cors');
const dashboardRoutes = require('./routes/dashboard')
const guruRoutes = require('./routes/guru');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api/guru', guruRoutes);
app.use(express.urlencoded({ extended: true }));
// --- Pendaftaran Rute ---
// Impor file-file rute Anda di sini
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

app.use('/api/dashboard', dashboardRoutes);

const absensiRoutes = require('./routes/absensi');
app.use('/api/absensi', absensiRoutes);

const jadwalRoutes = require('./routes/jadwal');
app.use('/api/jadwal', jadwalRoutes);

module.exports = app;