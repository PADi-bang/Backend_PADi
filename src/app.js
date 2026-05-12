const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware global
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/presensi', require('./routes/presensi'));

// Route fallback jika endpoint tidak ditemukan
app.use((req, res) => {
  res.status(404).json({ message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan` });
});

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});