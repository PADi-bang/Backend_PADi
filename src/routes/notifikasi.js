const express = require('express');
const router = express.Router();
const prisma = require('../db');

// GET /api/notifikasi/:userId
// Mengambil semua notifikasi siswa (terbaca & belum terbaca)
router.get('/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const notifications = await prisma.notifikasi.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json({ status: 'success', data: notifications });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data notifikasi' });
    }
});

// GET /api/notifikasi/:userId/unread
// Mengambil notifikasi yang belum terbaca saja
router.get('/:userId/unread', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const notifications = await prisma.notifikasi.findMany({
            where: { userId, isRead: false },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json({ status: 'success', data: notifications });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data notifikasi belum terbaca' });
    }
});

// PUT /api/notifikasi/:id/read
// Menandai satu notifikasi tertentu sebagai terbaca
router.put('/:id/read', async (req, res) => {
    try {
        const notifId = parseInt(req.params.id);
        const updated = await prisma.notifikasi.update({
            where: { id: notifId },
            data: { isRead: true }
        });
        res.status(200).json({ status: 'success', message: 'Notifikasi berhasil ditandai terbaca', data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal memperbarui status notifikasi' });
    }
});

// PUT /api/notifikasi/:userId/read-all
// Menandai semua notifikasi milik siswa tertentu sebagai terbaca
router.put('/:userId/read-all', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        await prisma.notifikasi.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true }
        });
        res.status(200).json({ status: 'success', message: 'Semua notifikasi berhasil ditandai terbaca' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal memperbarui semua status notifikasi' });
    }
});

module.exports = router;
