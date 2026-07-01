const cron = require('node-cron');
const { PrismaClient, Prisma } = require('@prisma/client');
const { sendPushNotification } = require('./firebase');
const prisma = new PrismaClient();

async function checkAttendanceDeadlines() {
    try {
        const now = new Date();
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        const nowWIB = new Date(utcTime + (3600000 * 7)); 

        const year = nowWIB.getFullYear();
        const month = String(nowWIB.getMonth() + 1).padStart(2, '0');
        const day = String(nowWIB.getDate()).padStart(2, '0');
        const tanggalWIBString = `${year}-${month}-${day}`;
        const dayOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][nowWIB.getDay()];

        const jamSekarang = nowWIB.getHours();
        const menitSekarang = nowWIB.getMinutes();
        const totalMenitSekarang = (jamSekarang * 60) + menitSekarang;

        // Ambil semua jadwal yang aktif
        const activeJadwals = await prisma.jadwalAbsensi.findMany({
            where: { isActive: true, isLibur: false },
            include: { sekolah: true }
        });

        for (const jadwal of activeJadwals) {
            let berlakuHariIni = false;
            if (jadwal.tanggal && jadwal.tanggal.length > 0) {
                const isTodayInTanggal = jadwal.tanggal.some(d => {
                    const dateObj = new Date(d);
                    return dateObj.getFullYear() === year && 
                           String(dateObj.getMonth() + 1).padStart(2, '0') === month && 
                           String(dateObj.getDate()).padStart(2, '0') === day;
                });
                if (isTodayInTanggal) berlakuHariIni = true;
            } else {
                if (jadwal.hari && jadwal.hari.includes(dayOfWeek)) {
                    berlakuHariIni = true;
                }
            }

            if (!berlakuHariIni) continue;

            const jamMasukFinishDb = new Date(jadwal.jamMasukFinish);
            const jamBatas = jamMasukFinishDb.getUTCHours(); 
            const menitBatas = jamMasukFinishDb.getUTCMinutes();
            const totalMenitBatas = (jamBatas * 60) + menitBatas;

            // Jika kurang 5 menit dari batas masuk
            if (totalMenitSekarang === totalMenitBatas - 5) {
                // Cari siswa yang belum absen dan tidak ada perizinan
                await notifyStudentsWarning(jadwal.sekolahId, tanggalWIBString, "Peringatan Absensi", "Waktu absen kurang 5 menit lagi! Segera lakukan absensi masuk.");
            }

            // Jika sudah terlambat 1 menit
            if (totalMenitSekarang === totalMenitBatas + 1) {
                await notifyStudentsWarning(jadwal.sekolahId, tanggalWIBString, "Terlambat Absensi", "Anda telah melewati batas waktu absen masuk.");
                await notifyTeachersSummary(jadwal.sekolahId, tanggalWIBString);
            }
        }
    } catch (error) {
        console.error("Error in checkAttendanceDeadlines:", error);
    }
}

async function notifyStudentsWarning(sekolahId, tanggalWIBString, title, message) {
    const siswas = await prisma.$queryRaw(Prisma.sql`
        SELECT s.id_siswa, u.id_user, u.fcm_token 
        FROM siswa s
        JOIN "user" u ON s.id_user = u.id_user
        WHERE s.id_sekolah = ${sekolahId}
          AND NOT EXISTS (
              SELECT 1 FROM absensi a 
              WHERE a.id_siswa = s.id_siswa AND a.tanggal = ${tanggalWIBString}::date AND a.jam_masuk IS NOT NULL
          )
          AND NOT EXISTS (
              SELECT 1 FROM perizinan p 
              WHERE p.id_siswa = s.id_siswa AND p.status = 'Disetujui' 
                AND ${tanggalWIBString}::date BETWEEN p.tanggal_mulai AND p.tanggal_selesai
          )
    `);

    for (const siswa of siswas) {
        await prisma.notifikasi.create({
            data: {
                userId: siswa.id_user,
                judul: title,
                tipe: 'Peringatan',
                isiPesan: message,
            }
        });
        if (siswa.fcm_token) {
            await sendPushNotification(siswa.fcm_token, title, message, { type: 'absensi_warning' }).catch(() => {});
        }
    }
}

async function notifyTeachersSummary(sekolahId, tanggalWIBString) {
    // Grouping by kelas
    const enrolments = await prisma.enrolmentKelas.findMany({
        where: { sekolahId: sekolahId },
        include: {
            masterKelas: true,
            enrolmentSiswa: {
                where: { isActive: true },
                include: { siswa: true }
            },
            enrolmentGuru: {
                where: { isActive: true },
                include: { guru: { include: { user: true } } }
            }
        }
    });

    for (const kelas of enrolments) {
        if (kelas.enrolmentGuru.length === 0) continue;
        const guruWali = kelas.enrolmentGuru[0].guru;
        
        let missingStudents = 0;
        for (const enrSiswa of kelas.enrolmentSiswa) {
            const siswaId = enrSiswa.siswa.id;
            const hasAbsen = await prisma.$queryRaw(Prisma.sql`
                SELECT 1 FROM absensi WHERE id_siswa = ${siswaId} AND tanggal = ${tanggalWIBString}::date AND jam_masuk IS NOT NULL
            `);
            const hasIzin = await prisma.$queryRaw(Prisma.sql`
                SELECT 1 FROM perizinan WHERE id_siswa = ${siswaId} AND status = 'Disetujui' AND ${tanggalWIBString}::date BETWEEN tanggal_mulai AND tanggal_selesai
            `);
            if (hasAbsen.length === 0 && hasIzin.length === 0) {
                missingStudents++;
            }
        }

        if (missingStudents > 0) {
            const msg = `Terdapat ${missingStudents} siswa di kelas ${kelas.masterKelas.namaKelas} yang belum absen hari ini.`;
            await prisma.notifikasi.create({
                data: {
                    userId: guruWali.user.id,
                    judul: 'Rekap Kehadiran Pagi',
                    tipe: 'Sistem',
                    isiPesan: msg,
                }
            });
            if (guruWali.user.fcmToken) {
                await sendPushNotification(guruWali.user.fcmToken, 'Rekap Kehadiran Pagi', msg, { type: 'rekap_pagi' }).catch(() => {});
            }
        }
    }
}

async function checkYesterdayAlphas() {
    try {
        const now = new Date();
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        // Kita kurangi 1 hari untuk mengecek kemarin
        const yesterdayWIB = new Date(utcTime + (3600000 * 7) - (86400000));
        
        const year = yesterdayWIB.getFullYear();
        const month = String(yesterdayWIB.getMonth() + 1).padStart(2, '0');
        const day = String(yesterdayWIB.getDate()).padStart(2, '0');
        const tanggalKemarin = `${year}-${month}-${day}`;

        // Cari semua absensi yang statusnya Alpha kemarin
        const alphas = await prisma.$queryRaw(Prisma.sql`
            SELECT a.id_siswa, s.nama_lengkap, u.id_user, u.fcm_token, k.nama_kelas, g.id_user as guru_user_id, g.fcm_token as guru_fcm
            FROM absensi a
            JOIN siswa s ON a.id_siswa = s.id_siswa
            JOIN "user" u ON s.id_user = u.id_user
            JOIN enrolment_siswa es ON es.id_siswa = s.id_siswa AND es.is_active = true
            JOIN enrolment_kelas ek ON es.id_enrolment_kelas = ek.id_enrolment_kelas
            JOIN master_kelas k ON ek.id_kelas = k.id_kelas
            LEFT JOIN enrolment_guru eg ON eg.id_enrolment_kelas = ek.id_enrolment_kelas AND eg.is_active = true
            LEFT JOIN guru gr ON eg.id_guru = gr.id_guru
            LEFT JOIN "user" g ON gr.id_user = g.id_user
            WHERE a.tanggal = ${tanggalKemarin}::date AND a.status = 'Alpha'
        `);

        // Kelompokkan alpha per kelas untuk guru
        const teacherAlphaMap = {};

        for (const alpha of alphas) {
            const title = "Alpha Kemarin";
            const msg = "Anda tercatat Alpha kemarin. Harap segera mengajukan surat izin dengan alasan yang valid.";
            
            await prisma.notifikasi.create({
                data: {
                    userId: alpha.id_user,
                    judul: title,
                    tipe: 'Peringatan',
                    isiPesan: msg,
                }
            });
            if (alpha.fcm_token) {
                await sendPushNotification(alpha.fcm_token, title, msg, { type: 'alpha_warning' }).catch(() => {});
            }

            if (alpha.guru_user_id) {
                if (!teacherAlphaMap[alpha.guru_user_id]) {
                    teacherAlphaMap[alpha.guru_user_id] = { fcm: alpha.guru_fcm, list: [] };
                }
                teacherAlphaMap[alpha.guru_user_id].list.push(alpha.nama_lengkap);
            }
        }

        // Kirim ke guru
        for (const [guruUserId, data] of Object.entries(teacherAlphaMap)) {
            const count = data.list.length;
            const msg = `Terdapat ${count} siswa yang Alpha kemarin dan belum mengajukan izin.`;
            await prisma.notifikasi.create({
                data: {
                    userId: parseInt(guruUserId),
                    judul: 'Rekap Alpha Kemarin',
                    tipe: 'Sistem',
                    isiPesan: msg,
                }
            });
            if (data.fcm) {
                await sendPushNotification(data.fcm, 'Rekap Alpha Kemarin', msg, { type: 'alpha_summary' }).catch(() => {});
            }
        }

    } catch (error) {
        console.error("Error in checkYesterdayAlphas:", error);
    }
}

function initCronNotifications() {
    // Run every minute for checking deadlines
    cron.schedule('* * * * *', () => {
        checkAttendanceDeadlines();
    });

    // Run every day at 07:00 AM WIB to check yesterday's Alphas
    // Karena server di UTC, 07:00 AM WIB = 00:00 AM UTC
    cron.schedule('0 0 * * *', () => {
        checkYesterdayAlphas();
    });
    
    console.log('[Cron] Notifikasi (Deadline Absen & Alpha) telah dijadwalkan.');
}

module.exports = {
    initCronNotifications
};
