const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');

const prisma = new PrismaClient();

// Konfigurasi Penyimpanan File (Multer)
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'uploads/'); },
    filename: function (req, file, cb) {
        // Beri nama unik: timestamp + ekstensi asli
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

        // Dapatkan nama file jika siswa mengunggahnya
        const fileName = req.file ? req.file.filename : null;

        const izinBaru = await prisma.perizinan.create({
            data: {
                siswaId: siswa.id,
                tanggalMulai: new Date(tanggalMulai),
                tanggalSelesai: new Date(tanggalSelesai),
                jenisIzin: jenisIzin,
                alasan: alasan,
                fileBukti: fileName,
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