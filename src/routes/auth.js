// backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const bcrypt = require('bcryptjs');

// POST /api/auth/register
// Sesuai dengan skema baru di database.md
router.post('/register', async (req, res) => {
  const { username, email, password, roleName } = req.body; // roleName: 'Siswa', 'Guru', atau 'Admin'

  if (!username || !email || !password || !roleName) {
    return res.status(400).json({ message: 'Username, email, password, dan roleName wajib diisi' });
  }

  try {
    // Cek apakah username atau email sudah terdaftar menggunakan Prisma
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: username }, { email: email }],
      },
    });

    if (existingUser) {
      return res.status(409).json({ message: 'Username atau email sudah terdaftar' });
    }

    // Cari ID role berdasarkan nama role
    const role = await prisma.role.findFirst({
      where: { namaRole: roleName },
    });

    if (!role) {
      return res.status(400).json({ message: 'Role tidak valid. Gunakan: Siswa, Guru, Admin' });
    }

    // Hash password sebelum disimpan
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user baru menggunakan Prisma
    const newUser = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        roleId: role.id, // Hubungkan dengan ID role yang ditemukan
      },
      select: { // Hanya kembalikan data yang aman
        id: true,
        username: true,
        email: true,
        role: {
          select: {
            namaRole: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Registrasi berhasil',
      user: newUser,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

// POST /api/auth/login
// Sesuai dengan skema baru di database.md dan terhubung dengan Flutter
router.post('/login', async (req, res) => {
  // 1. Terima 'email' dari Flutter, atau 'username' (opsional)
  const { username, email, password } = req.body;
  const loginIdentifier = email || username;

  if (!loginIdentifier || !password) {
    return res.status(400).json({ status: 'error', message: 'Email/Username dan password wajib diisi' });
  }

  try {
    // 2. Cari user berdasarkan username ATAU email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: loginIdentifier },
          { email: loginIdentifier }
        ]
      },
      include: { role: true },
    });

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Email atau password salah' });
    }

   // 3. Bandingkan password yang diinput dengan hash di database MENGGUNAKAN BCRYPT
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ status: 'error', message: 'Email atau password salah' });
    }

    // 4. Buat JWT token (Standar keamanan teman Anda tetap berjalan!)
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role.namaRole },
      process.env.JWT_SECRET, // Pastikan ada JWT_SECRET di file .env Anda!
      { expiresIn: '8h' }
    );

    // 5. Kembalikan respons yang dimengerti oleh Flutter (status & data.role)
    res.status(200).json({
      status: 'success',
      message: 'Login berhasil',
      token: token,
      data: {
        id: user.id,
        role: user.role.namaRole,
        username: user.username
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});
// GET /api/auth/users
// Mengambil semua data pengguna beserta rolenya (Cocok untuk halaman Daftar Siswa/Guru)
router.get('/users', async (req, res) => {
  try {
    // Gunakan findMany() untuk mengambil BANYAK data (bukan cuma satu)
    const allUsers = await prisma.user.findMany({
      // Kita gunakan 'select' agar password tidak ikut terkirim ke public!
      select: {
        id: true,
        username: true,
        email: true,
        role: {
          select: {
            namaRole: true
          }
        }
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Berhasil mengambil data pengguna',
      data: allUsers
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Terjadi kesalahan server' });
  }
});
module.exports = router;