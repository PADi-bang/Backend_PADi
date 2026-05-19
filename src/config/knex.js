// backend/src/config/knex.js

// Memanggil dotenv agar Knex bisa membaca password dan port dari file .env
require('dotenv').config(); 

const knex = require('knex')({
  client: 'pg', // Menggunakan driver PostgreSQL
  connection: process.env.DATABASE_URL, // Mengambil URL yang sama persis dengan milik Prisma
  searchPath: ['knex', 'public'],
  pool: { 
    min: 0, 
    max: 10 // Membatasi jumlah koneksi agar laptop/server tidak terbebani
  }
});

// Tes koneksi secara otomatis saat file ini dipanggil
knex.raw('SELECT 1')
  .then(() => {
    console.log('✅ Knex.js berhasil terhubung ke PostgreSQL!');
  })
  .catch((err) => {
    console.error('❌ Knex.js gagal terhubung:', err);
  });

module.exports = knex;