const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Fungsi helper untuk mendapatkan semester aktif saat ini
async function getSemesterAktif() {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Default dates: Ganjil starts July 15, Genap starts January 10
    let tglGanjil = "07-15";
    let tglGenap = "01-10";
    
    try {
        const config = await prisma.pengaturan.findMany();
        config.forEach(c => {
            if(c.kunci === 'tanggal_mulai_ganjil') tglGanjil = c.nilai;
            if(c.kunci === 'tanggal_mulai_genap') tglGenap = c.nilai;
        });
    } catch(e) {}

    const [bulanGanjil, hariGanjil] = tglGanjil.split('-').map(Number);
    const [bulanGenap, hariGenap] = tglGenap.split('-').map(Number);

    const dateGanjil = new Date(currentYear, bulanGanjil - 1, hariGanjil);
    const dateGenap = new Date(currentYear, bulanGenap - 1, hariGenap);

    // Determine which date comes first in the calendar year
    if (dateGanjil < dateGenap) {
        // e.g., Ganjil starts Jan 15, Genap starts Jul 15
        if (now >= dateGanjil && now < dateGenap) return 'Ganjil';
        return 'Genap';
    } else {
        // e.g., Ganjil starts Jul 15, Genap starts Jan 10 (Indonesian standard)
        if (now >= dateGenap && now < dateGanjil) return 'Genap';
        return 'Ganjil';
    }
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
    const { tanggalGanjil, bulanGanjil, tanggalGenap, bulanGenap } = req.body;
    try {
        const formatTgl = (b, t) => `${String(b).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
        
        const ganjilFormatted = formatTgl(bulanGanjil, tanggalGanjil);
        const genapFormatted = formatTgl(bulanGenap, tanggalGenap);
        
        if (ganjilFormatted === genapFormatted) {
            return res.status(400).json({ status: 'error', message: 'Tanggal_tidak_boleh_sama' });
        }

        const settings = [
            { kunci: 'tanggal_mulai_ganjil', nilai: ganjilFormatted },
            { kunci: 'tanggal_mulai_genap', nilai: genapFormatted }
        ];

        for (const s of settings) {
            if (s.nilai && !s.nilai.includes('undefined')) {
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
        const kelasRaw = await prisma.masterKelas.findMany({
            where: { sekolahId: req.session.sekolahId },
            include: { sekolah: true, tingkat: true },
            orderBy: [{ tingkatId: 'asc' }, { namaKelas: 'asc' }]
        });
        
        // Map data to include combined namaKelas so frontend remains compatible
        const kelas = kelasRaw.map(k => ({
            ...k,
            namaKelasSuffix: k.namaKelas,
            namaKelas: k.tingkat ? `${k.tingkat.namaTingkat} ${k.namaKelas}` : k.namaKelas
        }));

        res.status(200).json({ status: 'success', data: kelas });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data master kelas' });
    }
});

router.post('/kelas', async (req, res) => {
    const { namaKelasAkhiran, sekolahId } = req.body;
    try {
        const suffix = namaKelasAkhiran.trim().toUpperCase();
        
        // Fetch all Tingkats (X, XI, XII)
        const tingkats = await prisma.masterTingkat.findMany({ orderBy: { id: 'asc' } });
        if (tingkats.length === 0) {
             return res.status(400).json({ status: 'error', message: 'Master Tingkat kosong' });
        }

        // Cek duplikasi
        const existing = await prisma.masterKelas.findFirst({
            where: { namaKelas: { equals: suffix, mode: 'insensitive' }, sekolahId: req.session.sekolahId }
        });
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Nama kelas sudah ada' });
        }

        const createdClasses = [];
        for (const t of tingkats) {
            const newKelas = await prisma.masterKelas.create({
                data: { 
                    namaKelas: suffix, 
                    tingkatId: t.id,
                    sekolahId: req.session.sekolahId 
                }
            });
            createdClasses.push(newKelas);

            // Auto-enrolment jika tingkat sudah diatur
            const existingEnrolmentInSameTingkat = await prisma.enrolmentKelas.findFirst({
                where: { masterKelas: { tingkatId: t.id } }
            });

            if (existingEnrolmentInSameTingkat) {
                await prisma.enrolmentKelas.create({
                    data: {
                        sekolahId: req.session.sekolahId,
                        kelasId: newKelas.id,
                        tahunAkademikId: existingEnrolmentInSameTingkat.tahunAkademikId,
                        keterangan: ''
                    }
                });
            }
        }

        res.status(201).json({ status: 'success', data: createdClasses });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menambah master kelas' });
    }
});

router.delete('/kelas/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        // Find enrolments related to this class to cascade delete
        const enrolments = await prisma.enrolmentKelas.findMany({ where: { kelasId: id } });
        for (const e of enrolments) {
            await prisma.enrolmentSiswa.deleteMany({ where: { enrolmentKelasId: e.id } });
            await prisma.enrolmentGuru.deleteMany({ where: { enrolmentKelasId: e.id } });
        }
        await prisma.enrolmentKelas.deleteMany({ where: { kelasId: id } });

        // Prisma handles implicit many-to-many (jadwalAbsensi) automatically
        await prisma.masterKelas.delete({ where: { id } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Gagal hapus kelas:", error);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus master kelas' });
    }
});

router.delete('/kelas/group/:suffix', async (req, res) => {
    const suffix = req.params.suffix;
    try {
        // Find all classes matching the suffix
        const classes = await prisma.masterKelas.findMany({
            where: { namaKelas: { equals: suffix, mode: 'insensitive' } }
        });

        if (classes.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Kelas tidak ditemukan' });
        }

        // Extract class IDs
        const classIds = classes.map(c => c.id);

        // Find enrolments related to these classes to cascade delete
        const enrolments = await prisma.enrolmentKelas.findMany({ where: { kelasId: { in: classIds } } });
        for (const e of enrolments) {
            await prisma.enrolmentSiswa.deleteMany({ where: { enrolmentKelasId: e.id } });
            await prisma.enrolmentGuru.deleteMany({ where: { enrolmentKelasId: e.id } });
        }
        await prisma.enrolmentKelas.deleteMany({ where: { kelasId: { in: classIds } } });

        // Prisma handles implicit many-to-many (jadwalAbsensi) automatically
        await prisma.masterKelas.deleteMany({ where: { id: { in: classIds } } });
        
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Gagal hapus group kelas:", error);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus group master kelas' });
    }
});

// ==========================================
// 2. MASTER ANGKATAN
// ==========================================
router.get('/angkatan', async (req, res) => {
    try {
        const angkatan = await prisma.masterAngkatan.findMany({
            where: { sekolahId: req.session.sekolahId },
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
            where: { nomorAngkatan: { equals: nomorAngkatan, mode: 'insensitive' }, sekolahId: req.session.sekolahId }
        });
        if (existing) {
            return res.status(400).json({ status: 'error', message: 'Angkatan sudah ada' });
        }

        // Cek jumlah yang aktif
        const activeCount = await prisma.masterAngkatan.count({ where: { isActive: true, sekolahId: req.session.sekolahId } });
        const newIsActive = activeCount < 4;

        const newAngkatan = await prisma.masterAngkatan.create({
            data: { 
                nomorAngkatan, 
                sekolahId: req.session.sekolahId,
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
        // Set angkatanId to null for any Siswa using this Angkatan
        await prisma.siswa.updateMany({
            where: { angkatanId: id },
            data: { angkatanId: null }
        });

        await prisma.masterAngkatan.delete({ where: { id } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Gagal hapus angkatan:", error);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus master angkatan' });
    }
});

// ==========================================
// 3. MASTER TAHUN AKADEMIK
// ==========================================
router.get('/tahun-akademik', async (req, res) => {
    try {
        const tahunAkademik = await prisma.masterTahunAkademik.findMany({
            where: { sekolahId: req.session.sekolahId },
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
            where: { tahunAjaran: { equals: tahunAjaran, mode: 'insensitive' }, sekolahId: req.session.sekolahId }
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
                where: { sekolahId: req.session.sekolahId },
                data: { isActive: false }
            });
        }

        const newTa = await prisma.masterTahunAkademik.create({
            data: { 
                tahunAjaran, 
                semester: semesterAktif, 
                isActive: newIsActive,
                sekolahId: req.session.sekolahId 
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
            let prevActiveTa = null;

            if (newIsActive) {
                // Cari TA yang sedang aktif sebelum diubah
                prevActiveTa = await prisma.masterTahunAkademik.findFirst({
                    where: { sekolahId: ta.sekolahId, isActive: true, id: { not: id } }
                });

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

            // Migrasi Enrolment ke TA Baru
            if (newIsActive && prevActiveTa) {
                // 1. Dapatkan semua kelas yang punya siswa atau guru aktif HANYA DARI TA SEBELUMNYA (bukan semua histori)
                const oldEnrolments = await prisma.enrolmentKelas.findMany({
                    where: { sekolahId: ta.sekolahId, tahunAkademikId: prevActiveTa.id },
                    include: {
                        enrolmentSiswa: { where: { isActive: true } },
                        enrolmentGuru: { where: { isActive: true } },
                        masterKelas: { include: { tingkat: true } }
                    }
                });

                for (const oldClass of oldEnrolments) {
                    if (oldClass.enrolmentSiswa.length === 0 && oldClass.enrolmentGuru.length === 0) continue;

                    // Jangan membuat sameClassNewTa secara unconditional karena akan menghasilkan kelas zombie (kosong).
                    // Guru Wali Kelas tidak dimigrasi otomatis karena penugasan biasanya berubah tiap tahun akademik.
                    // Jika memang ada siswa yang tinggal kelas, kelas untuk mereka akan dibuatkan secara lazy.

                    // Pindahkan Siswa (Create record baru di TA Baru)
                    for (const es of oldClass.enrolmentSiswa) {
                        if (es.statusKenaikan === 'Lulus' || es.statusKenaikan === 'Belum Diproses' || !es.statusKenaikan) {
                            // Lulus: Lulus dan selesai.
                            // Belum Diproses: Tertinggal di TA lama sampai diproses manual.
                            continue;
                        }

                        // Cek apakah siswa ini sudah termigrasi/ada di TA yang baru
                        // (Mencegah duplikasi jika Admin bolak-balik mengaktifkan TA)
                        const existingInNewTa = await prisma.enrolmentSiswa.findFirst({
                            where: {
                                siswaId: es.siswaId,
                                enrolmentKelas: { tahunAkademikId: id }
                            }
                        });
                        if (existingInNewTa) continue;

                        if (es.statusKenaikan === 'Tidak Naik / Cuti') {
                            // Tinggal kelas: Siswa dimasukkan ke kelas yang SAMA, hanya TA nya yang baru.
                            // Angkatan milik Siswa tetap sama (tidak berubah).
                            
                            // Cari/Buat kelas target (Kelas Sama)
                            let targetEnrolmentTinggal = await prisma.enrolmentKelas.findFirst({
                                where: { kelasId: oldClass.kelasId, tahunAkademikId: id }
                            });
                            if (!targetEnrolmentTinggal) {
                                targetEnrolmentTinggal = await prisma.enrolmentKelas.create({
                                    data: {
                                        sekolahId: ta.sekolahId,
                                        kelasId: oldClass.kelasId,
                                        tahunAkademikId: id,
                                        keterangan: ''
                                    }
                                });
                            }

                            // Create record baru
                            await prisma.enrolmentSiswa.create({
                                data: {
                                    siswaId: es.siswaId,
                                    enrolmentKelasId: targetEnrolmentTinggal.id,
                                    statusKenaikan: 'Belum Diproses',
                                    isActive: true
                                }
                            });
                        } else if (es.statusKenaikan === 'Naik Kelas') {
                            // Naik kelas: Cari kelas berikutnya
                            const currentTingkatName = oldClass.masterKelas.tingkat ? oldClass.masterKelas.tingkat.namaTingkat : null;
                            let nextTingkatName = null;
                            if (currentTingkatName === 'X') nextTingkatName = 'XI';
                            else if (currentTingkatName === 'XI') nextTingkatName = 'XII';

                            let nextMasterKelas = null;
                            if (nextTingkatName) {
                                const nextTingkat = await prisma.masterTingkat.findFirst({
                                    where: { namaTingkat: nextTingkatName }
                                });
                                if (nextTingkat) {
                                    nextMasterKelas = await prisma.masterKelas.findFirst({
                                        where: {
                                            tingkatId: nextTingkat.id,
                                            namaKelas: oldClass.masterKelas.namaKelas,
                                            sekolahId: ta.sekolahId
                                        }
                                    });
                                }
                            }

                            if (nextMasterKelas) {
                                let targetEnrolment = await prisma.enrolmentKelas.findFirst({
                                    where: { kelasId: nextMasterKelas.id, tahunAkademikId: id }
                                });
                                if (!targetEnrolment) {
                                    targetEnrolment = await prisma.enrolmentKelas.create({
                                        data: {
                                            sekolahId: ta.sekolahId,
                                            kelasId: nextMasterKelas.id,
                                            tahunAkademikId: id,
                                            keterangan: ''
                                        }
                                    });
                                }
                                await prisma.enrolmentSiswa.create({
                                    data: {
                                        siswaId: es.siswaId,
                                        enrolmentKelasId: targetEnrolment.id,
                                        statusKenaikan: 'Belum Diproses',
                                        isActive: true
                                    }
                                });
                            } else {
                                // Jika kelas target tidak ada (misal dari kelas XII), letakkan di kelas yang sama di TA baru
                                let fallbackEnrolment = await prisma.enrolmentKelas.findFirst({
                                    where: { kelasId: oldClass.kelasId, tahunAkademikId: id }
                                });
                                if (!fallbackEnrolment) {
                                    fallbackEnrolment = await prisma.enrolmentKelas.create({
                                        data: {
                                            sekolahId: ta.sekolahId,
                                            kelasId: oldClass.kelasId,
                                            tahunAkademikId: id,
                                            keterangan: ''
                                        }
                                    });
                                }

                                await prisma.enrolmentSiswa.create({
                                    data: {
                                        siswaId: es.siswaId,
                                        enrolmentKelasId: fallbackEnrolment.id,
                                        statusKenaikan: 'Belum Diproses',
                                        isActive: true
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Gagal toggle TA:", error);
        res.status(500).json({ status: 'error', message: 'Gagal mengaktifkan tahun akademik' });
    }
});

router.delete('/tahun-akademik/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        // Find enrolments related to this TA to cascade delete
        const enrolments = await prisma.enrolmentKelas.findMany({ where: { tahunAkademikId: id } });
        for (const e of enrolments) {
            await prisma.enrolmentSiswa.deleteMany({ where: { enrolmentKelasId: e.id } });
            await prisma.enrolmentGuru.deleteMany({ where: { enrolmentKelasId: e.id } });
        }
        await prisma.enrolmentKelas.deleteMany({ where: { tahunAkademikId: id } });

        await prisma.masterTahunAkademik.delete({ where: { id } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Gagal hapus TA:", error);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus master tahun akademik' });
    }
});

module.exports = router;
