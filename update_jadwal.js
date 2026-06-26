const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.jadwalAbsensi.update({where: {id: 1}, data: {isActive: true}}).then(console.log).finally(() => prisma.$disconnect());
