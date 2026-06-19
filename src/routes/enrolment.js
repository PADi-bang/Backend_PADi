const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');
const xlsx = require('xlsx');
const os = require('os');
const fs = require('fs');

const upload = multer({ dest: os.tmpdir() });

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
                enrolmentGuru: {
                    include: { guru: true }
                },
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
            prisma.masterKelas.findMany({ orderBy: { namaKelas: 'asc' } }),
            prisma.masterAngkatan.findMany({ orderBy: { nomorAngkatan: 'asc' } }),
            prisma.masterTahunAkademik.findMany({ orderBy: { tahunAjaran: 'asc' } })
        ]);
        res.status(200).json({ status: 'success', data: { kelas, angkatan, ta } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil master data' });
    }
});

// 3. Edit / Atur Tingkat Kelas (Prefix)
router.post('/edit-tingkat', async (req, res) => {
    const { prefix, angkatanId, sekolahId } = req.body;
    try {
        // Cari Tahun Akademik yang sedang aktif
        const activeTa = await prisma.masterTahunAkademik.findFirst({
            where: { isActive: true, sekolahId: parseInt(sekolahId) || 1 }
        });

        if (!activeTa) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Tidak ada Tahun Akademik yang aktif. Silakan aktifkan minimal 1 Tahun Akademik di Master Data.' 
            });
        }

        const tahunAkademikId = activeTa.id;

        // Cek validasi tingkat (prefix)
        const usedInOther = await prisma.enrolmentKelas.findMany({
            where: { angkatanId: parseInt(angkatanId), tahunAkademikId: tahunAkademikId },
            include: { masterKelas: true }
        });

        for (const enr of usedInOther) {
            const prefixOther = enr.masterKelas.namaKelas.split(' ')[0].toUpperCase();
            if (prefixOther !== prefix.toUpperCase()) {
                return res.status(400).json({ 
                    status: 'error', 
                    message: `Kombinasi Angkatan & TA ini sudah digunakan oleh kelas tingkat ${prefixOther}. Tidak dapat dipakai untuk kelas tingkat ${prefix}.` 
                });
            }
        }

        const masterKelasList = await prisma.masterKelas.findMany({
            where: { namaKelas: { startsWith: prefix + ' ' } }
        });

        for (const mk of masterKelasList) {
            const existingEnrolment = await prisma.enrolmentKelas.findFirst({ where: { kelasId: mk.id } });
            if (existingEnrolment) {
                await prisma.enrolmentKelas.update({
                    where: { id: existingEnrolment.id },
                    data: { angkatanId: parseInt(angkatanId), tahunAkademikId: tahunAkademikId }
                });
            } else {
                await prisma.enrolmentKelas.create({
                    data: {
                        sekolahId: parseInt(sekolahId) || 1,
                        kelasId: mk.id,
                        angkatanId: parseInt(angkatanId),
                        tahunAkademikId: tahunAkademikId,
                        keterangan: ''
                    }
                });
            }
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengatur tingkat kelas' });
    }
});

// 4. Reset Tingkat Kelas (Kosongkan)
router.post('/reset-tingkat', async (req, res) => {
    const { prefix } = req.body;
    try {
        const enrolments = await prisma.enrolmentKelas.findMany({
            where: { masterKelas: { namaKelas: { startsWith: prefix + ' ' } } }
        });
        
        for (const enrolment of enrolments) {
            await prisma.enrolmentSiswa.deleteMany({ where: { enrolmentKelasId: enrolment.id } });
            await prisma.enrolmentGuru.deleteMany({ where: { enrolmentKelasId: enrolment.id } });
            await prisma.enrolmentKelas.delete({ where: { id: enrolment.id } });
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mereset tingkat kelas' });
    }
});

// 5. Edit Keterangan Kelas
router.post('/edit-keterangan/:kelasId', async (req, res) => {
    const kelasId = parseInt(req.params.kelasId);
    const { keterangan } = req.body;
    try {
        const existingEnrolment = await prisma.enrolmentKelas.findFirst({ where: { kelasId } });
        if (!existingEnrolment) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Tidak dapat mengisi keterangan karena tingkat kelas belum diatur (Angkatan dan Tahun Akademik kosong).' 
            });
        }

        await prisma.enrolmentKelas.update({
            where: { id: existingEnrolment.id },
            data: { keterangan }
        });
        
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengubah keterangan kelas' });
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

// 8. Atur Wali Kelas
router.post('/:id/guru', async (req, res) => {
    const enrolmentKelasId = parseInt(req.params.id);
    const { guruId } = req.body;
    try {
        // Karena wali kelas hanya boleh 1 per kelas, kita hapus dulu yang lama
        await prisma.enrolmentGuru.deleteMany({
            where: { enrolmentKelasId }
        });

        const newGuru = await prisma.enrolmentGuru.create({
            data: {
                enrolmentKelasId,
                guruId: parseInt(guruId),
                isActive: true
            }
        });
        res.status(201).json({ status: 'success', data: newGuru });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengatur wali kelas' });
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

// 10. Proses Mutasi Status Siswa (Naik Kelas, Lulus, Cuti)
router.post('/:id/bulk-status', async (req, res) => {
    const enrolmentId = parseInt(req.params.id);
    const { updates } = req.body; // array of { siswaId, status }

    try {
        const currentEnrolment = await prisma.enrolmentKelas.findUnique({
            where: { id: enrolmentId },
            include: { masterKelas: true, masterTahunAkademik: true, masterAngkatan: true }
        });

        if (!currentEnrolment) {
            return res.status(404).json({ status: 'error', message: 'Kelas tidak ditemukan' });
        }

        // Kalkulasi TA selanjutnya
        const currentTA = currentEnrolment.masterTahunAkademik.tahunAjaran; // e.g. "2026/2027"
        const parts = currentTA.split('/');
        const nextTAStr = `${parseInt(parts[0])+1}/${parseInt(parts[1])+1}`;

        // Cari atau buat TA selanjutnya
        let nextTA = await prisma.masterTahunAkademik.findFirst({
            where: { tahunAjaran: nextTAStr, semester: 'Ganjil', sekolahId: currentEnrolment.sekolahId }
        });

        if (!nextTA) {
            nextTA = await prisma.masterTahunAkademik.create({
                data: {
                    sekolahId: currentEnrolment.sekolahId,
                    tahunAjaran: nextTAStr,
                    semester: 'Ganjil',
                    isActive: false // Default false agar admin mengaktifkannya secara manual jika belum waktunya
                }
            });
        }

        for (const update of updates) {
            const { siswaId, status } = update;
            
            if (status === 'Lulus') {
                // Lulus: Set isActive false di enrolment saat ini
                await prisma.enrolmentSiswa.updateMany({
                    where: { enrolmentKelasId: enrolmentId, siswaId: parseInt(siswaId) },
                    data: { isActive: false }
                });
            } else if (status === 'Cuti/Tidak Naik Kelas') {
                // Cuti / Tidak Naik Kelas: Siswa tetap berada di kelas yang sama tanpa pindah TA
                // (Tidak melakukan update apapun sehingga siswa tetap di kelas ini)

            } else if (status === 'Naik Kelas') {
                let targetNamaKelas = currentEnrolment.masterKelas.namaKelas;
                
                // Ganti prefix kelas (X -> XI -> XII)
                if (targetNamaKelas.startsWith('X ')) {
                    targetNamaKelas = targetNamaKelas.replace(/^X /, 'XI ');
                } else if (targetNamaKelas.startsWith('XI ')) {
                    targetNamaKelas = targetNamaKelas.replace(/^XI /, 'XII ');
                }
                
                // Find or create MasterKelas
                let nextMasterKelas = await prisma.masterKelas.findFirst({
                    where: { namaKelas: targetNamaKelas, sekolahId: currentEnrolment.sekolahId }
                });

                if (!nextMasterKelas) {
                    nextMasterKelas = await prisma.masterKelas.create({
                        data: { namaKelas: targetNamaKelas, sekolahId: currentEnrolment.sekolahId }
                    });
                }
                
                // Find or create EnrolmentKelas
                let nextEnrolmentKelas = await prisma.enrolmentKelas.findFirst({
                    where: {
                        kelasId: nextMasterKelas.id,
                        angkatanId: currentEnrolment.angkatanId,
                        tahunAkademikId: nextTA.id,
                        sekolahId: currentEnrolment.sekolahId
                    }
                });

                if (!nextEnrolmentKelas) {
                    nextEnrolmentKelas = await prisma.enrolmentKelas.create({
                        data: {
                            sekolahId: currentEnrolment.sekolahId,
                            kelasId: nextMasterKelas.id,
                            angkatanId: currentEnrolment.angkatanId,
                            tahunAkademikId: nextTA.id,
                            keterangan: ''
                        }
                    });
                }
                
                // Pindahkan siswa ke EnrolmentKelas baru (Update kelasId)
                await prisma.enrolmentSiswa.updateMany({
                    where: { enrolmentKelasId: enrolmentId, siswaId: parseInt(siswaId) },
                    data: { enrolmentKelasId: nextEnrolmentKelas.id }
                });
            }
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Bulk Status Error:", error);
        res.status(500).json({ status: 'error', message: 'Gagal memproses status siswa' });
    }
});

module.exports = router;
