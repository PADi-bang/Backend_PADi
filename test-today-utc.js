const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkToday() {
  const nowWIBString = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
  const nowWIB = new Date(nowWIBString);

  const year = nowWIB.getFullYear();
  const month = nowWIB.getMonth();
  const day = nowWIB.getDate();
  
  // Buat UTC Date yang sama dengan tanggal WIB
  const todayStartUTC = new Date(Date.UTC(year, month, day));
  const tomorrowStartUTC = new Date(Date.UTC(year, month, day + 1));

  console.log("todayStartUTC:", todayStartUTC.toISOString());
  console.log("tomorrowStartUTC:", tomorrowStartUTC.toISOString());

  const absensi = await prisma.absensi.findMany({
    where: {
      tanggal: { gte: todayStartUTC, lt: tomorrowStartUTC }
    }
  });
  console.log("Absensi Hari Ini:", absensi);

  const izin = await prisma.perizinan.findMany({
    where: {
      status: 'Disetujui',
      tanggalMulai: { lt: tomorrowStartUTC },
      tanggalSelesai: { gte: todayStartUTC }
    }
  });
  console.log("Izin Hari Ini:", izin);
}

checkToday().finally(() => prisma.$disconnect());
