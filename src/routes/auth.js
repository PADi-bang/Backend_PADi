const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { nama, nim, password, role } = req.body;

  if (!nama || !nim || !password) {
    return res.status(400).json({ message: 'Nama, NIM, dan password wajib diisi' });
  }

  try {
    // Cek apakah NIM sudah terdaftar
    const existing = await pool.query('SELECT id FROM users WHERE nim = $1', [nim]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'NIM sudah terdaftar' });
    }

    // Hash password sebelum disimpan
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (nama, nim, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nama, nim, role`,
      [nama, nim, hashedPassword, role || 'mahasiswa']
    );

    res.status(201).json({
      message: 'Registrasi berhasil',
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { nim, password } = req.body;

  if (!nim || !password) {
    return res.status(400).json({ message: 'NIM dan password wajib diisi' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE nim = $1', [nim]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'NIM tidak ditemukan' });
    }

    const user = result.rows[0];

    // Bandingkan password yang diinput dengan hash di database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Password salah' });
    }

    // Buat JWT token, berlaku 8 jam
    const token = jwt.sign(
      { id: user.id, nim: user.nim, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(200).json({
      message: 'Login berhasil',
      token,
      user: {
        id:   user.id,
        nama: user.nama,
        nim:  user.nim,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;