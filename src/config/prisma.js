// d:\college\TI-2C\sem 4\App_PADi\backend\src\config\prisma.js

const { PrismaClient } = require('@prisma/client');

// Inisialisasi Prisma Client sebagai singleton
const prisma = new PrismaClient();

module.exports = prisma;