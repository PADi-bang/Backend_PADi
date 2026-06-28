const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const izinId = 30; // ID from screenshot
    const izin = await prisma.perizinan.findUnique({
        where: { id: izinId },
        include: { siswa: true }
    });
    
    if (izin) {
        const startDate = new Date(izin.tanggalMulai);
        const endDate = new Date(izin.tanggalSelesai);
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const current = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            const dayOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][current.getUTCDay()];
            
            let jadwal = await prisma.jadwalAbsensi.findFirst({
                where: {
                    sekolahId: izin.siswa.sekolahId,
                    hari: { contains: dayOfWeek },
                    isActive: true,
                    isLibur: false
                }
            });
            
            if (jadwal) {
                const existingAbsen = await prisma.absensi.findFirst({
                    where: {
                        siswaId: izin.siswa.id,
                        tanggal: current
                    }
                });
                
                if (!existingAbsen) {
                    await prisma.absensi.create({
                        data: {
                            siswaId: izin.siswa.id,
                            jadwalId: jadwal.id,
                            tanggal: current,
                            status: izin.jenisIzin === 'Sakit' ? 'Sakit' : 'Izin',
                            keterangan: izin.alasan
                        }
                    });
                    console.log("Created absensi for", current);
                } else {
                    console.log("Absensi exists for", current);
                }
            } else {
                console.log("No active jadwal found for", dayOfWeek);
            }
        }
    }
}

main().finally(() => prisma.$disconnect());
