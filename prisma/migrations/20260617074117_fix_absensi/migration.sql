-- AlterTable
ALTER TABLE "jadwal_absensi" ALTER COLUMN "tanggal" DROP NOT NULL;

-- AlterTable
ALTER TABLE "master_angkatan" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "pengaturan" (
    "id_pengaturan" SERIAL NOT NULL,
    "kunci" TEXT NOT NULL,
    "nilai" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pengaturan_pkey" PRIMARY KEY ("id_pengaturan")
);

-- CreateTable
CREATE TABLE "_JadwalAbsensiToMasterKelas" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "pengaturan_kunci_key" ON "pengaturan"("kunci");

-- CreateIndex
CREATE UNIQUE INDEX "_JadwalAbsensiToMasterKelas_AB_unique" ON "_JadwalAbsensiToMasterKelas"("A", "B");

-- CreateIndex
CREATE INDEX "_JadwalAbsensiToMasterKelas_B_index" ON "_JadwalAbsensiToMasterKelas"("B");

-- AddForeignKey
ALTER TABLE "_JadwalAbsensiToMasterKelas" ADD CONSTRAINT "_JadwalAbsensiToMasterKelas_A_fkey" FOREIGN KEY ("A") REFERENCES "jadwal_absensi"("id_jadwal") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JadwalAbsensiToMasterKelas" ADD CONSTRAINT "_JadwalAbsensiToMasterKelas_B_fkey" FOREIGN KEY ("B") REFERENCES "master_kelas"("id_kelas") ON DELETE CASCADE ON UPDATE CASCADE;
