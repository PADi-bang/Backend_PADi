const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkToday() {
  const nowWIBString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
  const nowWIB = new Date(nowWIBString);

  const year = nowWIB.getFullYear();
  const month = String(nowWIB.getMonth() + 1).padStart(2, '0');
  const day = String(nowWIB.getDate()).padStart(2, '0');
  
  const todayStartWIB = new Date(`${year}-${month}-${day}T00:00:00+07:00`);
  const tomorrowStartWIB = new Date(todayStartWIB);
  tomorrowStartWIB.setDate(tomorrowStartWIB.getDate() + 1);

  console.log("todayStartWIB:", todayStartWIB.toISOString());
  console.log("tomorrowStartWIB:", tomorrowStartWIB.toISOString());

  const absensi = await prisma.absensi.findMany({
    where: {
      tanggal: { gte: todayStartWIB, lt: tomorrowStartWIB }
    }
  });
  console.log("Absensi Hari Ini:", absensi);

  const izin = await prisma.perizinan.findMany({
    where: {
      status: 'Disetujui',
      tanggalMulai: { lt: tomorrowStartWIB },
      tanggalSelesai: { gte: todayStartWIB }
    }
  });
  console.log("Izin Hari Ini:", izin);
}

checkToday().finally(() => prisma.$disconnect());
