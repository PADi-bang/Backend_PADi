const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const fs = require('fs').promises; // Gunakan 'fs' promise-based untuk async/await
const path = require('path');

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
const upload = multer({ storage: storage });

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

        const izinBaru = await prisma.perizinan.create({
            data: {
                siswaId: siswa.id,
                tanggalMulai: new Date(tanggalMulai),
                tanggalSelesai: new Date(tanggalSelesai),
                jenisIzin,
                alasan,
                // 7. Simpan path file yang sudah mencakup subfolder ke database
                fileBukti: fileBuktiPath,
                status: 'Pending'
            }
        });

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
router.get('/pending', async (req, res) => {
    try {
        const izinPending = await prisma.perizinan.findMany({
            where: { status: 'Pending' },
            include: { siswa: true },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json({ status: 'success', data: izinPending });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data' });
    }
});

// ==========================================
// 3. GURU MENYETUJUI / MENOLAK IZIN
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

        res.status(200).json({ status: 'success', message: `Izin berhasil di-${statusUpdate}` });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Gagal memperbarui status izin' });
    }
});

module.exports = router;