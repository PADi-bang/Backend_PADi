// backend/src/config/db.js
const { PrismaClient } = require('@prisma/client');

// Memastikan PrismaClient dipanggil dengan benar
const prisma = new PrismaClient();

module.exports = prisma;