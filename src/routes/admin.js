// backend/src/routes/admin.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ==========================================
// 1. API DAFTAR SISWA (GET & POST)
// ==========================================
router.get('/siswa', async (req, res) => {
    const { search } = req.query;
    try {
        let whereClause = { roleId: 3 }; // 3 = ID Role Siswa di database
        
        // Logika Search Bar
        if (search) {
            whereClause = {
                ...whereClause,
                OR: [
                    { username: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { siswa: { namaLengkap: { contains: search, mode: 'insensitive' } } },
                    { siswa: { nis: { contains: search, mode: 'insensitive' } } }
                ]
            };
        }

        const siswas = await prisma.user.findMany({
            where: whereClause,
            include: { siswa: { include: { sekolah: true } } },
            orderBy: { id: 'desc' } // Mengurutkan dari yang terbaru ditambahkan
        });

        res.status(200).json({ status: 'success', data: siswas });
    } catch (error) {
        console.error("Error GET Siswa:", error.message);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data siswa' });
    }
});

router.post('/siswa', async (req, res) => {
    const { username, email, password, namaLengkap, nis, sekolahId } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                username, email, password: hashedPassword, roleId: 3,
                siswa: {
                    create: { namaLengkap, nis, sekolahId: parseInt(sekolahId) || 1 }
                }
            }
        });
        res.status(201).json({ status: 'success', data: newUser });
    } catch (error) {
        console.error("Error POST Siswa:", error.message);
        res.status(500).json({ status: 'error', message: 'Gagal membuat akun siswa' });
    }
});

// ==========================================
// 2. API DAFTAR GURU (GET & POST)
// ==========================================
router.get('/guru', async (req, res) => {
    const { search } = req.query;
    try {
        let whereClause = { roleId: 2 }; // 2 = ID Role Guru
        
        if (search) {
            whereClause = {
                ...whereClause,
                OR: [
                    { username: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { guru: { namaLengkap: { contains: search, mode: 'insensitive' } } },
                    { guru: { nip: { contains: search, mode: 'insensitive' } } }
                ]
            };
        }

        const gurus = await prisma.user.findMany({
            where: whereClause,
            include: { guru: { include: { sekolah: true } } },
            orderBy: { id: 'desc' }
        });

        res.status(200).json({ status: 'success', data: gurus });
    } catch (error) {
        console.error("Error GET Guru:", error.message);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data guru' });
    }
});

router.post('/guru', async (req, res) => {
    const { username, email, password, namaLengkap, nip, sekolahId } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                username, email, password: hashedPassword, roleId: 2,
                guru: {
                    create: { namaLengkap, nip, sekolahId: parseInt(sekolahId) || 1 }
                }
            }
        });
        res.status(201).json({ status: 'success', data: newUser });
    } catch (error) {
        console.error("Error POST Guru:", error.message);
        res.status(500).json({ status: 'error', message: 'Gagal membuat akun guru' });
    }
});

module.exports = router;