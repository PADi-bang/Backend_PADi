const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Fungsi helper untuk mendapatkan semester aktif saat ini
async function getSemesterAktif() {
    const bulanSekarang = new Date().getMonth() + 1; // 1-12
    
    let mulaiGanjil = 7; let selesaiGanjil = 12;
    let mulaiGenap = 1; let selesaiGenap = 6;
    
    try {
        const config = await prisma.pengaturan.findMany();
        config.forEach(c => {
            if(c.kunci === 'bulan_mulai_ganjil') mulaiGanjil = parseInt(c.nilai);
            if(c.kunci === 'bulan_selesai_ganjil') selesaiGanjil = parseInt(c.nilai);
            if(c.kunci === 'bulan_mulai_genap') mulaiGenap = parseInt(c.nilai);
            if(c.kunci === 'bulan_selesai_genap') selesaiGenap = parseInt(c.nilai);
        });
    } catch(e) {}
    
    // Logika ganjil
    let isGanjil = false;
    if (mulaiGanjil <= selesaiGanjil) {
        if (bulanSekarang >= mulaiGanjil && bulanSekarang <= selesaiGanjil) isGanjil = true;
    } else {
        if (bulanSekarang >= mulaiGanjil || bulanSekarang <= selesaiGanjil) isGanjil = true;
    }

    if (isGanjil) return 'Ganjil';
    return 'Genap';
}

// ==========================================
// 0. PENGATURAN
// ==========================================
router.get('/pengaturan', async (req, res) => {
    try {
        const pengaturan = await prisma.pengaturan.findMany();
        res.status(200).json({ status: 'success', data: pengaturan });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil pengaturan' });
    }
});

router.post('/pengaturan', async (req, res) => {
    const { ganjil, ganjilSelesai, genap, genapSelesai } = req.body;
    try {
        const settings = [
            { kunci: 'bulan_mulai_ganjil', nilai: ganjil.toString() },
            { kunci: 'bulan_selesai_ganjil', nilai: ganjilSelesai.toString() },
            { kunci: 'bulan_mulai_genap', nilai: genap.toString() },
            { kunci: 'bulan_selesai_genap', nilai: genapSelesai.toString() }
        ];
        for (const s of settings) {
            if (s.nilai) {
                await prisma.pengaturan.upsert({
                    where: { kunci: s.kunci },
                    update: { nilai: s.nilai },
                    create: { kunci: s.kunci, nilai: s.nilai }
                });
            }
        }
        
        // Sinkronisasi semester TA aktif secara real-time
        const semesterAktif = await getSemesterAktif();
        await prisma.masterTahunAkademik.updateMany({
            where: { isActive: true },
            data: { semester: semesterAktif }
        });

        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menyimpan pengaturan' });
    }
});

// ==========================================
// 1. MASTER KELAS
// ==========================================
router.get('/kelas', async (req, res) => {
    try {
        const kelas = await prisma.masterKelas.findMany({
            include: { sekolah: true },
            orderBy: { namaKelas: 'asc' }
        });
        res.status(200).json({ status: 'success', data: kelas });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data master kelas' });
    }
});

router.post('/kelas', async (req, res) => {
    const { prefix, namaKelasAkhiran, sekolahId } = req.body;
    try {
        const namaKelas = `${prefix} ${namaKelasAkhiran}`.trim();
        // Cek duplikasi
        const existing = await prisma.masterKelas.findFirst({
            where: { namaKelas: { equals: namaKelas, mode: 'insensitive' }, sekolahId: parseInt(sekolahId) || 1 }
        });
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Nama kelas sudah ada' });
        }

        const newKelas = await prisma.masterKelas.create({
            data: { 
                namaKelas, 
                sekolahId: parseInt(sekolahId) || 1 
            }
        });

        // Auto-enrolment jika prefix kelas (Tingkat) sudah diatur
        const existingEnrolmentInSamePrefix = await prisma.enrolmentKelas.findFirst({
            where: { masterKelas: { namaKelas: { startsWith: prefix + ' ' } } }
        });

        if (existingEnrolmentInSamePrefix) {
            await prisma.enrolmentKelas.create({
                data: {
                    sekolahId: parseInt(sekolahId) || 1,
                    kelasId: newKelas.id,
                    angkatanId: existingEnrolmentInSamePrefix.angkatanId,
                    tahunAkademikId: existingEnrolmentInSamePrefix.tahunAkademikId,
                    keterangan: ''
                }
            });
        }

        res.status(201).json({ status: 'success', data: newKelas });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menambah master kelas' });
    }
});

router.delete('/kelas/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await prisma.masterKelas.delete({ where: { id } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menghapus master kelas' });
    }
});

// ==========================================
// 2. MASTER ANGKATAN
// ==========================================
router.get('/angkatan', async (req, res) => {
    try {
        const angkatan = await prisma.masterAngkatan.findMany({
            include: { sekolah: true },
            orderBy: { nomorAngkatan: 'asc' }
        });
        res.status(200).json({ status: 'success', data: angkatan });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data master angkatan' });
    }
});

router.post('/angkatan', async (req, res) => {
    const { nomorAngkatan, sekolahId } = req.body;
    try {
        // Cek duplikasi
        const existing = await prisma.masterAngkatan.findFirst({
            where: { nomorAngkatan: { equals: nomorAngkatan, mode: 'insensitive' }, sekolahId: parseInt(sekolahId) || 1 }
        });
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Angkatan sudah ada' });
        }

        // Cek jumlah yang aktif
        const activeCount = await prisma.masterAngkatan.count({ where: { isActive: true, sekolahId: parseInt(sekolahId) || 1 } });
        const newIsActive = activeCount < 4;

        const newAngkatan = await prisma.masterAngkatan.create({
            data: { 
                nomorAngkatan, 
                sekolahId: parseInt(sekolahId) || 1,
                isActive: newIsActive
            }
        });
        res.status(201).json({ status: 'success', data: newAngkatan });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menambah master angkatan' });
    }
});

router.put('/angkatan/:id/toggle-active', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const angkatan = await prisma.masterAngkatan.findUnique({ where: { id } });
        if(angkatan) {
            if (!angkatan.isActive) {
                const activeCount = await prisma.masterAngkatan.count({ where: { isActive: true, sekolahId: angkatan.sekolahId } });
                if (activeCount >= 4) {
                    return res.status(400).json({ status: 'error', message: 'Maksimal_hanya_4_angkatan_aktif' });
                }
            }
            await prisma.masterAngkatan.update({
                where: { id },
                data: { isActive: !angkatan.isActive }
            });
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal toggle master angkatan' });
    }
});

router.delete('/angkatan/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await prisma.masterAngkatan.delete({ where: { id } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menghapus master angkatan' });
    }
});

// ==========================================
// 3. MASTER TAHUN AKADEMIK
// ==========================================
router.get('/tahun-akademik', async (req, res) => {
    try {
        const tahunAkademik = await prisma.masterTahunAkademik.findMany({
            include: { sekolah: true },
            orderBy: { tahunAjaran: 'asc' }
        });
        res.status(200).json({ status: 'success', data: tahunAkademik });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data master tahun akademik' });
    }
});

router.post('/tahun-akademik', async (req, res) => {
    const { tahunAjaran, isActive, sekolahId } = req.body;
    try {
        // Cek duplikasi
        const existing = await prisma.masterTahunAkademik.findFirst({
            where: { tahunAjaran: { equals: tahunAjaran, mode: 'insensitive' }, sekolahId: parseInt(sekolahId) || 1 }
        });
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Tahun akademik sudah ada' });
        }

        // Otomatis tentukan semester berdasarkan bulan saat ini
        const semesterAktif = await getSemesterAktif();
        
        let newIsActive = isActive === 'true' || isActive === true;
        if (newIsActive) {
            // Nonaktifkan semua TA lainnya
            await prisma.masterTahunAkademik.updateMany({
                where: { sekolahId: parseInt(sekolahId) || 1 },
                data: { isActive: false }
            });
        }

        const newTa = await prisma.masterTahunAkademik.create({
            data: { 
                tahunAjaran, 
                semester: semesterAktif, 
                isActive: newIsActive,
                sekolahId: parseInt(sekolahId) || 1 
            }
        });
        res.status(201).json({ status: 'success', data: newTa });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menambah master tahun akademik' });
    }
});

router.put('/tahun-akademik/:id/toggle-active', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const ta = await prisma.masterTahunAkademik.findUnique({ where: { id } });
        if(ta) {
            const newIsActive = !ta.isActive;
            if (newIsActive) {
                // Nonaktifkan semua TA lainnya
                await prisma.masterTahunAkademik.updateMany({
                    where: { sekolahId: ta.sekolahId },
                    data: { isActive: false }
                });
            }
            await prisma.masterTahunAkademik.update({
                where: { id },
                data: { isActive: newIsActive }
            });

            // Auto-update TA pada semua kelas di Enrolment
            if (newIsActive) {
                await prisma.enrolmentKelas.updateMany({
                    where: { sekolahId: ta.sekolahId },
                    data: { tahunAkademikId: id }
                });
            }
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengaktifkan tahun akademik' });
    }
});

router.delete('/tahun-akademik/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await prisma.masterTahunAkademik.delete({ where: { id } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menghapus master tahun akademik' });
    }
});

module.exports = router;
