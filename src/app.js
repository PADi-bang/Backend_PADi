// d:\college\TI-2C\sem 4\App_PADi\backend\src\app.js

const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- Pendaftaran Rute ---
// Impor file-file rute Anda di sini
const authRoutes = require('./routes/auth');

// Daftarkan rute dengan prefix-nya masing-masing
app.use('/api/auth', authRoutes);

module.exports = app;