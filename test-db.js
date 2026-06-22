const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAbsensi() {
  const absensi = await prisma.absensi.findMany({
    orderBy: { tanggal: 'desc' },
    take: 10,
    include: { siswa: true }
  });
  console.log("Absensi records:", JSON.stringify(absensi, null, 2));

  const perizinan = await prisma.perizinan.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("Perizinan records:", JSON.stringify(perizinan, null, 2));
}

checkAbsensi().finally(() => prisma.$disconnect());
