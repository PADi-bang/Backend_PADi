const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Ambil semua jadwal beserta kelas yang ter-assign
router.get('/', async (req, res) => {
    try {
        const jadwalListRaw = await prisma.jadwalAbsensi.findMany({
            where: { sekolahId: req.session.sekolahId },
            include: {
                kelas: { include: { tingkat: true } } // Ambil relasi kelas & tingkat
            },
            orderBy: {
                namaJadwal: 'asc'
            }
        });

        // Ambil semua kelas untuk panel 'Kelas Yang Belum Terjadwal'
        const kelasListRaw = await prisma.masterKelas.findMany({
            where: { sekolahId: req.session.sekolahId },
            include: {
                jadwalAbsensi: true,
                tingkat: true
            },
            orderBy: [{ tingkatId: 'asc' }, { namaKelas: 'asc' }]
        });

        // Map namaKelas agar gabung dengan namaTingkat
        const mapKelas = (k) => {
            if (!k) return k;
            return {
                ...k,
                namaKelasSuffix: k.namaKelas,
                namaKelas: k.tingkat ? `${k.tingkat.namaTingkat} ${k.namaKelas}` : k.namaKelas
            };
        };

        const jadwalList = jadwalListRaw.map(j => ({
            ...j,
            kelas: j.kelas.map(mapKelas)
        }));

        const kelasList = kelasListRaw.map(mapKelas);

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
        const { namaJadwal, tipeJadwal, tanggal, jamMasukStart, jamMasukFinish, jamPulang } = req.body;

        // Validasi dan konversi waktu
        const parseTime = (timeStr) => {
            if (!timeStr) return null;
            if (timeStr.includes('T')) return new Date(timeStr);
            const [hours, minutes] = timeStr.split(':');
            return new Date(Date.UTC(1970, 0, 1, parseInt(hours), parseInt(minutes), 0));
        };

        let currentHari = '';
        if (tipeJadwal === 'Reguler' || !tanggal) {
            currentHari = 'Senin, Selasa, Rabu, Kamis, Jumat';
        } else {
            currentHari = req.body.opsiTanggal || 'multiple';
        }

        let processedTanggal = [];
        if (tipeJadwal === 'Khusus' && tanggal) {
            const dates = Array.isArray(tanggal) ? tanggal : tanggal.split(',');
            processedTanggal = dates.map(d => new Date(d.trim()));
        }

        const newJadwal = await prisma.jadwalAbsensi.create({
            data: {
                sekolahId: req.session.sekolahId, // Default sementara
                namaJadwal,
                hari: currentHari,
                tanggal: processedTanggal,
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
        const existingJadwal = await prisma.jadwalAbsensi.findFirst({ where: { id: parseInt(id), sekolahId: req.session.sekolahId } });
        if (!existingJadwal) return res.status(403).json({ status: 'error', message: 'Unauthorized' });
        const { namaJadwal, tipeJadwal, tanggal, jamMasukStart, jamMasukFinish, jamPulang } = req.body;

        const parseTime = (timeStr) => {
            if (!timeStr) return null;
            if (timeStr.includes('T')) return new Date(timeStr);
            const [hours, minutes] = timeStr.split(':');
            return new Date(Date.UTC(1970, 0, 1, parseInt(hours), parseInt(minutes), 0));
        };

        let currentHari = '';
        if (tipeJadwal === 'Reguler' || !tanggal) {
            currentHari = 'Senin, Selasa, Rabu, Kamis, Jumat';
        } else {
            currentHari = req.body.opsiTanggal || 'multiple';
        }

        let processedTanggal = [];
        if (tipeJadwal === 'Khusus' && tanggal) {
            const dates = Array.isArray(tanggal) ? tanggal : tanggal.split(',');
            processedTanggal = dates.map(d => new Date(d.trim()));
        }

        const updateData = {
            namaJadwal,
            hari: currentHari,
            tanggal: processedTanggal,
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
        const existingJadwal = await prisma.jadwalAbsensi.findFirst({ where: { id: parseInt(id), sekolahId: req.session.sekolahId } });
        if (!existingJadwal) return res.status(403).json({ status: 'error', message: 'Unauthorized' });

        // Hapus data absensi terkait terlebih dahulu untuk menghindari error foreign key constraint
        await prisma.absensi.deleteMany({
            where: { jadwalId: parseInt(id) }
        });

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
        const existingJadwal = await prisma.jadwalAbsensi.findFirst({ where: { id: parseInt(id), sekolahId: req.session.sekolahId } });
        if (!existingJadwal) return res.status(403).json({ status: 'error', message: 'Unauthorized' });
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

// Unassign kelas dari jadwal
router.put('/:id/unassign', async (req, res) => {
    try {
        const { id } = req.params;
        const existingJadwal = await prisma.jadwalAbsensi.findFirst({ where: { id: parseInt(id), sekolahId: req.session.sekolahId } });
        if (!existingJadwal) return res.status(403).json({ status: 'error', message: 'Unauthorized' });
        const { kelasId } = req.body;

        const updateJadwal = await prisma.jadwalAbsensi.update({
            where: { id: parseInt(id) },
            data: {
                kelas: {
                    disconnect: { id: parseInt(kelasId) }
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
        console.error("Error PUT /jadwal/unassign:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Toggle status jadwal (isLibur)
router.put('/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const existingJadwal = await prisma.jadwalAbsensi.findFirst({ where: { id: parseInt(id), sekolahId: req.session.sekolahId } });
        if (!existingJadwal) return res.status(403).json({ status: 'error', message: 'Unauthorized' });
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

// Aktifkan jadwal
router.put('/:id/activate', async (req, res) => {
    try {
        const { id } = req.params;
        const existingJadwal = await prisma.jadwalAbsensi.findFirst({ where: { id: parseInt(id), sekolahId: req.session.sekolahId } });
        if (!existingJadwal) return res.status(403).json({ status: 'error', message: 'Unauthorized' });

        // Pertama, nonaktifkan semua jadwal
        await prisma.jadwalAbsensi.updateMany({
            where: { sekolahId: req.session.sekolahId },
            data: { isActive: false }
        });

        // Kemudian aktifkan jadwal yang dipilih
        const updatedJadwal = await prisma.jadwalAbsensi.update({
            where: { id: parseInt(id) },
            data: { isActive: true }
        });

        res.json({
            status: 'success',
            data: updatedJadwal
        });
    } catch (error) {
        console.error("Error PUT /jadwal/activate:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Nonaktifkan jadwal
router.put('/:id/deactivate', async (req, res) => {
    try {
        const { id } = req.params;
        const existingJadwal = await prisma.jadwalAbsensi.findFirst({ where: { id: parseInt(id), sekolahId: req.session.sekolahId } });
        if (!existingJadwal) return res.status(403).json({ status: 'error', message: 'Unauthorized' });

        const updatedJadwal = await prisma.jadwalAbsensi.update({
            where: { id: parseInt(id) },
            data: { isActive: false }
        });

        res.json({
            status: 'success',
            data: updatedJadwal
        });
    } catch (error) {
        console.error("Error PUT /jadwal/deactivate:", error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

module.exports = router;
