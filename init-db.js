const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function initDB() {
    try {
        console.log("Mencoba terhubung ke PostgreSQL...");
        
        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                nama VARCHAR(255) NOT NULL,
                nim VARCHAR(100) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(50) DEFAULT 'mahasiswa'
            );
        `;
        await pool.query(createUsersTable);
        console.log("✅ Tabel 'users' berhasil disiapkan.");

        const createPresensiTable = `
            CREATE TABLE IF NOT EXISTS presensi (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                mata_kuliah VARCHAR(255) NOT NULL,
                latitude VARCHAR(100),
                longitude VARCHAR(100),
                tanggal DATE DEFAULT CURRENT_DATE,
                waktu TIME DEFAULT CURRENT_TIME,
                status VARCHAR(50) DEFAULT 'hadir'
            );
        `;
        await pool.query(createPresensiTable);
        console.log("✅ Tabel 'presensi' berhasil disiapkan.");

        console.log("Konfigurasi database selesai! Anda bisa menjalankan 'npm start' sekarang.");
    } catch (err) {
        console.error("❌ Terjadi kesalahan saat konfigurasi database:");
        console.error(err.message);
        console.log("\nPastikan PostgreSQL sudah berjalan dan kredensial di .env sudah benar.");
    } finally {
        await pool.end();
    }
}

initDB();
