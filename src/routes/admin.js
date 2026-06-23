const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ==========================================
// 1. API DAFTAR SISWA (CRUD)
// ==========================================
router.get('/siswa', async (req, res) => {
    const { search } = req.query;
    try {
        let whereClause = { roleId: 3 }; 
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
            include: { siswa: { include: { sekolah: true, masterAngkatan: true } } },
            orderBy: { id: 'desc' }
        });
        res.status(200).json({ status: 'success', data: siswas });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data siswa' });
    }
});

router.post('/siswa', async (req, res) => {
    const { username, email, password, namaLengkap, nis, angkatanId, sekolahId } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                username, email, password: hashedPassword, roleId: 3,
                siswa: { create: { namaLengkap, nis, sekolahId: parseInt(sekolahId) || 1, angkatanId: parseInt(angkatanId) || null } }
            }
        });
        res.status(201).json({ status: 'success', data: newUser });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal membuat akun siswa' });
    }
});

// [BARU] EDIT SISWA
router.put('/siswa/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, email, password, namaLengkap, nis, angkatanId } = req.body;
    try {
        let updateData = { username, email };
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }
        await prisma.user.update({
            where: { id: userId },
            data: {
                ...updateData,
                siswa: { update: { namaLengkap, nis, angkatanId: parseInt(angkatanId) || null } }
            }
        });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal update data siswa' });
    }
});

// [BARU] HAPUS SISWA
router.delete('/siswa/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        // Hapus data berelasi terlebih dahulu agar tidak constraint error
        const siswa = await prisma.siswa.findUnique({ where: { userId } });
        if (siswa) {
            await prisma.absensi.deleteMany({ where: { siswaId: siswa.id } });
            await prisma.perizinan.deleteMany({ where: { siswaId: siswa.id } });
            await prisma.enrolmentSiswa.deleteMany({ where: { siswaId: siswa.id } });
            await prisma.siswa.delete({ where: { userId } });
        }
        await prisma.notifikasi.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menghapus siswa' });
    }
});

// ==========================================
// 2. API DAFTAR GURU (CRUD)
// ==========================================
router.get('/guru', async (req, res) => {
    const { search } = req.query;
    try {
        let whereClause = { roleId: 2 }; 
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
            include: { 
                guru: { 
                    include: { 
                        sekolah: true,
                        enrolmentGuru: {
                            where: { isActive: true },
                            include: {
                                enrolmentKelas: {
                                    include: { masterKelas: true }
                                }
                            }
                        }
                    } 
                } 
            },
            orderBy: { id: 'desc' }
        });
        res.status(200).json({ status: 'success', data: gurus });
    } catch (error) {
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
                guru: { create: { namaLengkap, nip, sekolahId: parseInt(sekolahId) || 1 } }
            }
        });
        res.status(201).json({ status: 'success', data: newUser });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal membuat akun guru' });
    }
});

// [BARU] EDIT GURU
router.put('/guru/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, email, password, namaLengkap, nip } = req.body;
    try {
        let updateData = { username, email };
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }
        await prisma.user.update({
            where: { id: userId },
            data: {
                ...updateData,
                guru: { update: { namaLengkap, nip } }
            }
        });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal update data guru' });
    }
});

// [BARU] ATUR KELAS GURU
router.post('/guru/:id/kelas', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { enrolmentKelasIds } = req.body;
    
    try {
        const guru = await prisma.guru.findUnique({ where: { userId } });
        if (!guru) return res.status(404).json({ status: 'error', message: 'Guru tidak ditemukan' });

        // Hapus semua penugasan kelas sebelumnya untuk guru ini
        await prisma.enrolmentGuru.deleteMany({
            where: { guruId: guru.id }
        });

        // Jika ada kelas yang dipilih, proses penambahannya
        if (enrolmentKelasIds) {
            let ids = Array.isArray(enrolmentKelasIds) ? enrolmentKelasIds : [enrolmentKelasIds];
            for (let classId of ids) {
                const enrolmentKelasId = parseInt(classId);
                
                // Pastikan hanya ada 1 wali kelas per kelas
                await prisma.enrolmentGuru.deleteMany({
                    where: { enrolmentKelasId }
                });

                await prisma.enrolmentGuru.create({
                    data: {
                        enrolmentKelasId,
                        guruId: guru.id,
                        isActive: true
                    }
                });
            }
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Gagal atur kelas:", error);
        res.status(500).json({ status: 'error', message: 'Gagal mengatur kelas guru' });
    }
});

// [BARU] HAPUS GURU
router.delete('/guru/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const guru = await prisma.guru.findUnique({ where: { userId } });
        if (guru) {
            await prisma.perizinan.updateMany({ where: { disetujuiOlehId: guru.id }, data: { disetujuiOlehId: null } });
            await prisma.enrolmentGuru.deleteMany({ where: { guruId: guru.id } });
            await prisma.guru.delete({ where: { userId } });
        }
        await prisma.notifikasi.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menghapus guru' });
    }
});

module.exports = router;