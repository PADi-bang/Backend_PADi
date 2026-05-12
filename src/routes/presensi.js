const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');

// POST /api/presensi — catat kehadiran
router.post('/', verifyToken, async (req, res) => {
  const { mata_kuliah, latitude, longitude } = req.body;
  const user_id = req.user.id; // diambil dari token JWT

  if (!mata_kuliah) {
    return res.status(400).json({ message: 'Mata kuliah wajib diisi' });
  }

  try {
    // Cek apakah sudah presensi hari ini untuk mata kuliah yang sama
    const cek = await pool.query(
      `SELECT id FROM presensi
       WHERE user_id = $1 AND mata_kuliah = $2 AND tanggal = CURRENT_DATE`,
      [user_id, mata_kuliah]
    );

    if (cek.rows.length > 0) {
      return res.status(409).json({ message: 'Anda sudah presensi untuk mata kuliah ini hari ini' });
    }

    const result = await pool.query(
      `INSERT INTO presensi (user_id, mata_kuliah, latitude, longitude)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, mata_kuliah, latitude || null, longitude || null]
    );

    res.status(201).json({
      message: 'Presensi berhasil dicatat',
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

// GET /api/presensi/riwayat — riwayat presensi milik user yang login
router.get('/riwayat', verifyToken, async (req, res) => {
  const user_id = req.user.id;

  try {
    const result = await pool.query(
      `SELECT p.id, p.mata_kuliah, p.tanggal, p.waktu, p.status
       FROM presensi p
       WHERE p.user_id = $1
       ORDER BY p.tanggal DESC, p.waktu DESC`,
      [user_id]
    );

    res.status(200).json({
      message: 'Riwayat presensi berhasil diambil',
      total: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

// GET /api/presensi/semua — khusus dosen/admin, lihat semua presensi
router.get('/semua', verifyToken, async (req, res) => {
  if (req.user.role !== 'dosen' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Akses ditolak, hanya untuk dosen/admin' });
  }

  const { mata_kuliah, tanggal } = req.query;

  try {
    let query = `
      SELECT p.id, u.nama, u.nim, p.mata_kuliah, p.tanggal, p.waktu, p.status
      FROM presensi p
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (mata_kuliah) {
      params.push(mata_kuliah);
      query += ` AND p.mata_kuliah = $${params.length}`;
    }
    if (tanggal) {
      params.push(tanggal);
      query += ` AND p.tanggal = $${params.length}`;
    }

    query += ' ORDER BY p.tanggal DESC, u.nama ASC';

    const result = await pool.query(query, params);

    res.status(200).json({
      message: 'Data presensi berhasil diambil',
      total: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

// PATCH /api/presensi/:id/status — update status presensi (dosen/admin)
router.patch('/:id/status', verifyToken, async (req, res) => {
  if (req.user.role !== 'dosen' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Akses ditolak' });
  }

  const { id } = req.params;
  const { status } = req.body; // 'hadir' | 'izin' | 'alpha'

  const validStatus = ['hadir', 'izin', 'alpha'];
  if (!validStatus.includes(status)) {
    return res.status(400).json({ message: `Status tidak valid. Gunakan: ${validStatus.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `UPDATE presensi SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Data presensi tidak ditemukan' });
    }

    res.status(200).json({
      message: 'Status presensi diperbarui',
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan server' });
  }
});

module.exports = router;