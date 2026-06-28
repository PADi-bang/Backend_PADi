const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.$queryRaw`SELECT id_sekolah, nama_sekolah, ST_AsGeoJSON(area_sekolah) as polygon_geojson FROM sekolah`;
  console.log(result);
}
main().finally(() => prisma.$disconnect());
