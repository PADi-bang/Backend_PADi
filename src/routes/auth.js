// backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const prisma = require('../db');

// Endpoint Login Admin (POST /api/auth/login)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Cari user berdasarkan email di database sekalian menyertakan profil Admin & Role
        const user = await prisma.user.findFirst({
            where: { 
                email: email
            },
            include: {
                role: true,    // Untuk mengecek RoleName (Admin/Guru/Siswa)
                admin: true    // Untuk mengambil informasi profil namaAdmin
            }
        });

        // 2. Validasi Akun & Password (Mencocokkan teks biasa untuk keperluan pengembangan)
        // Pastikan user ditemukan, password cocok, dan rolenya adalah 'Admin'
        if (!user || user.password !== password || user.role.namaRole !== 'Admin') { 
            return res.status(401).json({ 
                success: false, 
                message: "Email, password salah, atau Anda bukan Admin!" 
            });
        }

        // 3. Buat Token JWT berdasarkan data user dan admin
        const secretKey = process.env.JWT_SECRET || "super_secret_key_anda_12345";
        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                nama: user.admin?.namaAdmin || user.username,
                role: user.role.namaRole 
            },
            secretKey,
            { expiresIn: '1d' }
        );

        // 4. Kirim response sukses beserta token ke frontend
        return res.status(200).json({
            success: true,
            message: "Login berhasil!",
            token: token,
            user: {
                username: user.username,
                nama: user.admin?.namaAdmin || user.username,
                email: user.email,
                role: user.role.namaRole
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;