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
        const taId = req.query.taId ? parseInt(req.query.taId) : null;
        let activeTa = null;

        if (taId) {
            activeTa = await prisma.masterTahunAkademik.findUnique({ where: { id: taId } });
        }
        if (!activeTa) {
            activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true } });
        }

        const masterKelasList = await prisma.masterKelas.findMany({
            where: { sekolahId: req.session.sekolahId },
            include: { tingkat: true },
            orderBy: [{ tingkatId: 'asc' }, { namaKelas: 'asc' }]
        });
        
        const enrolments = await prisma.enrolmentKelas.findMany({
            where: {
                sekolahId: req.session.sekolahId,
                tahunAkademikId: activeTa ? activeTa.id : undefined
            },
            include: {
                masterKelas: { include: { tingkat: true } },
                masterTahunAkademik: true,
                enrolmentGuru: {
                    where: { isActive: true },
                    include: { guru: true }
                },
                _count: {
                    select: { 
                        enrolmentSiswa: { where: { isActive: true } }, 
                        enrolmentGuru: { where: { isActive: true } } 
                    }
                }
            }
        });

        // Map enrolments ke masterKelas
        const data = masterKelasList.flatMap(mk => {
            const mappedMk = {
                ...mk,
                namaKelasSuffix: mk.namaKelas,
                namaKelas: mk.tingkat ? `${mk.tingkat.namaTingkat} ${mk.namaKelas}` : mk.namaKelas
            };
            const classEnrolments = enrolments.filter(e => e.kelasId === mk.id);
            
            if (classEnrolments.length > 0) {
                return classEnrolments.map(enrolment => {
                    enrolment.masterKelas = mappedMk;
                    return {
                        masterKelas: mappedMk,
                        enrolment: enrolment
                    };
                });
            } else {
                return [{
                    masterKelas: mappedMk,
                    enrolment: null
                }];
            }
        });

        res.status(200).json({ status: 'success', data });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data enrolment' });
    }
});

// 2. Dapatkan data master untuk form "Tambah Kelas"
router.get('/master-data', async (req, res) => {
    try {
        const [kelasRaw, angkatan, ta] = await Promise.all([
            prisma.masterKelas.findMany({ where: { sekolahId: req.session.sekolahId }, include: { tingkat: true }, orderBy: [{ tingkatId: 'asc' }, { namaKelas: 'asc' }] }),
            prisma.masterAngkatan.findMany({ where: { sekolahId: req.session.sekolahId }, orderBy: { nomorAngkatan: 'asc' } }),
            prisma.masterTahunAkademik.findMany({ where: { sekolahId: req.session.sekolahId }, orderBy: { tahunAjaran: 'asc' } })
        ]);
        const kelas = kelasRaw.map(k => ({
            ...k,
            namaKelasSuffix: k.namaKelas,
            namaKelas: k.tingkat ? `${k.tingkat.namaTingkat} ${k.namaKelas}` : k.namaKelas
        }));
        res.status(200).json({ status: 'success', data: { kelas, angkatan, ta } });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil master data' });
    }
});

// 3. Aktifkan Kelas (Buka Kelas untuk TA Aktif)
router.post('/activate-kelas', async (req, res) => {
    const { kelasId, sekolahId } = req.body;
    try {
        // Cari Tahun Akademik yang sedang aktif
        const activeTa = await prisma.masterTahunAkademik.findFirst({
            where: { isActive: true, sekolahId: req.session.sekolahId }
        });

        if (!activeTa) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Tidak ada Tahun Akademik yang aktif. Silakan aktifkan minimal 1 Tahun Akademik di Master Data.' 
            });
        }

        const tahunAkademikId = activeTa.id;

        const existingEnrolment = await prisma.enrolmentKelas.findFirst({ 
            where: { kelasId: parseInt(kelasId), tahunAkademikId: tahunAkademikId } 
        });

        if (!existingEnrolment) {
            await prisma.enrolmentKelas.create({
                data: {
                    sekolahId: req.session.sekolahId,
                    kelasId: parseInt(kelasId),
                    tahunAkademikId: tahunAkademikId,
                    keterangan: ''
                }
            });
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengaktifkan kelas' });
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
                masterKelas: { include: { tingkat: true } },
                masterTahunAkademik: true,
                enrolmentSiswa: {
                    where: { isActive: true },
                    include: { siswa: { include: { masterAngkatan: true } } }
                },
                enrolmentGuru: {
                    where: { isActive: true },
                    include: { guru: true }
                }
            }
        });

        if (!enrolment) return res.status(404).json({ status: 'error', message: 'Kelas tidak ditemukan' });

        if (enrolment.masterKelas) {
            enrolment.masterKelas.namaKelasSuffix = enrolment.masterKelas.namaKelas;
            enrolment.masterKelas.namaKelas = enrolment.masterKelas.tingkat ? `${enrolment.masterKelas.tingkat.namaTingkat} ${enrolment.masterKelas.namaKelas}` : enrolment.masterKelas.namaKelas;
        }

        // Ambil semua siswa & guru yang ada di database untuk opsi dropdown "Tambah"
        const [allSiswa, allGuru] = await Promise.all([
            prisma.siswa.findMany({ where: { sekolahId: req.session.sekolahId } }),
            prisma.guru.findMany({ where: { sekolahId: req.session.sekolahId } })
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

        const targetClass = await prisma.enrolmentKelas.findUnique({ where: { id: enrolmentKelasId } });
        if (!targetClass) {
            return res.status(404).json({ status: 'error', message: 'Kelas tidak ditemukan' });
        }

        const existingInTa = await prisma.enrolmentSiswa.findFirst({
            where: {
                siswaId: parseInt(siswaId),
                enrolmentKelas: { tahunAkademikId: targetClass.tahunAkademikId }
            }
        });
        
        if (existingInTa) {
            return res.status(400).json({ status: 'error', message: 'Siswa sudah terdaftar di kelas lain pada tahun ajaran ini' });
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


// Proses Kenaikan Kelas (Bulk Action)
router.post('/:id/proses-kenaikan', async (req, res) => {
    const currentEnrolmentKelasId = parseInt(req.params.id);
    
    try {
        // 1. Ambil data EnrolmentKelas saat ini beserta kelas dan tingkatnya
        const currentEnrolment = await prisma.enrolmentKelas.findUnique({
            where: { id: currentEnrolmentKelasId },
            include: { masterKelas: { include: { tingkat: true } } }
        });

        if (!currentEnrolment) return res.status(404).json({ status: 'error', message: 'Enrolment tidak ditemukan' });

        const activeTa = await prisma.masterTahunAkademik.findFirst({ where: { isActive: true } });

        // Loop data req.body yang berformat { status_1: 'naik', status_2: 'cuti' }
        for (const [key, value] of Object.entries(req.body)) {
            if (key.startsWith('status_') && value) {
                const siswaId = parseInt(key.replace('status_', ''));
                const status = value; // 'naik', 'lulus', 'cuti', 'belum_diproses'
                
                // Cari status string yang tepat untuk disimpan
                let statusString = "Belum Diproses";
                if (status === 'naik') statusString = "Naik Kelas";
                else if (status === 'cuti') statusString = "Tidak Naik / Cuti";
                else if (status === 'lulus') statusString = "Lulus";

                // Update EnrolmentSiswa di kelas saat ini (histori dipertahankan)
                await prisma.enrolmentSiswa.updateMany({
                    where: { 
                        enrolmentKelasId: currentEnrolmentKelasId,
                        siswaId: siswaId 
                    },
                    data: { statusKenaikan: statusString }
                });

                // Jika kelas ini BUKAN di TA yang sedang aktif (berarti Admin memproses kelas historis)
                // Maka kita buatkan/pindahkan record mereka ke TA yang sedang aktif
                if (activeTa && currentEnrolment.tahunAkademikId !== activeTa.id) {
                    // Hapus rekam jejak anak ini di TA aktif (jika ada) untuk menghindari duplikasi
                    // (misal admin berubah pikiran dari Tidak Naik menjadi Naik)
                    await prisma.enrolmentSiswa.deleteMany({
                        where: {
                            siswaId: siswaId,
                            enrolmentKelas: { tahunAkademikId: activeTa.id }
                        }
                    });

                    if (statusString === 'Naik Kelas') {
                        // Cari kelas berikutnya
                        const currentTingkatName = currentEnrolment.masterKelas.tingkat ? currentEnrolment.masterKelas.tingkat.namaTingkat : null;
                        let nextTingkatName = null;
                        if (currentTingkatName === 'X') nextTingkatName = 'XI';
                        else if (currentTingkatName === 'XI') nextTingkatName = 'XII';

                        let nextMasterKelas = null;
                        if (nextTingkatName) {
                            const nextTingkat = await prisma.masterTingkat.findFirst({ where: { namaTingkat: nextTingkatName } });
                            if (nextTingkat) {
                                nextMasterKelas = await prisma.masterKelas.findFirst({
                                    where: { tingkatId: nextTingkat.id, namaKelas: currentEnrolment.masterKelas.namaKelas, sekolahId: currentEnrolment.sekolahId }
                                });
                            }
                        }

                        if (nextMasterKelas) {
                            let targetEnrolment = await prisma.enrolmentKelas.findFirst({
                                where: { kelasId: nextMasterKelas.id, tahunAkademikId: activeTa.id }
                            });
                            if (!targetEnrolment) {
                                targetEnrolment = await prisma.enrolmentKelas.create({
                                    data: {
                                        sekolahId: currentEnrolment.sekolahId,
                                        kelasId: nextMasterKelas.id,
                                        tahunAkademikId: activeTa.id,
                                        keterangan: ''
                                    }
                                });
                            }
                            await prisma.enrolmentSiswa.create({
                                data: { siswaId: siswaId, enrolmentKelasId: targetEnrolment.id, statusKenaikan: 'Belum Diproses', isActive: true }
                            });
                        } else {
                            // Jika tidak ada kelas target (misal dari kelas XII), fallback ke kelas yang sama di TA Baru
                            let sameClassNewTa = await prisma.enrolmentKelas.findFirst({
                                where: { kelasId: currentEnrolment.kelasId, tahunAkademikId: activeTa.id }
                            });
                            if (!sameClassNewTa) {
                                sameClassNewTa = await prisma.enrolmentKelas.create({
                                    data: {
                                        sekolahId: currentEnrolment.sekolahId,
                                        kelasId: currentEnrolment.kelasId,
                                        tahunAkademikId: activeTa.id,
                                        keterangan: ''
                                    }
                                });
                            }
                            await prisma.enrolmentSiswa.create({
                                data: { siswaId: siswaId, enrolmentKelasId: sameClassNewTa.id, statusKenaikan: 'Belum Diproses', isActive: true }
                            });
                        }
                    } else if (statusString === 'Tidak Naik / Cuti') {
                        // Tinggal kelas: Angkatan harus bertambah 1 (bergabung dengan adik kelas)
                        const siswaData = await prisma.siswa.findUnique({ where: { id: siswaId } });
                        if (siswaData && siswaData.angkatanId) {
                            const currentAngkatan = await prisma.masterAngkatan.findUnique({ where: { id: siswaData.angkatanId } });
                            if (currentAngkatan && currentAngkatan.nomorAngkatan) {
                                let num = parseInt(currentAngkatan.nomorAngkatan.replace(/\D/g, '')) || 0;
                                const nextAngkatanStr = currentAngkatan.nomorAngkatan.toLowerCase().includes('angkatan') ? `Angkatan ke-${num + 1}` : (num + 1).toString();
                                let nextAngkatanObj = await prisma.masterAngkatan.findFirst({
                                    where: { sekolahId: currentEnrolment.sekolahId, nomorAngkatan: nextAngkatanStr }
                                });
                                if (!nextAngkatanObj) {
                                    nextAngkatanObj = await prisma.masterAngkatan.create({
                                        data: { sekolahId: currentEnrolment.sekolahId, nomorAngkatan: nextAngkatanStr, isActive: true }
                                    });
                                }
                                await prisma.siswa.update({
                                    where: { id: siswaId },
                                    data: { angkatanId: nextAngkatanObj.id }
                                });
                            }
                        }

                        // Masukkan ke kelas yang sama di TA aktif
                        let targetEnrolmentTinggal = await prisma.enrolmentKelas.findFirst({
                            where: { kelasId: currentEnrolment.kelasId, tahunAkademikId: activeTa.id }
                        });
                        if (!targetEnrolmentTinggal) {
                            targetEnrolmentTinggal = await prisma.enrolmentKelas.create({
                                data: {
                                    sekolahId: currentEnrolment.sekolahId,
                                    kelasId: currentEnrolment.kelasId,
                                    tahunAkademikId: activeTa.id,
                                    keterangan: ''
                                }
                            });
                        }
                        await prisma.enrolmentSiswa.create({
                            data: { siswaId: siswaId, enrolmentKelasId: targetEnrolmentTinggal.id, statusKenaikan: 'Belum Diproses', isActive: true }
                        });
                    }
                    // Jika 'Belum Diproses' atau 'Lulus', tidak ditambahkan ke TA aktif.
                }
            }
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Error proses kenaikan:", error);
        res.status(500).json({ status: 'error', message: 'Gagal memproses kenaikan' });
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

module.exports = router;
