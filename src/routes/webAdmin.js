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
    const identifier = req.body.username || req.body.email;
    const password = req.body.password;
    try {
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: identifier },
                    { email: identifier }
                ],
                role: { namaRole: 'Admin' }
            },
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

        const activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true } });
        let mappedEnrolments = [];
        if (activeTa) {
            const rawEnrolments = await prisma.enrolmentKelas.findMany({
                where: { tahunAkademikId: activeTa.id },
                include: { masterKelas: { include: { tingkat: true } } }
            });
            mappedEnrolments = rawEnrolments.map(e => ({
                enrolment: e,
                masterKelas: {
                    ...e.masterKelas,
                    namaKelas: e.masterKelas.tingkat ? `${e.masterKelas.tingkat.namaTingkat} ${e.masterKelas.namaKelas}` : e.masterKelas.namaKelas
                }
            }));
        }

        res.render('admin/daftar_guru', { title: 'Daftar Guru', gurus, enrolments: mappedEnrolments, search: search || '' });
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

router.post('/daftar-guru/:id/kelas', async (req, res) => {
    const userId = parseInt(req.params.id);
    let { enrolmentKelasIds } = req.body;
    try {
        const guru = await prisma.guru.findUnique({ where: { userId } });
        if (!guru) return res.redirect('/daftar-guru?error=Guru tidak ditemukan');

        const activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true } });
        if (!activeTa) return res.redirect('/daftar-guru?error=Tidak ada TA aktif');

        const activeEnrolmentKelas = await prisma.enrolmentKelas.findMany({ where: { tahunAkademikId: activeTa.id } });
        const activeEkIds = activeEnrolmentKelas.map(ek => ek.id);

        await prisma.enrolmentGuru.deleteMany({
            where: {
                guruId: guru.id,
                enrolmentKelasId: { in: activeEkIds }
            }
        });

        if (enrolmentKelasIds) {
            if (!Array.isArray(enrolmentKelasIds)) enrolmentKelasIds = [enrolmentKelasIds];
            for (const ekId of enrolmentKelasIds) {
                await prisma.enrolmentGuru.create({
                    data: {
                        guruId: guru.id,
                        enrolmentKelasId: parseInt(ekId),
                        isActive: true
                    }
                });
            }
        }
        res.redirect('/daftar-guru?success=Kelas berhasil diperbarui');
    } catch (err) {
        res.redirect('/daftar-guru?error=Gagal mengatur kelas');
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
        const kelasRaw = await prisma.masterKelas.findMany({ include: { tingkat: true } });
        const angkatan = await prisma.masterAngkatan.findMany({ orderBy: { nomorAngkatan: 'asc' } });
        const tahunAkademik = await prisma.masterTahunAkademik.findMany({ orderBy: { tahunAjaran: 'asc' } });
        
        let settingMap = {};
        pengaturan.forEach(p => settingMap[p.kunci] = p.nilai);
        if (settingMap['tanggal_mulai_ganjil']) {
            const [b, t] = settingMap['tanggal_mulai_ganjil'].split('-');
            settingMap.bulanGanjil = parseInt(b);
            settingMap.tanggalGanjil = parseInt(t);
        }
        if (settingMap['tanggal_mulai_genap']) {
            const [b, t] = settingMap['tanggal_mulai_genap'].split('-');
            settingMap.bulanGenap = parseInt(b);
            settingMap.tanggalGenap = parseInt(t);
        }

        // Group master kelas based on namaKelas (suffix)
        const groups = [...new Set(kelasRaw.map(k => k.namaKelas))];
        const kelas = groups.map(g => ({ namaGroup: g }));

        res.render('admin/master_data', { pengaturan: settingMap, kelas, angkatan, tahunAkademik });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

// Fungsi helper untuk mendapatkan semester aktif saat ini
async function getSemesterAktif() {
    const now = new Date();
    const currentYear = now.getFullYear();
    let tglGanjil = "07-15"; let tglGenap = "01-10";
    try {
        const config = await prisma.pengaturan.findMany();
        config.forEach(c => {
            if(c.kunci === 'tanggal_mulai_ganjil') tglGanjil = c.nilai;
            if(c.kunci === 'tanggal_mulai_genap') tglGenap = c.nilai;
        });
    } catch(e) {}
    const [bulanGanjil, hariGanjil] = tglGanjil.split('-').map(Number);
    const [bulanGenap, hariGenap] = tglGenap.split('-').map(Number);
    const dateGanjil = new Date(currentYear, bulanGanjil - 1, hariGanjil);
    const dateGenap = new Date(currentYear, bulanGenap - 1, hariGenap);
    if (dateGanjil < dateGenap) {
        if (now >= dateGanjil && now < dateGenap) return 'Ganjil';
        return 'Genap';
    } else {
        if (now >= dateGenap && now < dateGanjil) return 'Genap';
        return 'Ganjil';
    }
}

// MASTER DATA POST HANDLERS
router.post('/master-data/pengaturan', async (req, res) => {
    const { tanggalGanjil, bulanGanjil, tanggalGenap, bulanGenap } = req.body;
    try {
        const formatTgl = (b, t) => `${String(b).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
        const ganjilFormatted = formatTgl(bulanGanjil, tanggalGanjil);
        const genapFormatted = formatTgl(bulanGenap, tanggalGenap);
        if (ganjilFormatted === genapFormatted) return res.redirect('/master-data?error=Tanggal tidak boleh sama');
        const settings = [
            { kunci: 'tanggal_mulai_ganjil', nilai: ganjilFormatted },
            { kunci: 'tanggal_mulai_genap', nilai: genapFormatted }
        ];
        for (const s of settings) {
            if (s.nilai && !s.nilai.includes('undefined')) {
                await prisma.pengaturan.upsert({
                    where: { kunci: s.kunci }, update: { nilai: s.nilai }, create: { kunci: s.kunci, nilai: s.nilai }
                });
            }
        }
        const semesterAktif = await getSemesterAktif();
        await prisma.masterTahunAkademik.updateMany({ where: { isActive: true }, data: { semester: semesterAktif } });
        res.redirect('/master-data?success=Pengaturan berhasil disimpan');
    } catch (err) { res.redirect('/master-data?error=Gagal menyimpan pengaturan'); }
});

router.post('/master-data/kelas', async (req, res) => {
    const { namaKelasAkhiran, sekolahId } = req.body;
    try {
        const suffix = namaKelasAkhiran.trim().toUpperCase();
        const tingkats = await prisma.masterTingkat.findMany({ orderBy: { id: 'asc' } });
        const existing = await prisma.masterKelas.findFirst({
            where: { namaKelas: { equals: suffix, mode: 'insensitive' }, sekolahId: parseInt(sekolahId) || 1 }
        });
        if (existing) return res.redirect('/master-data?error=Nama kelas sudah ada');
        for (const t of tingkats) {
            await prisma.masterKelas.create({
                data: { namaKelas: suffix, tingkatId: t.id, sekolahId: parseInt(sekolahId) || 1 }
            });
        }
        res.redirect('/master-data?success=Kelas berhasil ditambahkan');
    } catch (err) { res.redirect('/master-data?error=Gagal menambah kelas'); }
});

router.post('/master-data/kelas/delete-group/:group', async (req, res) => {
    const suffix = decodeURIComponent(req.params.group);
    try {
        const classes = await prisma.masterKelas.findMany({ where: { namaKelas: { equals: suffix, mode: 'insensitive' } } });
        const classIds = classes.map(c => c.id);
        const enrolments = await prisma.enrolmentKelas.findMany({ where: { kelasId: { in: classIds } } });
        for (const e of enrolments) {
            await prisma.enrolmentSiswa.deleteMany({ where: { enrolmentKelasId: e.id } });
            await prisma.enrolmentGuru.deleteMany({ where: { enrolmentKelasId: e.id } });
        }
        await prisma.enrolmentKelas.deleteMany({ where: { kelasId: { in: classIds } } });
        await prisma.masterKelas.deleteMany({ where: { id: { in: classIds } } });
        res.redirect('/master-data?success=Kelas berhasil dihapus');
    } catch (err) { res.redirect('/master-data?error=Gagal menghapus kelas'); }
});

router.post('/master-data/angkatan', async (req, res) => {
    const { nomorAngkatan, sekolahId } = req.body;
    try {
        const formattedAngkatan = `Angkatan ke-${nomorAngkatan}`;
        const existing = await prisma.masterAngkatan.findFirst({
            where: { nomorAngkatan: { equals: formattedAngkatan, mode: 'insensitive' }, sekolahId: parseInt(sekolahId) || 1 }
        });
        if (existing) return res.redirect('/master-data?error=Angkatan sudah ada');
        const activeCount = await prisma.masterAngkatan.count({ where: { isActive: true, sekolahId: parseInt(sekolahId) || 1 } });
        await prisma.masterAngkatan.create({
            data: { nomorAngkatan: formattedAngkatan, sekolahId: parseInt(sekolahId) || 1, isActive: activeCount < 4 }
        });
        res.redirect('/master-data?success=Angkatan berhasil ditambahkan');
    } catch (err) { res.redirect('/master-data?error=Gagal menambah angkatan'); }
});

router.post('/master-data/angkatan/delete/:id', async (req, res) => {
    try {
        await prisma.siswa.updateMany({ where: { angkatanId: parseInt(req.params.id) }, data: { angkatanId: null } });
        await prisma.masterAngkatan.delete({ where: { id: parseInt(req.params.id) } });
        res.redirect('/master-data?success=Angkatan berhasil dihapus');
    } catch (err) { res.redirect('/master-data?error=Gagal menghapus angkatan'); }
});

router.post('/master-data/tahun-akademik', async (req, res) => {
    const { tahunAjaran, isActive, sekolahId } = req.body;
    try {
        const existing = await prisma.masterTahunAkademik.findFirst({
            where: { tahunAjaran: { equals: tahunAjaran, mode: 'insensitive' }, sekolahId: parseInt(sekolahId) || 1 }
        });
        if (existing) return res.redirect('/master-data?error=Tahun akademik sudah ada');
        const semesterAktif = await getSemesterAktif();
        let newIsActive = isActive === 'true' || isActive === true;
        if (newIsActive) {
            await prisma.masterTahunAkademik.updateMany({ where: { sekolahId: parseInt(sekolahId) || 1 }, data: { isActive: false } });
        }
        await prisma.masterTahunAkademik.create({
            data: { tahunAjaran, semester: semesterAktif, isActive: newIsActive, sekolahId: parseInt(sekolahId) || 1 }
        });
        res.redirect('/master-data?success=Tahun akademik berhasil ditambahkan');
    } catch (err) { res.redirect('/master-data?error=Gagal menambah tahun akademik'); }
});

router.post('/master-data/tahun-akademik/activate/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const ta = await prisma.masterTahunAkademik.findUnique({ where: { id } });
        if (ta && !ta.isActive) {
            const oldTa = await prisma.masterTahunAkademik.findFirst({ where: { sekolahId: ta.sekolahId, isActive: true } });
            await prisma.masterTahunAkademik.updateMany({ where: { sekolahId: ta.sekolahId }, data: { isActive: false } });
            await prisma.masterTahunAkademik.update({ where: { id }, data: { isActive: true } });

            // Proses Kenaikan Kelas Otomatis
            if (oldTa && oldTa.id !== id) {
                const oldEnrolments = await prisma.enrolmentKelas.findMany({
                    where: { tahunAkademikId: oldTa.id },
                    include: {
                        masterKelas: true,
                        enrolmentSiswa: { where: { isActive: true } }
                    }
                });

                for (const ek of oldEnrolments) {
                    for (const es of ek.enrolmentSiswa) {
                        if (es.statusKenaikan === 'Belum Diproses' || es.statusKenaikan === 'Lulus') continue;

                        let targetKelasId = null;

                        if (es.statusKenaikan === 'Tidak Naik / Cuti') {
                            targetKelasId = ek.kelasId;
                        } else if (es.statusKenaikan === 'Naik Kelas') {
                            const nextKelas = await prisma.masterKelas.findFirst({
                                where: {
                                    sekolahId: ek.masterKelas.sekolahId,
                                    tingkatId: ek.masterKelas.tingkatId + 1,
                                    namaKelas: ek.masterKelas.namaKelas
                                }
                            });
                            if (nextKelas) targetKelasId = nextKelas.id;
                        }

                        if (targetKelasId) {
                            let newEk = await prisma.enrolmentKelas.findFirst({
                                where: { kelasId: targetKelasId, tahunAkademikId: id }
                            });
                            if (!newEk) {
                                newEk = await prisma.enrolmentKelas.create({
                                    data: { sekolahId: ta.sekolahId, kelasId: targetKelasId, tahunAkademikId: id, keterangan: '' }
                                });
                            }
                            const existingEs = await prisma.enrolmentSiswa.findFirst({
                                where: { enrolmentKelasId: newEk.id, siswaId: es.siswaId }
                            });
                            if (!existingEs) {
                                await prisma.enrolmentSiswa.create({
                                    data: { enrolmentKelasId: newEk.id, siswaId: es.siswaId, isActive: true, statusKenaikan: 'Belum Diproses' }
                                });
                            }
                        }
                    }
                }
            }
        }
        res.redirect('/master-data?success=Tahun akademik berhasil diaktifkan dan kenaikan kelas diproses');
    } catch (err) { res.redirect('/master-data?error=Gagal mengaktifkan tahun akademik'); }
});

router.post('/master-data/tahun-akademik/delete/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const enrolments = await prisma.enrolmentKelas.findMany({ where: { tahunAkademikId: id } });
        for (const e of enrolments) {
            await prisma.enrolmentSiswa.deleteMany({ where: { enrolmentKelasId: e.id } });
            await prisma.enrolmentGuru.deleteMany({ where: { enrolmentKelasId: e.id } });
        }
        await prisma.enrolmentKelas.deleteMany({ where: { tahunAkademikId: id } });
        await prisma.masterTahunAkademik.delete({ where: { id } });
        res.redirect('/master-data?success=Tahun akademik berhasil dihapus');
    } catch (err) { res.redirect('/master-data?error=Gagal menghapus tahun akademik'); }
});


// 5. ENROLMENT
router.get('/enrolment', async (req, res) => {
    try {
        const taId = req.query.taId ? parseInt(req.query.taId) : null;
        let activeTa = null;
        if (taId) activeTa = await prisma.masterTahunAkademik.findUnique({ where: { id: taId } });
        if (!activeTa) activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true } });

        const masterKelasList = await prisma.masterKelas.findMany({
            include: { tingkat: true },
            orderBy: [{ tingkatId: 'asc' }, { namaKelas: 'asc' }]
        });
        
        const enrolments = await prisma.enrolmentKelas.findMany({
            where: {
                sekolahId: 1,
                tahunAkademikId: activeTa ? activeTa.id : undefined
            },
            include: {
                masterKelas: { include: { tingkat: true } },
                masterTahunAkademik: true,
                enrolmentGuru: { where: { isActive: true }, include: { guru: true } },
                _count: { select: { enrolmentSiswa: { where: { isActive: true } }, enrolmentGuru: { where: { isActive: true } } } }
            }
        });

        const data = masterKelasList.flatMap(mk => {
            const mappedMk = {
                ...mk,
                namaKelasSuffix: mk.namaKelas,
                namaKelas: mk.tingkat ? `${mk.tingkat.namaTingkat} ${mk.namaKelas}` : mk.namaKelas
            };
            const classEnrolments = enrolments.filter(e => e.kelasId === mk.id);
            
            if (classEnrolments.length > 0) {
                return classEnrolments.map(enrolment => {
                    enrolment.masterKelas = mappedMk;
                    return { masterKelas: mappedMk, enrolment: enrolment };
                });
            } else {
                return [{ masterKelas: mappedMk, enrolment: null }];
            }
        });

        const taList = await prisma.masterTahunAkademik.findMany({ orderBy: { tahunAjaran: 'asc' } });
        const masterData = { ta: taList };

        res.render('admin/enrolment', { enrolmentData: data, masterData, selectedTaId: activeTa ? activeTa.id : null });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

router.get('/enrolment/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const enrolment = await prisma.enrolmentKelas.findUnique({
            where: { id },
            include: {
                masterKelas: { include: { tingkat: true } },
                masterTahunAkademik: true,
                enrolmentSiswa: {
                    where: { isActive: true },
                    include: { siswa: { include: { masterAngkatan: true } } }
                },
                enrolmentGuru: {
                    where: { isActive: true },
                    include: { guru: true }
                }
            }
        });

        if (!enrolment) return res.render('admin/error', { message: 'Kelas tidak ditemukan' });

        if (enrolment.masterKelas) {
            enrolment.masterKelas.namaKelasSuffix = enrolment.masterKelas.namaKelas;
            enrolment.masterKelas.namaKelas = enrolment.masterKelas.tingkat ? `${enrolment.masterKelas.tingkat.namaTingkat} ${enrolment.masterKelas.namaKelas}` : enrolment.masterKelas.namaKelas;
        }

        const [allSiswa, allGuru] = await Promise.all([
            prisma.siswa.findMany({ include: { masterAngkatan: true } }),
            prisma.guru.findMany()
        ]);

        const detail = { enrolment, allSiswa, allGuru };
        res.render('admin/enrolment_detail', { detail });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

// ENROLMENT POST HANDLERS
router.post('/enrolment/activate-kelas', async (req, res) => {
    const { kelasId, sekolahId } = req.body;
    try {
        const activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true, sekolahId: parseInt(sekolahId) || 1 } });
        if (!activeTa) return res.redirect('/enrolment?error=Tidak ada Tahun Akademik aktif');
        const existingEnrolment = await prisma.enrolmentKelas.findFirst({ where: { kelasId: parseInt(kelasId), tahunAkademikId: activeTa.id } });
        if (!existingEnrolment) {
            await prisma.enrolmentKelas.create({
                data: { sekolahId: parseInt(sekolahId) || 1, kelasId: parseInt(kelasId), tahunAkademikId: activeTa.id, keterangan: '' }
            });
        }
        res.redirect('/enrolment?success=Kelas berhasil diaktifkan');
    } catch (err) { res.redirect('/enrolment?error=Gagal mengaktifkan kelas'); }
});

router.post('/enrolment/:id/siswa', async (req, res) => {
    const enrolmentKelasId = parseInt(req.params.id);
    const { siswaId } = req.body;
    try {
        const existing = await prisma.enrolmentSiswa.findFirst({ where: { enrolmentKelasId, siswaId: parseInt(siswaId) } });
        if (existing) return res.redirect(`/enrolment/${enrolmentKelasId}?error=Siswa sudah ada di kelas ini`);
        await prisma.enrolmentSiswa.create({ data: { enrolmentKelasId, siswaId: parseInt(siswaId), isActive: true } });
        res.redirect(`/enrolment/${enrolmentKelasId}?success=Siswa berhasil ditambahkan`);
    } catch (err) { res.redirect(`/enrolment/${enrolmentKelasId}?error=Gagal menambah siswa`); }
});

router.post('/enrolment/:id/siswa/delete/:siswaId', async (req, res) => {
    const enrolmentKelasId = parseInt(req.params.id);
    const siswaId = parseInt(req.params.siswaId);
    try {
        await prisma.enrolmentSiswa.deleteMany({ where: { enrolmentKelasId, siswaId } });
        res.redirect(`/enrolment/${enrolmentKelasId}?success=Siswa berhasil dikeluarkan`);
    } catch (err) { res.redirect(`/enrolment/${enrolmentKelasId}?error=Gagal mengeluarkan siswa`); }
});

router.post('/enrolment/:id/guru', async (req, res) => {
    const enrolmentKelasId = parseInt(req.params.id);
    const { guruId } = req.body;
    try {
        const existing = await prisma.enrolmentGuru.findFirst({ where: { enrolmentKelasId, guruId: parseInt(guruId) } });
        if (existing) return res.redirect(`/enrolment/${enrolmentKelasId}?error=Guru sudah ada di kelas ini`);
        await prisma.enrolmentGuru.create({ data: { enrolmentKelasId, guruId: parseInt(guruId), isActive: true } });
        res.redirect(`/enrolment/${enrolmentKelasId}?success=Wali kelas berhasil ditambahkan`);
    } catch (err) { res.redirect(`/enrolment/${enrolmentKelasId}?error=Gagal menambah wali kelas`); }
});

router.post('/enrolment/:id/guru/delete/:guruId', async (req, res) => {
    const enrolmentKelasId = parseInt(req.params.id);
    const guruId = parseInt(req.params.guruId);
    try {
        await prisma.enrolmentGuru.deleteMany({ where: { enrolmentKelasId, guruId } });
        res.redirect(`/enrolment/${enrolmentKelasId}?success=Wali kelas berhasil dihapus`);
    } catch (err) { res.redirect(`/enrolment/${enrolmentKelasId}?error=Gagal menghapus wali kelas`); }
});

router.post('/enrolment/:id/proses-kenaikan', async (req, res) => {
    const currentEnrolmentKelasId = parseInt(req.params.id);
    try {
        for (const [key, value] of Object.entries(req.body)) {
            if (key.startsWith('status_') && value) {
                const siswaId = parseInt(key.replace('status_', ''));
                let statusString = "Belum Diproses";
                if (value === 'naik') statusString = "Naik Kelas";
                else if (value === 'cuti') statusString = "Tidak Naik / Cuti";
                else if (value === 'lulus') statusString = "Lulus";
                await prisma.enrolmentSiswa.updateMany({
                    where: { enrolmentKelasId: currentEnrolmentKelasId, siswaId: siswaId },
                    data: { statusKenaikan: statusString }
                });
            }
        }
        res.redirect(`/enrolment/${currentEnrolmentKelasId}?success=Status kenaikan berhasil diproses`);
    } catch (err) { res.redirect(`/enrolment/${currentEnrolmentKelasId}?error=Gagal memproses kenaikan`); }
});

// 6. JADWAL
router.get('/jadwal', async (req, res) => {
    try {
        const jadwalListRaw = await prisma.jadwalAbsensi.findMany({
            include: { kelas: { include: { tingkat: true } } },
            orderBy: { namaJadwal: 'asc' }
        });
        const kelasListRaw = await prisma.masterKelas.findMany({
            include: { jadwalAbsensi: true, tingkat: true },
            orderBy: [{ tingkatId: 'asc' }, { namaKelas: 'asc' }]
        });
        const mapKelas = (k) => {
            if (!k) return k;
            return {
                ...k,
                namaKelasSuffix: k.namaKelas,
                namaKelas: k.tingkat ? `${k.tingkat.namaTingkat} ${k.namaKelas}` : k.namaKelas
            };
        };
        const jadwalList = jadwalListRaw.map(j => ({ ...j, kelas: j.kelas.map(mapKelas) }));
        const kelasList = kelasListRaw.map(mapKelas);

        res.render('admin/jadwal', { jadwalList, kelasList });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

module.exports = router;


