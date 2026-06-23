const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const xlsx = require('xlsx');
const os = require('os');
const fs = require('fs');

const prisma = new PrismaClient();
const upload = multer({ dest: os.tmpdir() });

// ==========================================
// 1. KELOLA DATA SISWA
// ==========================================

// [DIPERBAIKI] GET: Render halaman EJS dan kirim data dari Prisma
router.get('/siswa', async (req, res) => {
    const { search } = req.query;
    try {
        let whereClause = { roleId: 3 }; 
        if (search) {
            whereClause = {
                ...whereClause,
                OR: [
                    { username: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { siswa: { namaLengkap: { contains: search, mode: 'insensitive' } } },
                    { siswa: { nis: { contains: search, mode: 'insensitive' } } }
                ]
            };
        }
        const siswas = await prisma.user.findMany({
            where: whereClause,
            include: {
                siswa: {
                    include: {
                        sekolah: true,
                        masterAngkatan: true,
                        enrolmentSiswa: {
                            where: { isActive: true },
                            include: {
                                enrolmentKelas: {
                                    include: {
                                        masterKelas: {
                                            include: { tingkat: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { id: 'desc' }
        });
        
        // Render file views/admin/daftar_siswa.ejs dan kirim variabel 'siswas'
        res.render('admin/daftar_siswa', { 
            title: 'Daftar Siswa',
            dataSiswa: siswas, // Gunakan variabel ini di dalam file EJS untuk looping
            searchQuery: search || '' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Gagal memuat halaman daftar siswa');
    }
});

router.post('/siswa', async (req, res) => {
    const { username, email, password, namaLengkap, nis, angkatanId, sekolahId } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                username, email, password: hashedPassword, roleId: 3,
                siswa: { create: { namaLengkap, nis, sekolahId: parseInt(sekolahId) || 1, angkatanId: parseInt(angkatanId) || null } }
            }
        });
        res.status(201).json({ status: 'success', data: newUser });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal membuat akun siswa' });
    }
});

router.put('/siswa/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, email, password, namaLengkap, nis, angkatanId } = req.body;
    try {
        let updateData = { username, email };
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }
        await prisma.user.update({
            where: { id: userId },
            data: {
                ...updateData,
                siswa: { update: { namaLengkap, nis, angkatanId: parseInt(angkatanId) || null } }
            }
        });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal update data siswa' });
    }
});

router.delete('/siswa/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const siswa = await prisma.siswa.findUnique({ where: { userId } });
        if (siswa) {
            await prisma.absensi.deleteMany({ where: { siswaId: siswa.id } });
            await prisma.perizinan.deleteMany({ where: { siswaId: siswa.id } });
            await prisma.enrolmentSiswa.deleteMany({ where: { siswaId: siswa.id } });
            await prisma.siswa.delete({ where: { userId } });
        }
        await prisma.notifikasi.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menghapus siswa' });
    }
});

// ==========================================
// 2. KELOLA DATA GURU
// ==========================================

// [DIPERBAIKI] GET: Render halaman EJS dan kirim data dari Prisma
router.get('/guru', async (req, res) => {
    const { search } = req.query;
    try {
        let whereClause = { roleId: 2 }; 
        if (search) {
            whereClause = {
                ...whereClause,
                OR: [
                    { username: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { guru: { namaLengkap: { contains: search, mode: 'insensitive' } } },
                    { guru: { nip: { contains: search, mode: 'insensitive' } } }
                ]
            };
        }
        const gurus = await prisma.user.findMany({
            where: whereClause,
            include: { 
                guru: { 
                    include: { 
                        sekolah: true,
                        enrolmentGuru: {
                            where: { isActive: true },
                            include: {
                                enrolmentKelas: {
                                    include: { masterKelas: true }
                                }
                            }
                        }
                    } 
                } 
            },
            orderBy: { id: 'desc' }
        });
        
        // Render file views/admin/daftar_guru.ejs
        res.render('admin/daftar_guru', { 
            title: 'Daftar Guru',
            dataGuru: gurus, // Gunakan variabel ini di dalam file EJS untuk looping
            searchQuery: search || ''
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Gagal memuat halaman daftar guru');
    }
});

router.post('/guru', async (req, res) => {
    const { username, email, password, namaLengkap, nip, sekolahId } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                username, email, password: hashedPassword, roleId: 2,
                guru: { create: { namaLengkap, nip, sekolahId: parseInt(sekolahId) || 1 } }
            }
        });
        res.status(201).json({ status: 'success', data: newUser });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal membuat akun guru' });
    }
});

router.put('/guru/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, email, password, namaLengkap, nip } = req.body;
    try {
        let updateData = { username, email };
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }
        await prisma.user.update({
            where: { id: userId },
            data: {
                ...updateData,
                guru: { update: { namaLengkap, nip } }
            }
        });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal update data guru' });
    }
});

router.post('/guru/:id/kelas', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { enrolmentKelasIds } = req.body;
    
    try {
        const guru = await prisma.guru.findUnique({ where: { userId } });
        if (!guru) return res.status(404).json({ status: 'error', message: 'Guru tidak ditemukan' });

        await prisma.enrolmentGuru.deleteMany({
            where: { guruId: guru.id }
        });

        if (enrolmentKelasIds) {
            let ids = Array.isArray(enrolmentKelasIds) ? enrolmentKelasIds : [enrolmentKelasIds];
            for (let classId of ids) {
                const enrolmentKelasId = parseInt(classId);
                await prisma.enrolmentGuru.deleteMany({
                    where: { enrolmentKelasId }
                });

                await prisma.enrolmentGuru.create({
                    data: {
                        enrolmentKelasId,
                        guruId: guru.id,
                        isActive: true
                    }
                });
            }
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error("Gagal atur kelas:", error);
        res.status(500).json({ status: 'error', message: 'Gagal mengatur kelas guru' });
    }
});

router.delete('/guru/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const guru = await prisma.guru.findUnique({ where: { userId } });
        if (guru) {
            await prisma.perizinan.updateMany({ where: { disetujuiOlehId: guru.id }, data: { disetujuiOlehId: null } });
            await prisma.enrolmentGuru.deleteMany({ where: { guruId: guru.id } });
            await prisma.guru.delete({ where: { userId } });
        }
        await prisma.notifikasi.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal menghapus guru' });
    }
});

// ==========================================
// 3. IMPORT SISWA DARI CSV/EXCEL
// ==========================================
router.post('/siswa/upload', upload.single('file'), async (req, res) => {
    // ... (Logika upload tetap sama, tidak ada yang perlu diubah karena ini memproses form submission)
    if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'Tidak ada file yang diunggah' });
    }

    const filePath = req.file.path;
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length < 2) {
            return res.status(400).json({ status: 'error', message: 'File kosong atau tidak memiliki baris data' });
        }

        const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
        
        const nameIdx = headers.findIndex(h => h.includes('nama') || h.includes('name'));
        const nisIdx = headers.findIndex(h => h.includes('nis'));
        const angkatanIdx = headers.findIndex(h => h.includes('angkatan') || h.includes('generation') || h.includes('tahun masuk'));
        const kelasIdx = headers.findIndex(h => h.includes('kelas') || h.includes('class'));
        const emailIdx = headers.findIndex(h => h.includes('email'));
        const passwordIdx = headers.findIndex(h => h.includes('pass') || h.includes('sandi'));

        const getIdx = (headerIdx, defaultIdx) => headerIdx !== -1 ? headerIdx : defaultIdx;
        const finalNameIdx = getIdx(nameIdx, 0);
        const finalNisIdx = getIdx(nisIdx, 1);
        const finalAngkatanIdx = getIdx(angkatanIdx, 2);
        const finalKelasIdx = getIdx(kelasIdx, 3);
        const finalEmailIdx = getIdx(emailIdx, 4);
        const finalPasswordIdx = getIdx(passwordIdx, 5);

        const activeTa = await prisma.masterTahunAkademik.findFirst({
            where: { isActive: true }
        });
        if (!activeTa) {
            return res.status(400).json({ status: 'error', message: 'Tahun Akademik aktif tidak ditemukan. Silakan atur terlebih dahulu.' });
        }

        const tingkats = await prisma.masterTingkat.findMany();
        const tingkatMap = {};
        tingkats.forEach(t => {
            tingkatMap[t.namaTingkat] = t.id;
        });

        let successCount = 0;
        const errors = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0 || !row[finalNameIdx]) continue; 

            const nama = String(row[finalNameIdx] || '').trim();
            const nis = String(row[finalNisIdx] || '').trim();
            const angkatanInput = String(row[finalAngkatanIdx] || '').trim();
            const kelasInput = String(row[finalKelasIdx] || '').trim();
            const email = String(row[finalEmailIdx] || '').trim();
            const passwordRaw = String(row[finalPasswordIdx] || '').trim();

            if (!nama || !nis || !email || !passwordRaw) {
                errors.push(`Baris ${i + 1}: Nama, NIS, Email, dan Password wajib diisi.`);
                continue;
            }

            try {
                const existingUser = await prisma.user.findFirst({
                    where: { OR: [ { email: { equals: email, mode: 'insensitive' } }, { username: { equals: email.split('@')[0], mode: 'insensitive' } } ] }
                });
                if (existingUser) {
                    errors.push(`Baris ${i + 1}: Email atau username '${email}' sudah digunakan.`);
                    continue;
                }

                const existingSiswa = await prisma.siswa.findUnique({
                    where: { nis }
                });
                if (existingSiswa) {
                    errors.push(`Baris ${i + 1}: NIS '${nis}' sudah terdaftar.`);
                    continue;
                }

                let angkatanId = null;
                if (angkatanInput) {
                    let angkatan = await prisma.masterAngkatan.findFirst({
                        where: { nomorAngkatan: { equals: angkatanInput, mode: 'insensitive' } }
                    });
                    if (!angkatan) {
                        angkatan = await prisma.masterAngkatan.create({
                            data: { nomorAngkatan: angkatanInput, sekolahId: 1, isActive: true }
                        });
                    }
                    angkatanId = angkatan.id;
                }

                let enrolmentKelasId = null;
                if (kelasInput) {
                    const parts = kelasInput.split(' ');
                    const prefix = parts[0].toUpperCase();
                    let tingkatId = null;
                    let suffix = kelasInput;

                    if (tingkatMap[prefix]) {
                        tingkatId = tingkatMap[prefix];
                        suffix = parts.slice(1).join(' ').trim();
                    } else {
                        tingkatId = tingkatMap['X'] || (tingkats[0] ? tingkats[0].id : null);
                    }

                    let masterKelas = await prisma.masterKelas.findFirst({
                        where: { 
                            namaKelas: { equals: suffix, mode: 'insensitive' },
                            tingkatId: tingkatId,
                            sekolahId: 1
                        }
                    });
                    if (!masterKelas) {
                        masterKelas = await prisma.masterKelas.create({
                            data: { namaKelas: suffix, tingkatId, sekolahId: 1 }
                        });
                    }

                    let enrolmentKelas = await prisma.enrolmentKelas.findFirst({
                        where: { kelasId: masterKelas.id, tahunAkademikId: activeTa.id }
                    });
                    if (!enrolmentKelas) {
                        enrolmentKelas = await prisma.enrolmentKelas.create({
                            data: { kelasId: masterKelas.id, tahunAkademikId: activeTa.id, sekolahId: 1 }
                        });
                    }
                    enrolmentKelasId = enrolmentKelas.id;
                }

                const hashedPassword = await bcrypt.hash(passwordRaw, 10);
                const username = email.split('@')[0];

                await prisma.$transaction(async (tx) => {
                    const u = await tx.user.create({
                        data: {
                            username, email, password: hashedPassword, roleId: 3,
                            siswa: {
                                create: { namaLengkap: nama, nis, sekolahId: 1, angkatanId }
                            }
                        },
                        include: { siswa: true }
                    });

                    if (enrolmentKelasId) {
                        await tx.enrolmentSiswa.create({
                            data: { siswaId: u.siswa.id, enrolmentKelasId, isActive: true }
                        });
                    }
                });

                successCount++;
            } catch (err) {
                console.error(`Error processing row ${i + 1}:`, err);
                errors.push(`Baris ${i + 1}: Terjadi kesalahan: ${err.message}`);
            }
        }

        res.status(200).json({
            status: 'success',
            message: `Berhasil mengimpor ${successCount} siswa.`,
            successCount,
            errorCount: errors.length,
            errors
        });

    } catch (err) {
        console.error("Gagal mengimpor file:", err);
        res.status(500).json({ status: 'error', message: 'Gagal mengimpor file siswa: ' + err.message });
    } finally {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
});

module.exports = router;