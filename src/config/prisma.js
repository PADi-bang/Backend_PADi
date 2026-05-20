const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

// 1. Buat koneksi pool ke database PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// 2. Bungkus dengan Prisma Adapter
const adapter = new PrismaPg(pool);

// 3. Inisialisasi Prisma Client dengan menyertakan adapternya!
const prisma = new PrismaClient({ adapter }); // <--- INI SOLUSINYA

module.exports = prisma;