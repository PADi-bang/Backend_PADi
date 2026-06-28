const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Middleware Auth for DevAdmin
const checkDevAdminAuth = (req, res, next) => {
    if (req.session && req.session.devAdminAuth) {
        return next();
    }
    res.redirect('/devadmin/login');
};

// Login GET
router.get('/login', (req, res) => {
    if (req.session && req.session.devAdminAuth) return res.redirect('/devadmin');
    res.render('devadmin/login', { error: req.query.error });
});

// Login POST
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    // Hardcoded dev credentials as requested: username admin, password admin
    if (username === 'admin' && password === 'admin') {
        req.session.devAdminAuth = true;
        res.redirect('/devadmin');
    } else {
        res.redirect('/devadmin/login?error=Username atau password salah');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/devadmin/login');
});

router.use(checkDevAdminAuth);

// Dashboard / Main Page
router.get('/', async (req, res) => {
    try {
        const admins = await prisma.user.findMany({
            where: { roleId: 1 },
            include: { admin: { include: { sekolah: true } } },
            orderBy: { id: 'desc' }
        });
        
        const sekolahs = await prisma.sekolah.findMany({
            orderBy: { id: 'desc' }
        });

        res.render('devadmin/dashboard', {
            title: 'Developer Dashboard',
            admins,
            sekolahs,
            success: req.query.success,
            error: req.query.error
        });
    } catch (err) {
        console.error(err);
        res.send("Error: " + err.message);
    }
});

// CREATE SEKOLAH
router.post('/sekolah', async (req, res) => {
    const { namaSekolah, alamat } = req.body;
    try {
        await prisma.sekolah.create({
            data: {
                namaSekolah,
                alamat,
                isGeofenceActive: false
            }
        });
        res.redirect('/devadmin?success=Sekolah berhasil ditambahkan');
    } catch (err) {
        console.error(err);
        res.redirect('/devadmin?error=Gagal menambah sekolah');
    }
});

// EDIT SEKOLAH
router.post('/sekolah/edit/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { namaSekolah, alamat } = req.body;
    try {
        await prisma.sekolah.update({
            where: { id },
            data: { namaSekolah, alamat }
        });
        res.redirect('/devadmin?success=Sekolah berhasil diperbarui');
    } catch (err) {
        console.error(err);
        res.redirect('/devadmin?error=Gagal memperbarui sekolah');
    }
});

// DELETE SEKOLAH
router.post('/sekolah/delete/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await prisma.sekolah.delete({ where: { id } });
        res.redirect('/devadmin?success=Sekolah berhasil dihapus');
    } catch (err) {
        console.error(err);
        res.redirect('/devadmin?error=Gagal menghapus sekolah (pastikan tidak ada admin/siswa/guru yang terhubung)');
    }
});

// CREATE ADMIN
router.post('/admin', async (req, res) => {
    const { namaAdmin, username, email, password, sekolahId } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword,
                roleId: 1, // Role: Admin
                admin: {
                    create: {
                        namaAdmin,
                        sekolahId: parseInt(sekolahId)
                    }
                }
            }
        });
        res.redirect('/devadmin?success=Admin berhasil ditambahkan');
    } catch (err) {
        console.error(err);
        res.redirect('/devadmin?error=Gagal menambah admin');
    }
});

// EDIT ADMIN
router.post('/admin/edit/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { namaAdmin, username, email, password, sekolahId } = req.body;
    try {
        let updateData = { username, email };
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                ...updateData,
                admin: {
                    upsert: {
                        create: {
                            namaAdmin,
                            sekolahId: parseInt(sekolahId)
                        },
                        update: {
                            namaAdmin,
                            sekolahId: parseInt(sekolahId)
                        }
                    }
                }
            }
        });
        res.redirect('/devadmin?success=Admin berhasil diperbarui');
    } catch (err) {
        console.error(err);
        res.redirect('/devadmin?error=Gagal memperbarui admin');
    }
});

// DELETE ADMIN
router.post('/admin/delete/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        // Find if this user has an associated admin record
        const adminRecord = await prisma.admin.findUnique({ where: { userId } });
        if (adminRecord) {
            await prisma.admin.delete({ where: { id: adminRecord.id } });
        }
        await prisma.notifikasi.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
        res.redirect('/devadmin?success=Admin berhasil dihapus');
    } catch (err) {
        console.error(err);
        res.redirect('/devadmin?error=Gagal menghapus admin');
    }
});

module.exports = router;
