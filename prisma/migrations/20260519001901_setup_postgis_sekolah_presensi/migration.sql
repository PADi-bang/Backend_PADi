/*
  Warnings:

  - You are about to drop the column `lat_masuk` on the `absensi` table. All the data in the column will be lost.
  - You are about to drop the column `lat_pulang` on the `absensi` table. All the data in the column will be lost.
  - You are about to drop the column `lon_masuk` on the `absensi` table. All the data in the column will be lost.
  - You are about to drop the column `lon_pulang` on the `absensi` table. All the data in the column will be lost.
  - You are about to drop the column `latitude_pusat` on the `sekolah` table. All the data in the column will be lost.
  - You are about to drop the column `longitude_pusat` on the `sekolah` table. All the data in the column will be lost.
  - Added the required column `titik_koordinat` to the `sekolah` table without a default value. This is not possible if the table is not empty.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- AlterTable
ALTER TABLE "absensi" DROP COLUMN "lat_masuk",
DROP COLUMN "lat_pulang",
DROP COLUMN "lon_masuk",
DROP COLUMN "lon_pulang",
ADD COLUMN     "koordinat_masuk" geography(Point, 4326),
ADD COLUMN     "koordinat_pulang" geography(Point, 4326);

-- AlterTable
ALTER TABLE "sekolah" DROP COLUMN "latitude_pusat",
DROP COLUMN "longitude_pusat",
ADD COLUMN     "titik_koordinat" geography(Point, 4326) NOT NULL;
