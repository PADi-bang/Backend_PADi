/*
  Warnings:

  - You are about to drop the column `radius_meter` on the `sekolah` table. All the data in the column will be lost.
  - You are about to drop the column `titik_koordinat` on the `sekolah` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "sekolah" DROP COLUMN "radius_meter",
DROP COLUMN "titik_koordinat",
ADD COLUMN     "area_sekolah" geography(Polygon, 4326);
