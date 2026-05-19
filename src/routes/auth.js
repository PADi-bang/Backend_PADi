const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma'); // Menggunakan Prisma Client
require('dotenv').config();

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
// Sesuai dengan skema baru di database.md
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password wajib diisi' });
  }

  try {
    // Cari user berdasarkan username menggunakan Prisma, dan ikut sertakan data role
    const user = await prisma.user.findUnique({
      where: { username: username },
      include: { role: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'Username tidak ditemukan' });
    }

    // Bandingkan password yang diinput dengan hash di database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Kombinasi username dan password salah' });
    }

    // Buat JWT token yang berisi id, username, dan nama role
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role.namaRole },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(200).json({
      message: 'Login berhasil',
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;