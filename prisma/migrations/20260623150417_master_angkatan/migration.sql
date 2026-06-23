/*
  Warnings:

  - You are about to drop the column `id_angkatan` on the `enrolment_kelas` table. All the data in the column will be lost.
  - The `tanggal` column on the `jadwal_absensi` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "enrolment_kelas" DROP CONSTRAINT "enrolment_kelas_id_angkatan_fkey";

-- AlterTable
ALTER TABLE "enrolment_kelas" DROP COLUMN "id_angkatan";

-- AlterTable
ALTER TABLE "enrolment_siswa" ADD COLUMN     "status_kenaikan" TEXT DEFAULT 'Belum Diproses';

-- AlterTable
ALTER TABLE "jadwal_absensi" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "tanggal",
ADD COLUMN     "tanggal" DATE[];

-- AlterTable
ALTER TABLE "master_kelas" ADD COLUMN     "id_tingkat" INTEGER;

-- AlterTable
ALTER TABLE "siswa" ADD COLUMN     "id_angkatan" INTEGER;

-- CreateTable
CREATE TABLE "master_tingkat" (
    "id_tingkat" SERIAL NOT NULL,
    "nama_tingkat" TEXT NOT NULL,

    CONSTRAINT "master_tingkat_pkey" PRIMARY KEY ("id_tingkat")
);

-- AddForeignKey
ALTER TABLE "siswa" ADD CONSTRAINT "siswa_id_angkatan_fkey" FOREIGN KEY ("id_angkatan") REFERENCES "master_angkatan"("id_angkatan") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_kelas" ADD CONSTRAINT "master_kelas_id_tingkat_fkey" FOREIGN KEY ("id_tingkat") REFERENCES "master_tingkat"("id_tingkat") ON DELETE SET NULL ON UPDATE CASCADE;
