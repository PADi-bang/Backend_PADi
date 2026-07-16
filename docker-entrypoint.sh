#!/bin/sh

# Ambil host dan port dari DATABASE_URL untuk mengecek kesiapan PostgreSQL
# Format URL: postgresql://username:password@host:port/database
# Kita default ke "db" dan 5432 jika tidak terurai
DB_HOST=${DB_HOST:-db}
DB_PORT=${DB_PORT:-5432}

echo "⏳ Menunggu database PostgreSQL di $DB_HOST:$DB_PORT siap..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "${DB_USER:-postgres}"; do
  sleep 2
done

echo "✅ Database sudah siap!"

echo "🔄 Menjalankan migrasi database Prisma..."
npx prisma migrate deploy

echo "🌱 Menjalankan data seeding database..."
npx prisma db seed

echo "🚀 Memulai server backend..."
exec npm start
