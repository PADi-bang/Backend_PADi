const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const polyStr = 'POLYGON((110.4330 -7.0550, 110.4360 -7.0550, 110.4360 -7.0520, 110.4330 -7.0520, 110.4330 -7.0550))';
  await prisma.$executeRaw`UPDATE sekolah SET area_sekolah = ST_GeomFromText(${polyStr}, 4326) WHERE id_sekolah = 1`;
  const result = await prisma.$queryRaw`SELECT id_sekolah, nama_sekolah, ST_AsGeoJSON(area_sekolah) as polygon_geojson FROM sekolah`;
  console.log(result);
}
main().finally(() => prisma.$disconnect());
