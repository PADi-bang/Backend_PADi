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
const checkAdminAuth = require('../middleware/sessionAuth');
const { spawn } = require('child_process');
const path = require('path');

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
                    { username: { equals: identifier, mode: 'insensitive' } },
                    { email: { equals: identifier, mode: 'insensitive' } }
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
        req.session.sekolahId = user.admin ? user.admin.sekolahId : null;
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
        const sekolahId = req.session.sekolahId || 1;
        const totalSiswa = await prisma.siswa.count({ where: { sekolahId } });
        const totalGuru = await prisma.guru.count({ where: { sekolahId } });
        const totalAdmin = await prisma.admin.count({ where: { sekolahId } });

        // === LOGIKA DINAMIS: TARIK STATISTIK ===
        const nowWIBString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        const nowWIB = new Date(nowWIBString);
        const year = nowWIB.getFullYear();
        const month = nowWIB.getMonth();
        const day = nowWIB.getDate();
        
        const startOfDay = new Date(Date.UTC(year, month, day));

        // 1. Cari tanggal target (hari ini, atau fallback ke tanggal absensi terakhir yang ada datanya)
        let targetDate = startOfDay;
        const todayCount = await prisma.absensi.count({
            where: { 
                siswa: { sekolahId },
                tanggal: { gte: startOfDay } 
            }
        });

        if (todayCount === 0) {
            const latestPresentRecord = await prisma.absensi.findFirst({
                where: { 
                    siswa: { sekolahId },
                    status: { in: ['Hadir', 'Telat'] } 
                },
                orderBy: { tanggal: 'desc' }
            });
            if (latestPresentRecord) {
                const d = new Date(latestPresentRecord.tanggal);
                targetDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
            }
        }

        const startOfTargetDay = targetDate;
        const endOfTargetDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1);

        // Hitung absensi pada targetDate
        const hadirCount = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: startOfTargetDay, lte: endOfTargetDay }, status: 'Hadir' } });
        const telatCount = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: startOfTargetDay, lte: endOfTargetDay }, status: 'Telat' } });
        const izinSakitCount = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: startOfTargetDay, lte: endOfTargetDay }, status: { in: ['Izin', 'Sakit'] } } });
        const alphaCount = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: startOfTargetDay, lte: endOfTargetDay }, status: 'Alpha' } });

        const totalAbsensi = hadirCount + telatCount + izinSakitCount + alphaCount;
        let statusChart = [70, 15, 10, 5]; // Default fallback jika benar-benar kosong
        if (totalAbsensi > 0) {
            const hadirPercent = Math.round((hadirCount / totalAbsensi) * 100);
            const telatPercent = Math.round((telatCount / totalAbsensi) * 100);
            const izinPercent = Math.round((izinSakitCount / totalAbsensi) * 100);
            const alphaPercent = Math.max(0, 100 - hadirPercent - telatPercent - izinPercent);
            statusChart = [hadirPercent, telatPercent, izinPercent, alphaPercent];
        }

        // Ambil semester dari tahun akademik aktif, default ke berdasarkan bulan (Ganjil: Jul-Dec, Genap: Jan-Jun)
        const activeTahunAkademik = await prisma.masterTahunAkademik.findFirst({
            where: { sekolahId, isActive: true }
        });
        const activeSemester = activeTahunAkademik ? activeTahunAkademik.semester : (month >= 6 ? 'Ganjil' : 'Genap');

        // Mengambil rentang bulan dari Pengaturan secara dinamis
        let configTglGanjil = "07-15"; 
        let configTglGenap = "01-10";
        try {
            const config = await prisma.pengaturan.findMany();
            config.forEach(c => {
                if(c.kunci === 'tanggal_mulai_ganjil') configTglGanjil = c.nilai;
                if(c.kunci === 'tanggal_mulai_genap') configTglGenap = c.nilai;
            });
        } catch(e) {}

        const [bulanGanjil] = configTglGanjil.split('-').map(Number);
        const [bulanGenap] = configTglGenap.split('-').map(Number);

        const ganjilMonths = [];
        const genapMonths = [];
        if (bulanGanjil < bulanGenap) {
            for (let m = 1; m <= 12; m++) {
                if (m >= bulanGanjil && m < bulanGenap) ganjilMonths.push(m);
                else genapMonths.push(m);
            }
        } else {
            for (let m = 1; m <= 12; m++) {
                if (m >= bulanGenap && m < bulanGanjil) genapMonths.push(m);
                else ganjilMonths.push(m);
            }
        }

        const allowedMonths = activeSemester === 'Ganjil' ? ganjilMonths : genapMonths;

        // Determine filter type from query parameters
        const filter = req.query.filter || 'pekan'; // 'pekan', 'bulan', 'semester'
        let inputBulan = req.query.bulan ? parseInt(req.query.bulan) : (month + 1); // 1-indexed (1-12)
        if (!allowedMonths.includes(inputBulan)) {
            // Default to the first month of the active semester
            inputBulan = allowedMonths[0];
        }
        const inputTahun = req.query.tahun ? parseInt(req.query.tahun) : year;

        let attendanceChartLabels = [];
        const hadirSeries = [];
        const telatSeries = [];
        const izinSakitSeries = [];
        const alphaSeries = [];

        if (filter === 'pekan') {
            // 2. Grafik Mingguan (Weekly Attendance) - Exclude Saturdays and Sundays
            let weekAnchor = startOfDay;
            const dayOfWeekVal = startOfDay.getDay();
            const diffToMonday = dayOfWeekVal === 0 ? -6 : 1 - dayOfWeekVal;
            const startOfWeek = new Date(startOfDay);
            startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);

            const weekCount = await prisma.absensi.count({
                where: { 
                    siswa: { sekolahId },
                    tanggal: { gte: startOfWeek } 
                }
            });

            if (weekCount === 0) {
                const latestPresentRecord = await prisma.absensi.findFirst({
                    where: { 
                        siswa: { sekolahId },
                        status: { in: ['Hadir', 'Telat'] } 
                    },
                    orderBy: { tanggal: 'desc' }
                });
                if (latestPresentRecord) {
                    const d = new Date(latestPresentRecord.tanggal);
                    weekAnchor = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
                }
            }

            const anchorDayOfWeek = weekAnchor.getDay();
            const anchorDiffToMonday = anchorDayOfWeek === 0 ? -6 : 1 - anchorDayOfWeek;
            const anchorStartOfWeek = new Date(weekAnchor);
            anchorStartOfWeek.setDate(anchorStartOfWeek.getDate() + anchorDiffToMonday);

            const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
            for (let d = 0; d < 5; d++) { // Loop 5 days: Monday to Friday
                const dayStart = new Date(anchorStartOfWeek);
                dayStart.setDate(dayStart.getDate() + d);
                const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

                const countHadir = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: dayStart, lte: dayEnd }, status: 'Hadir' } });
                const countTelat = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: dayStart, lte: dayEnd }, status: 'Telat' } });
                const countIzinSakit = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: dayStart, lte: dayEnd }, status: { in: ['Izin', 'Sakit'] } } });
                const countAlpha = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: dayStart, lte: dayEnd }, status: 'Alpha' } });

                hadirSeries.push(countHadir);
                telatSeries.push(countTelat);
                izinSakitSeries.push(countIzinSakit);
                alphaSeries.push(countAlpha);
                attendanceChartLabels.push(dayNames[d]);
            }
        } else if (filter === 'bulan') {
            const targetMonthIndex = inputBulan - 1; // 0-indexed for JS Date
            const targetYear = inputTahun;

            const startOfMonth = new Date(Date.UTC(targetYear, targetMonthIndex, 1));
            const endOfMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)); // last day of month

            // Generate all weekdays (Monday to Friday) in this month
            let currentDay = new Date(startOfMonth);
            while (currentDay <= endOfMonth) {
                const dayOfWeekVal = currentDay.getDay();
                if (dayOfWeekVal !== 0 && dayOfWeekVal !== 6) { // Skip Sunday (0) and Saturday (6)
                    const dayStart = new Date(currentDay);
                    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

                    const countHadir = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: dayStart, lte: dayEnd }, status: 'Hadir' } });
                    const countTelat = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: dayStart, lte: dayEnd }, status: 'Telat' } });
                    const countIzinSakit = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: dayStart, lte: dayEnd }, status: { in: ['Izin', 'Sakit'] } } });
                    const countAlpha = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: dayStart, lte: dayEnd }, status: 'Alpha' } });

                    hadirSeries.push(countHadir);
                    telatSeries.push(countTelat);
                    izinSakitSeries.push(countIzinSakit);
                    alphaSeries.push(countAlpha);

                    // Label format: "01 Jun"
                    const formattedDate = dayStart.toLocaleDateString("id-ID", { day: '2-digit', month: 'short' });
                    attendanceChartLabels.push(formattedDate);
                }
                currentDay.setDate(currentDay.getDate() + 1);
            }
        } else if (filter === 'semester') {
            const monthsInSemester = allowedMonths;
            const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            const labelsSemester = monthsInSemester.map(m => shortMonthNames[m - 1]);

            for (let idx = 0; idx < monthsInSemester.length; idx++) {
                const mVal = monthsInSemester[idx];
                const startOfMonth = new Date(Date.UTC(inputTahun, mVal - 1, 1));
                const endOfMonth = new Date(Date.UTC(inputTahun, mVal, 0));

                const countHadir = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: startOfMonth, lte: endOfMonth }, status: 'Hadir' } });
                const countTelat = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: startOfMonth, lte: endOfMonth }, status: 'Telat' } });
                const countIzinSakit = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: startOfMonth, lte: endOfMonth }, status: { in: ['Izin', 'Sakit'] } } });
                const countAlpha = await prisma.absensi.count({ where: { siswa: { sekolahId }, tanggal: { gte: startOfMonth, lte: endOfMonth }, status: 'Alpha' } });

                hadirSeries.push(countHadir);
                telatSeries.push(countTelat);
                izinSakitSeries.push(countIzinSakit);
                alphaSeries.push(countAlpha);
                attendanceChartLabels.push(labelsSemester[idx]);
            }
        }

        // 3. Persentase Keterlambatan per Tingkat
        const allLateAbsens = await prisma.absensi.findMany({
            where: { 
                siswa: { sekolahId },
                status: 'Telat' 
            },
            include: {
                siswa: {
                    include: {
                        enrolmentSiswa: {
                            where: { isActive: true },
                            include: {
                                enrolmentKelas: {
                                    include: {
                                        masterKelas: {
                                            include: { tingkat: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        let lateX = 0;
        let lateXI = 0;
        let lateXII = 0;

        allLateAbsens.forEach(a => {
            if (a.siswa && a.siswa.enrolmentSiswa && a.siswa.enrolmentSiswa.length > 0) {
                const activeEnrol = a.siswa.enrolmentSiswa[0];
                if (activeEnrol.enrolmentKelas && activeEnrol.enrolmentKelas.masterKelas && activeEnrol.enrolmentKelas.masterKelas.tingkat) {
                    const tingkatName = activeEnrol.enrolmentKelas.masterKelas.tingkat.namaTingkat;
                    if (tingkatName === 'X') lateX++;
                    else if (tingkatName === 'XI') lateXI++;
                    else if (tingkatName === 'XII') lateXII++;
                }
            }
        });

        const totalLate = lateX + lateXI + lateXII;
        let latePercentX = 0;
        let latePercentXI = 0;
        let latePercentXII = 0;

        if (totalLate > 0) {
            latePercentX = Math.round((lateX / totalLate) * 100);
            latePercentXI = Math.round((lateXI / totalLate) * 100);
            latePercentXII = Math.max(0, 100 - latePercentX - latePercentXI);
        }

        // Tarik siswa yang Alpha atau Telat hari ini
        const absensiBermasalah = await prisma.absensi.findMany({
            where: {
                siswa: { sekolahId },
                tanggal: { gte: startOfDay },
                status: { in: ['Alpha', 'Telat'] }
            },
            include: { siswa: true },
            take: 2, 
            orderBy: { id: 'desc' }
        });

        // Tarik siswa yang sedang Izin/Sakit hari ini
        const perizinanHariIni = await prisma.perizinan.findMany({
            where: {
                siswa: { sekolahId },
                tanggalMulai: { lte: new Date() },
                tanggalSelesai: { gte: startOfDay },
                status: 'Disetujui'
            },
            include: { siswa: true },
            take: 1, 
            orderBy: { id: 'desc' }
        });

        let siswaPerluPerhatian = [];

        absensiBermasalah.forEach(a => {
            if (a.siswa) {
                siswaPerluPerhatian.push({
                    nama: a.siswa.namaLengkap,
                    inisial: a.siswa.namaLengkap.substring(0, 2).toUpperCase(),
                    statusText: a.status === 'Alpha' ? 'Alpha (Tanpa Keterangan)' : 'Terlambat Masuk',
                    theme: a.status === 'Alpha' ? 'red' : 'orange'
                });
            }
        });

        perizinanHariIni.forEach(p => {
            if (p.siswa) {
                siswaPerluPerhatian.push({
                    nama: p.siswa.namaLengkap,
                    inisial: p.siswa.namaLengkap.substring(0, 2).toUpperCase(),
                    statusText: p.jenisIzin === 'Sakit' ? 'Izin (Sakit)' : 'Izin (Kepentingan)',
                    theme: 'blue'
                });
            }
        });

        res.render('admin/dashboard', { 
            stats: { 
                totalSiswa, 
                totalGuru, 
                totalAdmin, 
                chartSeries: {
                    hadir: hadirSeries,
                    telat: telatSeries,
                    izinSakit: izinSakitSeries,
                    alpha: alphaSeries
                },
                attendanceChartLabels,
                filter,
                selectedBulan: inputBulan,
                selectedTahun: inputTahun,
                activeSemester,
                allowedMonths,
                currentBulan: month + 1,
                statusChart,
                siswaPerluPerhatian,
                lateDistribution: {
                    X: latePercentX,
                    XI: latePercentXI,
                    XII: latePercentXII
                }
            }
        });
    } catch (err) {
        console.error("Dashboard error:", err);
        res.render('admin/error', { message: err.message });
    }
});

// 2. SISWA
router.get('/daftar-siswa', async (req, res) => {
    const { search } = req.query;
    try {
        let whereClause = { roleId: 3, siswa: { sekolahId: req.session.sekolahId } }; 
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
        const activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true, sekolahId: req.session.sekolahId } });
        const siswas = await prisma.user.findMany({
            where: whereClause,
            include: {
                siswa: {
                    include: {
                        masterAngkatan: true,
                        enrolmentSiswa: { 
                            where: { 
                                isActive: true,
                                ...(activeTa ? { enrolmentKelas: { tahunAkademikId: activeTa.id } } : {})
                            }, 
                            include: { enrolmentKelas: { include: { masterKelas: { include: { tingkat: true } } } } } 
                        }
                    }
                }
            },
            orderBy: { id: 'desc' }
        });
        const masterAngkatan = await prisma.masterAngkatan.findMany({ where: { sekolahId: req.session.sekolahId }, orderBy: { nomorAngkatan: 'asc' } });
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
                siswa: { create: { namaLengkap, nis, sekolahId: req.session.sekolahId, angkatanId: parseInt(angkatanId) || null } }
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

// [BARU] DAFTAR WAJAH SISWA (Menggunakan Python Backend)
router.post('/daftar-siswa/set-wajah', upload.single('fotoWajah'), async (req, res) => {
    const userId = req.body.userId;
    
    try {
        if (!userId || !req.file) {
            return res.status(400).json({ status: 'error', message: 'User ID dan foto wajah wajib diisi' });
        }
        
        const siswa = await prisma.siswa.findUnique({
            where: { userId: parseInt(userId) }
        });

        if (!siswa) {
            return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan' });
        }

        // Eksekusi skrip Python menggunakan environment variable agar konsisten
        const pythonExecutable = process.env.PYTHON_PATH || 'python';
        const pythonProcess = spawn(pythonExecutable, [
            path.join(__dirname, '../utils/extract_face.py'),
            req.file.path
        ]);

        pythonProcess.on('error', (err) => {
            console.error("Gagal menjalankan Python: " + err.message);
        });

        let outputData = '';
        let errorData = '';

        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
        });

        pythonProcess.on('close', async (code) => {
            // Hapus file sementara
            const fs = require('fs').promises;
            await fs.unlink(req.file.path).catch(e => console.error(e));

            try {
                // Skrip Python bisa mem-print pesan error dari TensorFlow sebelum JSON. 
                // Kita cari baris yang berupa JSON.
                const jsonStr = outputData.split('\n').map(l => l.trim()).find(l => l.startsWith('{') && l.endsWith('}'));
                
                if (!jsonStr) {
                    console.error("Python Error:", errorData || outputData);
                    return res.status(500).json({ status: 'error', message: 'Gagal mengekstrak wajah dari foto' });
                }

                const result = JSON.parse(jsonStr);
                
                if (result.status === 'success') {
                    await prisma.siswa.update({
                        where: { id: siswa.id },
                        data: { faceModel: JSON.stringify(result.embedding) }
                    });
                    return res.status(200).json({ status: 'success', message: 'Wajah berhasil didaftarkan' });
                } else {
                    return res.status(400).json({ status: 'error', message: result.message || 'Wajah tidak terdeteksi dengan jelas' });
                }
            } catch (parseError) {
                console.error("Parse Error:", parseError, "Raw output:", outputData);
                return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan sistem saat membaca hasil biometrik' });
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan sistem saat menyimpan wajah' });
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
        let whereClause = { roleId: 2, guru: { sekolahId: req.session.sekolahId } }; 
        if (search) {
            whereClause = { ...whereClause, OR: [ { username: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }, { guru: { namaLengkap: { contains: search, mode: 'insensitive' } } }, { guru: { nip: { contains: search, mode: 'insensitive' } } } ] };
        }
        const activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true, sekolahId: req.session.sekolahId } });
        const gurus = await prisma.user.findMany({
            where: whereClause,
            include: { 
                guru: { 
                    include: { 
                        enrolmentGuru: { 
                            where: { 
                                isActive: true,
                                ...(activeTa ? { enrolmentKelas: { tahunAkademikId: activeTa.id } } : {})
                            }, 
                            include: { enrolmentKelas: { include: { masterKelas: { include: { tingkat: true } } } } } 
                        } 
                    } 
                } 
            },
            orderBy: { id: 'desc' }
        });

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

        const activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true, sekolahId: req.session.sekolahId } });
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
        const kelasRaw = await prisma.masterKelas.findMany({ where: { sekolahId: req.session.sekolahId }, include: { tingkat: true } });
        const angkatan = await prisma.masterAngkatan.findMany({ where: { sekolahId: req.session.sekolahId }, orderBy: { nomorAngkatan: 'asc' } });
        const tahunAkademik = await prisma.masterTahunAkademik.findMany({ where: { sekolahId: req.session.sekolahId }, orderBy: { tahunAjaran: 'asc' } });
        
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
        const safeSuffix = suffix.replace(/\\/g, '\\\\');
        const tingkats = await prisma.masterTingkat.findMany({ orderBy: { id: 'asc' } });
        const existing = await prisma.masterKelas.findFirst({
            where: { namaKelas: { equals: safeSuffix, mode: 'insensitive' }, sekolahId: req.session.sekolahId }
        });
        if (existing) return res.redirect('/master-data?error=Nama kelas sudah ada');
        for (const t of tingkats) {
            await prisma.masterKelas.create({
                data: { namaKelas: suffix, tingkatId: t.id, sekolahId: req.session.sekolahId }
            });
        }
        res.redirect('/master-data?success=Kelas berhasil ditambahkan');
    } catch (err) { res.redirect('/master-data?error=Gagal menambah kelas'); }
});

router.post('/master-data/kelas/delete-group/:group', async (req, res) => {
    try {
        const suffix = decodeURIComponent(req.params.group);
        const safeSuffix = suffix.replace(/\\/g, '\\\\');
        const classes = await prisma.masterKelas.findMany({ 
            where: { 
                namaKelas: { equals: safeSuffix, mode: 'insensitive' },
                sekolahId: req.session.sekolahId
            } 
        });
        const classIds = classes.map(c => c.id);
        const enrolments = await prisma.enrolmentKelas.findMany({ where: { kelasId: { in: classIds } } });
        for (const e of enrolments) {
            await prisma.enrolmentSiswa.deleteMany({ where: { enrolmentKelasId: e.id } });
            await prisma.enrolmentGuru.deleteMany({ where: { enrolmentKelasId: e.id } });
        }
        await prisma.enrolmentKelas.deleteMany({ where: { kelasId: { in: classIds } } });
        
        // Remove relationships from JadwalAbsensi manually if needed to prevent foreign key errors, 
        // but Prisma implicit m-n (B) handles it. Just delete masterKelas.
        await prisma.masterKelas.deleteMany({ where: { id: { in: classIds } } });
        res.redirect('/master-data?success=Kelas berhasil dihapus');
    } catch (err) { 
        console.error("Error deleting class:", err);
        res.redirect('/master-data?error=Gagal menghapus kelas'); 
    }
});

router.post('/master-data/angkatan', async (req, res) => {
    const { nomorAngkatan, sekolahId } = req.body;
    try {
        const formattedAngkatan = `Angkatan ke-${nomorAngkatan}`;
        const safeAngkatan = formattedAngkatan.replace(/\\/g, '\\\\');
        const existing = await prisma.masterAngkatan.findFirst({
            where: { nomorAngkatan: { equals: safeAngkatan, mode: 'insensitive' }, sekolahId: req.session.sekolahId }
        });
        if (existing) return res.redirect('/master-data?error=Angkatan sudah ada');
        const activeCount = await prisma.masterAngkatan.count({ where: { isActive: true, sekolahId: req.session.sekolahId } });
        await prisma.masterAngkatan.create({
            data: { nomorAngkatan: formattedAngkatan, sekolahId: req.session.sekolahId, isActive: activeCount < 4 }
        });
        res.redirect('/master-data?success=Angkatan berhasil ditambahkan');
    } catch (err) { res.redirect('/master-data?error=Gagal menambah angkatan'); }
});

router.post('/master-data/angkatan/delete/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const angkatan = await prisma.masterAngkatan.findFirst({ where: { id, sekolahId: req.session.sekolahId } });
        if (!angkatan) return res.redirect('/master-data?error=Unauthorized');
        await prisma.siswa.updateMany({ where: { angkatanId: id }, data: { angkatanId: null } });
        await prisma.masterAngkatan.delete({ where: { id } });
        res.redirect('/master-data?success=Angkatan berhasil dihapus');
    } catch (err) { res.redirect('/master-data?error=Gagal menghapus angkatan'); }
});

router.post('/master-data/tahun-akademik', async (req, res) => {
    const { tahunAjaran, isActive, sekolahId } = req.body;
    try {
        const safeTahunAjaran = tahunAjaran.replace(/\\/g, '\\\\');
        const existing = await prisma.masterTahunAkademik.findFirst({
            where: { tahunAjaran: { equals: safeTahunAjaran, mode: 'insensitive' }, sekolahId: req.session.sekolahId }
        });
        if (existing) return res.redirect('/master-data?error=Tahun akademik sudah ada');
        const semesterAktif = await getSemesterAktif();
        let newIsActive = isActive === 'true' || isActive === true;
        if (newIsActive) {
            await prisma.masterTahunAkademik.updateMany({ where: { sekolahId: req.session.sekolahId }, data: { isActive: false } });
        }
        await prisma.masterTahunAkademik.create({
            data: { tahunAjaran, semester: semesterAktif, isActive: newIsActive, sekolahId: req.session.sekolahId }
        });
        res.redirect('/master-data?success=Tahun akademik berhasil ditambahkan');
    } catch (err) { res.redirect('/master-data?error=Gagal menambah tahun akademik'); }
});

router.post('/master-data/tahun-akademik/activate/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const ta = await prisma.masterTahunAkademik.findFirst({ where: { id, sekolahId: req.session.sekolahId } });
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
        const ta = await prisma.masterTahunAkademik.findFirst({ where: { id, sekolahId: req.session.sekolahId } });
        if (!ta) return res.redirect('/master-data?error=Unauthorized');
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
        if (!activeTa) activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true, sekolahId: req.session.sekolahId } });

        const masterKelasList = await prisma.masterKelas.findMany({
            where: { sekolahId: req.session.sekolahId },
            include: { tingkat: true },
            orderBy: [{ tingkatId: 'asc' }, { namaKelas: 'asc' }]
        });
        
        const enrolments = await prisma.enrolmentKelas.findMany({
            where: {
                sekolahId: req.session.sekolahId,
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

        const taList = await prisma.masterTahunAkademik.findMany({ where: { sekolahId: req.session.sekolahId }, orderBy: { tahunAjaran: 'asc' } });
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

        const [allSiswa, allGuru, enrolledInTa] = await Promise.all([
            prisma.siswa.findMany({ where: { sekolahId: req.session.sekolahId }, include: { masterAngkatan: true } }),
            prisma.guru.findMany({ where: { sekolahId: req.session.sekolahId } }),
            prisma.enrolmentSiswa.findMany({
                where: {
                    enrolmentKelas: { tahunAkademikId: enrolment.tahunAkademikId },
                    isActive: true
                },
                select: { siswaId: true }
            })
        ]);
        const enrolledSiswaIds = enrolledInTa.map(es => es.siswaId);
        const availableSiswa = allSiswa.filter(s => !enrolledSiswaIds.includes(s.id));

        const detail = { enrolment, allSiswa: availableSiswa, allGuru };
        res.render('admin/enrolment_detail', { detail });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

// ENROLMENT POST HANDLERS
router.post('/enrolment/activate-kelas', async (req, res) => {
    const { kelasId, sekolahId } = req.body;
    try {
        const activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true, sekolahId: req.session.sekolahId } });
        if (!activeTa) return res.redirect('/enrolment?error=Tidak ada Tahun Akademik aktif');
        const existingEnrolment = await prisma.enrolmentKelas.findFirst({ where: { kelasId: parseInt(kelasId), tahunAkademikId: activeTa.id } });
        if (!existingEnrolment) {
            await prisma.enrolmentKelas.create({
                data: { sekolahId: req.session.sekolahId, kelasId: parseInt(kelasId), tahunAkademikId: activeTa.id, keterangan: '' }
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

        const targetClass = await prisma.enrolmentKelas.findUnique({ where: { id: enrolmentKelasId } });
        if (!targetClass) return res.redirect(`/enrolment/${enrolmentKelasId}?error=Kelas tidak ditemukan`);
        
        const existingInTa = await prisma.enrolmentSiswa.findFirst({
            where: {
                siswaId: parseInt(siswaId),
                enrolmentKelas: { tahunAkademikId: targetClass.tahunAkademikId }
            }
        });
        if (existingInTa) return res.redirect(`/enrolment/${enrolmentKelasId}?error=Siswa sudah terdaftar di kelas lain pada tahun ajaran ini`);

        await prisma.enrolmentSiswa.create({ data: { enrolmentKelasId, siswaId: parseInt(siswaId), isActive: true } });
        res.redirect(`/enrolment/${enrolmentKelasId}?success=Siswa berhasil ditambahkan`);
    } catch (err) { 
        console.error("ADD SISWA ERROR:", err);
        res.redirect(`/enrolment/${enrolmentKelasId}?error=Gagal menambah siswa: ${err.message}`); 
    }
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
            where: { sekolahId: req.session.sekolahId },
            include: { kelas: { include: { tingkat: true } } },
            orderBy: { namaJadwal: 'asc' }
        });
        const kelasListRaw = await prisma.masterKelas.findMany({
            where: { sekolahId: req.session.sekolahId },
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

// 7. LOKASI SEKOLAH
router.get('/lokasi-sekolah', async (req, res) => {
    try {
        const admin = await prisma.admin.findUnique({
            where: { userId: req.session.adminId }
        });
        const sekolahId = admin ? admin.sekolahId : 1;

        const result = await prisma.$queryRaw`
            SELECT id_sekolah, nama_sekolah, alamat, ST_AsGeoJSON(area_sekolah) as polygon_geojson, is_active_geofence as "isGeofenceActive"
            FROM sekolah 
            WHERE id_sekolah = ${sekolahId}
        `;
        
        if (result.length === 0) {
            return res.render('admin/error', { message: 'Data sekolah tidak ditemukan' });
        }

        const sekolah = result[0];
        res.render('admin/lokasi_sekolah', { 
            title: 'Lokasi Sekolah', 
            sekolah,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        res.render('admin/error', { message: err.message });
    }
});

router.post('/lokasi-sekolah', async (req, res) => {
    const { namaSekolah, alamat, coordinates, isGeofenceActive, isMapEdited } = req.body;
    const isGeofenceActiveBool = isGeofenceActive === 'true';
    const isMapEditedBool = isMapEdited === 'true';
    try {
        const admin = await prisma.admin.findUnique({
            where: { userId: req.session.adminId }
        });
        const sekolahId = admin ? admin.sekolahId : 1;

        const existingSekolah = await prisma.sekolah.findUnique({
            where: { id: sekolahId }
        });
        if (!existingSekolah) {
            throw new Error("Data sekolah tidak ditemukan.");
        }

        let hasCoordinates = false;
        let polyStr = null;

        if (coordinates && coordinates.trim() !== '') {
            try {
                const parsedCoords = JSON.parse(coordinates); // Expected: [[lng, lat], [lng, lat], ...]
                if (Array.isArray(parsedCoords) && parsedCoords.length >= 3) {
                    // Ensure the polygon closes (first and last coordinate must be identical in WKT)
                    const first = parsedCoords[0];
                    const last = parsedCoords[parsedCoords.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) {
                        parsedCoords.push(first);
                    }

                    // Format to WKT: POLYGON((lng1 lat1, lng2 lat2, ..., lng1 lat1))
                    const wktPoints = parsedCoords.map(pt => `${pt[0]} ${pt[1]}`).join(', ');
                    polyStr = `POLYGON((${wktPoints}))`;
                    hasCoordinates = true;
                }
            } catch (e) {
                console.error("Gagal parse koordinat JSON:", e);
            }
        }

        if (isGeofenceActiveBool && !hasCoordinates) {
            throw new Error("Batas wilayah (area geofence) wajib digambar di peta apabila status geofencing aktif.");
        }

        // Generate customized success message based on what changed
        let changeMessages = [];
        if (existingSekolah.isGeofenceActive !== isGeofenceActiveBool) {
            const statusStr = isGeofenceActiveBool ? 'diaktifkan' : 'dinonaktifkan';
            changeMessages.push(`status geofencing sekolah berhasil ${statusStr}`);
        }
        
        const isInfoChanged = existingSekolah.namaSekolah !== namaSekolah || existingSekolah.alamat !== alamat || isMapEditedBool;
        if (isInfoChanged) {
            changeMessages.push(`informasi lokasi sekolah berhasil diperbarui`);
        }

        let successMsg = "Perubahan lokasi berhasil disimpan";
        if (changeMessages.length > 0) {
            successMsg = changeMessages.join(' dan ');
            successMsg = successMsg.charAt(0).toUpperCase() + successMsg.slice(1);
        }

        // Update database (sekolah info and active toggle)
        await prisma.sekolah.update({
            where: { id: sekolahId },
            data: { 
                namaSekolah, 
                alamat,
                isGeofenceActive: isGeofenceActiveBool
            }
        });

        // Update polygon area ONLY if map was edited
        if (isMapEditedBool) {
            if (hasCoordinates && polyStr) {
                await prisma.$executeRaw`
                    UPDATE sekolah 
                    SET area_sekolah = ST_GeomFromText(${polyStr}, 4326) 
                    WHERE id_sekolah = ${sekolahId}
                `;
            } else if (!hasCoordinates) {
                await prisma.$executeRaw`
                    UPDATE sekolah 
                    SET area_sekolah = NULL 
                    WHERE id_sekolah = ${sekolahId}
                `;
            }
        }

        res.redirect(`/lokasi-sekolah?success=${encodeURIComponent(successMsg)}`);
    } catch (err) {
        console.error("Error updating school location:", err);
        res.redirect(`/lokasi-sekolah?error=${encodeURIComponent(err.message)}`);
    }
});

module.exports = router;


