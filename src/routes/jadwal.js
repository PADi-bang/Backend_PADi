const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Ambil semua jadwal beserta kelas yang ter-assign
router.get('/', async (req, res) => {
    try {
        const jadwalList = await prisma.jadwalAbsensi.findMany({
            include: {
                kelas: true // Ambil relasi kelas
            }
        });

        // Ambil semua kelas untuk panel 'Kelas Yang Belum Terjadwal'
        // Kita bisa ambil semua kelas, nanti difilter di frontend mana yang belum punya jadwal
        const kelasList = await prisma.masterKelas.findMany({
            include: {
                jadwalAbsensi: true
            }
        });

        res.json({
            status: 'success',
            data: {
                jadwal: jadwalList,
                kelas: kelasList
            }
        });
    } catch (error) {
        console.error("Error GET /jadwal:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Buat jadwal baru
router.post('/', async (req, res) => {
    try {
        const { namaJadwal, hari, tanggal, jamMasukStart, jamMasukFinish, jamPulang } = req.body;

        // Validasi dan konversi waktu
        const parseTime = (timeStr) => {
            if (!timeStr) return null;
            const date = new Date();
            const [hours, minutes] = timeStr.split(':');
            date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            return date;
        };

        const newJadwal = await prisma.jadwalAbsensi.create({
            data: {
                sekolahId: 1, // Default sementara
                namaJadwal,
                hari: hari || 'Senin-Jumat',
                tanggal: tanggal ? new Date(tanggal) : null,
                jamMasukStart: parseTime(jamMasukStart),
                jamMasukFinish: parseTime(jamMasukFinish),
                jamPulang: parseTime(jamPulang),
                isLibur: false
            }
        });

        res.json({
            status: 'success',
            data: newJadwal
        });
    } catch (error) {
        console.error("Error POST /jadwal:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Update jadwal
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { namaJadwal, hari, tanggal, jamMasukStart, jamMasukFinish, jamPulang } = req.body;

        const parseTime = (timeStr) => {
            if (!timeStr) return null;
            // Jika format ISO, ambil jam dan menitnya
            if (timeStr.includes('T')) {
                const d = new Date(timeStr);
                return d; // Atau parsing ulang
            }
            const date = new Date();
            const [hours, minutes] = timeStr.split(':');
            date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            return date;
        };

        const updateData = {
            namaJadwal,
            hari: hari || 'Senin-Jumat',
            tanggal: tanggal ? new Date(tanggal) : null,
        };
        
        if (jamMasukStart) updateData.jamMasukStart = parseTime(jamMasukStart);
        if (jamMasukFinish) updateData.jamMasukFinish = parseTime(jamMasukFinish);
        if (jamPulang) updateData.jamPulang = parseTime(jamPulang);

        const updatedJadwal = await prisma.jadwalAbsensi.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        res.json({
            status: 'success',
            data: updatedJadwal
        });
    } catch (error) {
        console.error("Error PUT /jadwal:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Hapus jadwal
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.jadwalAbsensi.delete({
            where: { id: parseInt(id) }
        });

        res.json({
            status: 'success',
            message: 'Jadwal berhasil dihapus'
        });
    } catch (error) {
        console.error("Error DELETE /jadwal:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Assign kelas ke jadwal
router.put('/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { kelasId } = req.body;

        const updateJadwal = await prisma.jadwalAbsensi.update({
            where: { id: parseInt(id) },
            data: {
                kelas: {
                    connect: { id: parseInt(kelasId) }
                }
            },
            include: {
                kelas: true
            }
        });

        res.json({
            status: 'success',
            data: updateJadwal
        });
    } catch (error) {
        console.error("Error PUT /jadwal/assign:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Toggle status jadwal (isLibur)
router.put('/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { isLibur } = req.body;

        const updatedJadwal = await prisma.jadwalAbsensi.update({
            where: { id: parseInt(id) },
            data: { isLibur: isLibur }
        });

        res.json({
            status: 'success',
            data: updatedJadwal
        });
    } catch (error) {
        console.error("Error PUT /jadwal/toggle:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

module.exports = router;
