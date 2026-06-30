const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const fs = require('fs').promises; // Gunakan 'fs' promise-based untuk async/await
const path = require('path');
const { sendPushNotification } = require('../utils/firebase'); // [BARU] Import util firebase
const verifyToken = require('../middleware/auth'); // [BARU] Import middleware auth

const prisma = new PrismaClient();

// Konfigurasi Penyimpanan File (Multer)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/file_izin';
        // Buat direktori secara rekursif jika belum ada
        fs.mkdir(dir, { recursive: true })
            .then(() => cb(null, dir))
            .catch(err => cb(err));
    },
    filename: function (req, file, cb) {
        // Beri nama unik SEMENTARA. Nama file final akan dibuat di dalam logika route.
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    // [REKOMENDASI] Batasi ukuran file maksimal 10MB untuk mencegah unggahan file besar
    limits: { fileSize: 10 * 1024 * 1024 } 
});

// ==========================================
// 1. SISWA MENGIRIM IZIN BARU (Upload File)
// POST /api/perizinan
// ==========================================
router.post('/', upload.single('fileBukti'), async (req, res) => {
    try {
        const { userId, tanggalMulai, tanggalSelesai, jenisIzin, alasan } = req.body;        
        // Cari ID Siswa berdasarkan ID User yang login
        const siswa = await prisma.siswa.findUnique({ where: { userId: parseInt(userId) } });
        if (!siswa) return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan' });

        let fileBuktiPath = null;

        // Jika ada file yang diunggah, proses penggantian nama
        if (req.file) {
            // 1. Ambil data yang dibutuhkan untuk nama file
            const namaLengkap = siswa.namaLengkap;
            const tanggalPengajuan = new Date().toISOString().slice(0, 10); // Format: YYYY-MM-DD

            // 2. Buat nama dasar yang deskriptif dan bersihkan dari karakter tidak aman
            const baseName = `${namaLengkap}_${jenisIzin}_${tanggalPengajuan}`
                .replace(/\s+/g, '_') // Ganti spasi dengan underscore
                .replace(/[^a-zA-Z0-9_-]/g, ''); // Hapus karakter selain huruf, angka, underscore, dan strip

            // 3. Tambahkan timestamp untuk menjamin keunikan file
            const uniqueSuffix = Date.now();
            const fileExtension = path.extname(req.file.originalname);
            const finalFileName = `${baseName}_${uniqueSuffix}${fileExtension}`;

            // 4. Definisikan path file lama (diunggah multer) dan path tujuan baru
            const oldPath = req.file.path;
            const newPath = path.join(req.file.destination, finalFileName);

            // 5. Ganti nama file di server menggunakan fs.promises
            await fs.rename(oldPath, newPath);

            // 6. [BARU] Simpan path relatif (subfolder + nama file) untuk database
            fileBuktiPath = path.join('file_izin', finalFileName).replace(/\\/g, '/');
        }

        // Pastikan tanggal disimpan di UTC jam 00:00:00 untuk mencegah pergeseran timezone
        const tMulai = new Date(tanggalMulai);
        const tSelesai = new Date(tanggalSelesai);
        const utcMulai = new Date(Date.UTC(tMulai.getFullYear(), tMulai.getMonth(), tMulai.getDate()));
        const utcSelesai = new Date(Date.UTC(tSelesai.getFullYear(), tSelesai.getMonth(), tSelesai.getDate()));

        const izinBaru = await prisma.perizinan.create({
            data: {
                siswaId: siswa.id,
                tanggalMulai: utcMulai,
                tanggalSelesai: utcSelesai,
                jenisIzin,
                alasan,
                // 7. Simpan path file yang sudah mencakup subfolder ke database
                fileBukti: fileBuktiPath,
                status: 'Pending'
            }
        });

        // --- [BARU] PUSH NOTIFICATION KE GURU WALI KELAS ---
        try {
            const enrolment = await prisma.enrolmentSiswa.findFirst({
                where: { siswaId: siswa.id, isActive: true },
                include: {
                    enrolmentKelas: {
                        include: {
                            enrolmentGuru: {
                                where: { isActive: true },
                                include: { guru: { include: { user: true } } }
                            }
                        }
                    }
                }
            });

            if (enrolment && enrolment.enrolmentKelas && enrolment.enrolmentKelas.enrolmentGuru.length > 0) {
                const guruWali = enrolment.enrolmentKelas.enrolmentGuru[0].guru;
                if (guruWali && guruWali.user) {
                    await prisma.notifikasi.create({
                        data: {
                            userId: guruWali.user.id,
                            judul: 'Pengajuan Izin Baru',
                            tipe: 'Sistem',
                            isiPesan: `${siswa.namaLengkap} mengajukan izin ${jenisIzin}.`,
                        }
                    });
                    if (guruWali.user.fcmToken) {
                        await sendPushNotification(
                            guruWali.user.fcmToken,
                            'Pengajuan Izin Baru',
                            `${siswa.namaLengkap} mengajukan izin ${jenisIzin}.`,
                            { type: 'izin', izinId: izinBaru.id.toString() }
                        );
                    }
                }
            }
        } catch (errFcm) {
            console.error('Gagal mengirim FCM untuk pengajuan izin:', errFcm.message);
        }
        // ---------------------------------------------------

        res.status(201).json({ status: 'success', data: izinBaru, message: 'Izin berhasil diajukan' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal mengajukan izin' });
    }
});

// ==========================================
// 2. GURU MELIHAT DAFTAR IZIN PENDING
// GET /api/perizinan/pending
// ==========================================
router.get('/pending', verifyToken, async (req, res) => {
    try {
        let izinPending = [];

        // Jika yang login adalah Guru, ambil izin HANYA dari siswa di kelas yang dia ajar
        if (req.user.role === 'Guru') {
            const guru = await prisma.guru.findUnique({ where: { userId: req.user.id } });
            if (guru) {
                // Cari kelas-kelas yang diajar oleh guru ini
                const kelasAjar = await prisma.enrolmentGuru.findMany({
                    where: { guruId: guru.id, isActive: true },
                    select: { enrolmentKelasId: true }
                });
                const kelasIds = kelasAjar.map(k => k.enrolmentKelasId);

                // Cari siswa-siswa yang ada di kelas-kelas tersebut
                const siswaDiKelas = await prisma.enrolmentSiswa.findMany({
                    where: { enrolmentKelasId: { in: kelasIds }, isActive: true },
                    select: { siswaId: true }
                });
                const siswaIds = siswaDiKelas.map(s => s.siswaId);

                // Ambil izin HANYA untuk siswa-siswa tersebut
                izinPending = await prisma.perizinan.findMany({
                    where: { status: 'Pending', siswaId: { in: siswaIds } },
                    include: { siswa: true },
                    orderBy: { createdAt: 'desc' }
                });
            }
        } else {
            // Jika admin/lainnya, ambil semua (atau sesuaikan dengan kebutuhan bisnis)
            izinPending = await prisma.perizinan.findMany({
                where: { status: 'Pending' },
                include: { siswa: true },
                orderBy: { createdAt: 'desc' }
            });
        }

        res.status(200).json({ status: 'success', data: izinPending });
    } catch (err) {
        console.error("Error fetching pending izin:", err);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data' });
    }
});

// ==========================================
// 3. GURU MELIHAT DAFTAR IZIN YANG SUDAH DIPROSES (RIWAYAT)
// GET /api/perizinan/riwayat
// ==========================================
router.get('/riwayat', verifyToken, async (req, res) => {
    try {
        let izinRiwayat = [];

        // Jika yang login adalah Guru, ambil izin HANYA dari siswa di kelas yang dia ajar
        if (req.user.role === 'Guru') {
            const guru = await prisma.guru.findUnique({ where: { userId: req.user.id } });
            if (guru) {
                const kelasAjar = await prisma.enrolmentGuru.findMany({
                    where: { guruId: guru.id, isActive: true },
                    select: { enrolmentKelasId: true }
                });
                const kelasIds = kelasAjar.map(k => k.enrolmentKelasId);

                const siswaDiKelas = await prisma.enrolmentSiswa.findMany({
                    where: { enrolmentKelasId: { in: kelasIds }, isActive: true },
                    select: { siswaId: true }
                });
                const siswaIds = siswaDiKelas.map(s => s.siswaId);

                izinRiwayat = await prisma.perizinan.findMany({
                    where: { status: { in: ['Disetujui', 'Ditolak'] }, siswaId: { in: siswaIds } },
                    include: { siswa: true },
                    orderBy: { createdAt: 'desc' },
                    take: 50 // Batasi agar tidak terlalu berat
                });
            }
        } else {
            izinRiwayat = await prisma.perizinan.findMany({
                where: { status: { in: ['Disetujui', 'Ditolak'] } },
                include: { siswa: true },
                orderBy: { createdAt: 'desc' },
                take: 100
            });
        }

        res.status(200).json({ status: 'success', data: izinRiwayat });
    } catch (err) {
        console.error("Error fetching riwayat izin:", err);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data riwayat' });
    }
});

// ==========================================
// 4. GURU MENYETUJUI / MENOLAK IZIN
// PUT /api/perizinan/:id/status
// ==========================================
router.put('/:id/status', async (req, res) => {
    try {
        const izinId = parseInt(req.params.id);
        const { statusUpdate, guruUserId } = req.body; // statusUpdate: 'Disetujui' atau 'Ditolak'

        const guru = await prisma.guru.findUnique({ where: { userId: parseInt(guruUserId) } });
        
        await prisma.perizinan.update({
            where: { id: izinId },
            data: {
                status: statusUpdate,
                disetujuiOlehId: guru ? guru.id : null
            }
        });

        // Jika disetujui, buat record absensi untuk rentang tanggal tersebut
        if (statusUpdate === 'Disetujui') {
            const izin = await prisma.perizinan.findUnique({
                where: { id: izinId },
                include: { siswa: true }
            });
            
            if (izin) {
                const startDate = new Date(izin.tanggalMulai);
                const endDate = new Date(izin.tanggalSelesai);
                
                // Looping dari tanggal mulai sampai tanggal selesai
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    const current = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                    const dayOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][current.getUTCDay()];
                    
                    // Cari jadwal reguler yang AKTIF untuk hari tersebut
                    let jadwal = await prisma.jadwalAbsensi.findFirst({
                        where: {
                            sekolahId: izin.siswa.sekolahId,
                            hari: { contains: dayOfWeek },
                            isActive: true,
                            isLibur: false
                        }
                    });
                    
                    if (jadwal) {
                        // Cek apakah sudah ada absen untuk tanggal tersebut
                        const existingAbsen = await prisma.absensi.findFirst({
                            where: {
                                siswaId: izin.siswa.id,
                                tanggal: current
                            }
                        });
                        
                        if (!existingAbsen) {
                            await prisma.absensi.create({
                                data: {
                                    siswaId: izin.siswa.id,
                                    jadwalId: jadwal.id,
                                    tanggal: current,
                                    status: izin.jenisIzin === 'Sakit' ? 'Sakit' : 'Izin',
                                    keterangan: izin.alasan
                                }
                            });
                        }
                    }
                }
            }
        }

        // --- [BARU] PUSH NOTIFICATION KE SISWA ---
        try {
            const izinData = await prisma.perizinan.findUnique({
                where: { id: izinId },
                include: { siswa: { include: { user: true } } }
            });

            if (izinData && izinData.siswa && izinData.siswa.user) {
                await prisma.notifikasi.create({
                    data: {
                        userId: izinData.siswa.user.id,
                        judul: 'Status Izin Diperbarui',
                        tipe: 'Sistem',
                        isiPesan: `Pengajuan izin Anda telah ${statusUpdate}.`,
                    }
                });
                if (izinData.siswa.user.fcmToken) {
                    await sendPushNotification(
                        izinData.siswa.user.fcmToken,
                        'Status Izin Diperbarui',
                        `Pengajuan izin Anda telah ${statusUpdate}.`,
                        { type: 'izin_status', izinId: izinId.toString() }
                    );
                }
            }
        } catch (errFcm) {
            console.error('Gagal mengirim FCM persetujuan izin:', errFcm.message);
        }
        // -----------------------------------------

        res.status(200).json({ status: 'success', message: `Izin berhasil di-${statusUpdate}` });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Gagal memperbarui status izin' });
    }
});

module.exports = router;