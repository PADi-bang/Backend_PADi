const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    let jadwal3 = await prisma.jadwalAbsensi.findFirst({
        where: { sekolahId: 1, isLibur: false, hari: { contains: 'Jumat' }, tanggal: { equals: [] } }
    });
    console.log("Jadwal equals []:", jadwal3);
}
main().finally(() => prisma.$disconnect());
