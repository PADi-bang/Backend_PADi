const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const xlsx = require('xlsx');
const os = require('os');

const prisma = new PrismaClient();
const upload = multer({ dest: os.tmpdir() });

// --- MIDDLEWARE AUTH ---
const checkAdminAuth = (req, res, next) => {
    if (req.session && req.session.adminId) {
        return next();
    }
    res.redirect('/login');
};

// --- AUTH ROUTES ---
router.get('/login', (req, res) => {
    if (req.session && req.session.adminId) return res.redirect('/dashboard');
    res.render('admin/Login', { error: req.query.error });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await prisma.user.findFirst({
            where: { username, roleId: 1 },
            include: { admin: true }
        });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.redirect('/login?error=Username atau password salah');
        }
        
        req.session.adminId = user.id;
        req.session.adminName = user.admin ? user.admin.namaAdmin : user.username;
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.redirect('/login?error=Terjadi kesalahan sistem');
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

router.get('/', (req, res) => res.redirect('/dashboard'));

// --- PROTECTED ROUTES ---
router.use(checkAdminAuth);

// Middleware untuk passing adminName ke semua views
router.use((req, res, next) => {
    res.locals.adminName = req.session.adminName;
    next();
});

// 1. DASHBOARD
router.get('/dashboard', async (req, res) => {
    try {
        const totalSiswa = await prisma.siswa.count();
        const totalGuru = await prisma.guru.count();
        const totalAdmin = await prisma.admin.count();
        res.render('admin/dashboard', { 
            stats: { totalSiswa, totalGuru, totalAdmin, attendanceWeekly: [0,0,0,0,0,0,0], statusChart: [0,0,0] }
        });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

// 2. SISWA
router.get('/daftar-siswa', async (req, res) => {
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
            include: {
                siswa: {
                    include: {
                        masterAngkatan: true,
                        enrolmentSiswa: { where: { isActive: true }, include: { enrolmentKelas: { include: { masterKelas: { include: { tingkat: true } } } } } }
                    }
                }
            },
            orderBy: { id: 'desc' }
        });
        const masterAngkatan = await prisma.masterAngkatan.findMany({ where: { isActive: true } });
        res.render('admin/daftar_siswa', { title: 'Daftar Siswa', siswas, masterAngkatan, search: search || '' });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

router.post('/daftar-siswa', async (req, res) => {
    const { username, email, password, namaLengkap, nis, angkatanId } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                username, email, password: hashedPassword, roleId: 3,
                siswa: { create: { namaLengkap, nis, sekolahId: 1, angkatanId: parseInt(angkatanId) || null } }
            }
        });
        res.redirect('/daftar-siswa?success=Siswa berhasil ditambahkan');
    } catch (err) {
        res.redirect('/daftar-siswa?error=Gagal menambah siswa');
    }
});

router.post('/daftar-siswa/edit/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, email, password, namaLengkap, nis, angkatanId } = req.body;
    try {
        let updateData = { username, email };
        if (password && password.trim() !== '') updateData.password = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { ...updateData, siswa: { update: { namaLengkap, nis, angkatanId: parseInt(angkatanId) || null } } }
        });
        res.redirect('/daftar-siswa?success=Data siswa diperbarui');
    } catch (err) {
        res.redirect('/daftar-siswa?error=Gagal memperbarui data');
    }
});

router.post('/daftar-siswa/delete/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const siswa = await prisma.siswa.findUnique({ where: { userId } });
        if (siswa) {
            await prisma.absensi.deleteMany({ where: { siswaId: siswa.id } });
            await prisma.perizinan.deleteMany({ where: { siswaId: siswa.id } });
            await prisma.enrolmentSiswa.deleteMany({ where: { siswaId: siswa.id } });
            await prisma.siswa.delete({ where: { userId } });
        }
        await prisma.notifikasi.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
        res.redirect('/daftar-siswa?success=Siswa berhasil dihapus');
    } catch (err) {
        res.redirect('/daftar-siswa?error=Gagal menghapus siswa');
    }
});

router.post('/daftar-siswa/upload', upload.single('file'), async (req, res) => {
    // (Akan menggunakan logika import excel yang sudah ada, redirect setelah selesai)
    res.redirect('/daftar-siswa?success=Fitur upload masih dalam perbaikan route');
});

// 3. GURU
router.get('/daftar-guru', async (req, res) => {
    const { search } = req.query;
    try {
        let whereClause = { roleId: 2 }; 
        if (search) {
            whereClause = { ...whereClause, OR: [ { username: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }, { guru: { namaLengkap: { contains: search, mode: 'insensitive' } } }, { guru: { nip: { contains: search, mode: 'insensitive' } } } ] };
        }
        const gurus = await prisma.user.findMany({
            where: whereClause,
            include: { guru: { include: { enrolmentGuru: { where: { isActive: true }, include: { enrolmentKelas: { include: { masterKelas: true } } } } } } },
            orderBy: { id: 'desc' }
        });
        res.render('admin/daftar_guru', { title: 'Daftar Guru', gurus, search: search || '' });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

router.post('/daftar-guru', async (req, res) => {
    const { username, email, password, namaLengkap, nip } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: { username, email, password: hashedPassword, roleId: 2, guru: { create: { namaLengkap, nip, sekolahId: 1 } } }
        });
        res.redirect('/daftar-guru?success=Guru berhasil ditambahkan');
    } catch (err) {
        res.redirect('/daftar-guru?error=Gagal menambah guru');
    }
});

router.post('/daftar-guru/edit/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, email, password, namaLengkap, nip } = req.body;
    try {
        let updateData = { username, email };
        if (password && password.trim() !== '') updateData.password = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { ...updateData, guru: { update: { namaLengkap, nip } } }
        });
        res.redirect('/daftar-guru?success=Data guru diperbarui');
    } catch (err) {
        res.redirect('/daftar-guru?error=Gagal memperbarui data');
    }
});

router.post('/daftar-guru/delete/:id', async (req, res) => {
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
        res.redirect('/daftar-guru?success=Guru berhasil dihapus');
    } catch (err) {
        res.redirect('/daftar-guru?error=Gagal menghapus guru');
    }
});

// 4. MASTER DATA
router.get('/master-data', async (req, res) => {
    try {
        const pengaturan = await prisma.pengaturan.findMany();
        const kelas = await prisma.masterKelas.findMany({ include: { tingkat: true } });
        const angkatan = await prisma.masterAngkatan.findMany();
        const tahunAkademik = await prisma.masterTahunAkademik.findMany();
        
        let settingMap = {};
        pengaturan.forEach(p => settingMap[p.kunci] = p.nilai);

        res.render('admin/master_data', { pengaturan: settingMap, kelas, angkatan, tahunAkademik });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

// MASTER DATA POST HANDLERS (Minimal implementations for now)
router.post('/master-data/pengaturan', async (req, res) => { res.redirect('/master-data?success=Berhasil'); });
router.post('/master-data/kelas', async (req, res) => { res.redirect('/master-data?success=Berhasil'); });
router.post('/master-data/angkatan', async (req, res) => { res.redirect('/master-data?success=Berhasil'); });
router.post('/master-data/tahun-akademik', async (req, res) => { res.redirect('/master-data?success=Berhasil'); });
router.post('/master-data/kelas/delete-group/:group', async (req, res) => { res.redirect('/master-data?success=Berhasil'); });
router.post('/master-data/angkatan/delete/:id', async (req, res) => { res.redirect('/master-data?success=Berhasil'); });
router.post('/master-data/tahun-akademik/activate/:id', async (req, res) => { res.redirect('/master-data?success=Berhasil'); });
router.post('/master-data/tahun-akademik/delete/:id', async (req, res) => { res.redirect('/master-data?success=Berhasil'); });


// 5. ENROLMENT
router.get('/enrolment', async (req, res) => {
    try {
        const enrolments = await prisma.enrolmentKelas.findMany({
            include: { masterKelas: { include: { tingkat: true } }, enrolmentSiswa: { where: { isActive: true } }, enrolmentGuru: { where: { isActive: true } } }
        });
        const activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true } });
        res.render('admin/enrolment', { enrolments, activeTa });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

// 6. JADWAL
router.get('/jadwal', async (req, res) => {
    try {
        const jadwals = await prisma.jadwalAbsensi.findMany();
        res.render('admin/jadwal', { jadwals });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

module.exports = router;


