const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// ENROLMENT KELAS API
// ==========================================

// 1. Dapatkan daftar Master Kelas dan Enrolment-nya
router.get('/', async (req, res) => {
    try {
        const masterKelasList = await prisma.masterKelas.findMany({
            orderBy: { namaKelas: 'asc' }
        });
        
        const enrolments = await prisma.enrolmentKelas.findMany({
            include: {
                masterKelas: true,
                masterAngkatan: true,
                masterTahunAkademik: true,
                _count: {
                    select: { enrolmentSiswa: true, enrolmentGuru: true }
                }
            }
        });

        // Map enrolments ke masterKelas
        const data = masterKelasList.map(mk => {
            const enrolment = enrolments.find(e => e.kelasId === mk.id);
            return {
                masterKelas: mk,
                enrolment: enrolment || null
            };
        });

        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data enrolment' });
    }
});

// 2. Dapatkan data master untuk form "Tambah Kelas"
router.get('/master-data', async (req, res) => {
    try {
        const [kelas, angkatan, ta] = await Promise.all([
            prisma.masterKelas.findMany(),
            prisma.masterAngkatan.findMany(),
            prisma.masterTahunAkademik.findMany()
        ]);
        res.status(200).json({ status: 'success', data: { kelas, angkatan, ta } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil master data' });
    }
});

// 3. Edit / Atur Enrolment Kelas
router.post('/edit/:kelasId', async (req, res) => {
    const kelasId = parseInt(req.params.kelasId);
    const { angkatanId, tahunAkademikId, keterangan, sekolahId } = req.body;
    try {
        const targetKelas = await prisma.masterKelas.findUnique({ where: { id: kelasId } });
        if (!targetKelas) return res.status(404).json({ status: 'error', message: 'Kelas tidak ditemukan' });

        const prefixTarget = targetKelas.namaKelas.split(' ')[0].toUpperCase();

        // Cek validasi tingkat (prefix)
        const usedInOther = await prisma.enrolmentKelas.findMany({
            where: { angkatanId: parseInt(angkatanId), tahunAkademikId: parseInt(tahunAkademikId) },
            include: { masterKelas: true }
        });

        for (const enr of usedInOther) {
            if (enr.kelasId !== kelasId) {
                const prefixOther = enr.masterKelas.namaKelas.split(' ')[0].toUpperCase();
                if (prefixOther !== prefixTarget) {
                    return res.status(400).json({ 
                        status: 'error', 
                        message: `Kombinasi Angkatan & TA ini sudah digunakan oleh kelas tingkat ${prefixOther}. Tidak dapat dipakai untuk kelas tingkat ${prefixTarget}.` 
                    });
                }
            }
        }

        const existingEnrolment = await prisma.enrolmentKelas.findFirst({ where: { kelasId } });
        if (existingEnrolment) {
            await prisma.enrolmentKelas.update({
                where: { id: existingEnrolment.id },
                data: { angkatanId: parseInt(angkatanId), tahunAkademikId: parseInt(tahunAkademikId), keterangan }
            });
        } else {
            await prisma.enrolmentKelas.create({
                data: {
                    sekolahId: parseInt(sekolahId) || 1,
                    kelasId,
                    angkatanId: parseInt(angkatanId),
                    tahunAkademikId: parseInt(tahunAkademikId),
                    keterangan
                }
            });
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengatur enrolment kelas' });
    }
});

// 4. Reset Enrolment Kelas (Kosongkan)
router.post('/reset/:kelasId', async (req, res) => {
    const kelasId = parseInt(req.params.kelasId);
    try {
        const enrolment = await prisma.enrolmentKelas.findFirst({ where: { kelasId } });
        if (enrolment) {
            await prisma.enrolmentSiswa.deleteMany({ where: { enrolmentKelasId: enrolment.id } });
            await prisma.enrolmentGuru.deleteMany({ where: { enrolmentKelasId: enrolment.id } });
            await prisma.enrolmentKelas.delete({ where: { id: enrolment.id } });
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mereset enrolment kelas' });
    }
});

// ==========================================
// DETAIL ENROLMENT KELAS (SISWA & GURU)
// ==========================================

// 5. Detail Enrolment Kelas (Daftar Siswa & Guru di dalamnya)
router.get('/:id/detail', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const enrolment = await prisma.enrolmentKelas.findUnique({
            where: { id },
            include: {
                masterKelas: true,
                masterAngkatan: true,
                masterTahunAkademik: true,
                enrolmentSiswa: {
                    include: { siswa: true }
                },
                enrolmentGuru: {
                    include: { guru: true }
                }
            }
        });

        if (!enrolment) return res.status(404).json({ status: 'error', message: 'Kelas tidak ditemukan' });

        // Ambil semua siswa & guru yang ada di database untuk opsi dropdown "Tambah"
        const [allSiswa, allGuru] = await Promise.all([
            prisma.siswa.findMany(),
            prisma.guru.findMany()
        ]);

        res.status(200).json({ 
            status: 'success', 
            data: { enrolment, allSiswa, allGuru } 
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil detail kelas' });
    }
});

// 6. Tambah Siswa ke Kelas
router.post('/:id/siswa', async (req, res) => {
    const enrolmentKelasId = parseInt(req.params.id);
    const { siswaId } = req.body;
    try {
        // Cek apakah sudah ada
        const existing = await prisma.enrolmentSiswa.findFirst({
            where: { enrolmentKelasId, siswaId: parseInt(siswaId) }
        });
        
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Siswa sudah ada di kelas ini' });
        }

        const newSiswa = await prisma.enrolmentSiswa.create({
            data: {
                enrolmentKelasId,
                siswaId: parseInt(siswaId),
                isActive: true
            }
        });
        res.status(201).json({ status: 'success', data: newSiswa });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menambah siswa ke kelas' });
    }
});

// 7. Hapus Siswa dari Kelas
router.delete('/:id/siswa/:siswaId', async (req, res) => {
    const enrolmentKelasId = parseInt(req.params.id);
    const siswaId = parseInt(req.params.siswaId);
    try {
        await prisma.enrolmentSiswa.deleteMany({
            where: { enrolmentKelasId, siswaId }
        });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menghapus siswa dari kelas' });
    }
});

// 8. Tambah Guru ke Kelas
router.post('/:id/guru', async (req, res) => {
    const enrolmentKelasId = parseInt(req.params.id);
    const { guruId } = req.body;
    try {
        const existing = await prisma.enrolmentGuru.findFirst({
            where: { enrolmentKelasId, guruId: parseInt(guruId) }
        });
        
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Guru sudah ada di kelas ini' });
        }

        const newGuru = await prisma.enrolmentGuru.create({
            data: {
                enrolmentKelasId,
                guruId: parseInt(guruId),
                isActive: true
            }
        });
        res.status(201).json({ status: 'success', data: newGuru });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menambah guru ke kelas' });
    }
});

// 9. Hapus Guru dari Kelas
router.delete('/:id/guru/:guruId', async (req, res) => {
    const enrolmentKelasId = parseInt(req.params.id);
    const guruId = parseInt(req.params.guruId);
    try {
        await prisma.enrolmentGuru.deleteMany({
            where: { enrolmentKelasId, guruId }
        });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menghapus guru dari kelas' });
    }
});

module.exports = router;
