-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('Admin', 'Guru', 'Siswa');

-- CreateEnum
CREATE TYPE "Semester" AS ENUM ('Ganjil', 'Genap');

-- CreateEnum
CREATE TYPE "AbsensiStatus" AS ENUM ('Hadir', 'Telat', 'Alpha', 'Izin', 'Sakit');

-- CreateEnum
CREATE TYPE "PerizinanJenis" AS ENUM ('Sakit', 'Kepentingan');

-- CreateEnum
CREATE TYPE "PerizinanStatus" AS ENUM ('Pending', 'Disetujui', 'Ditolak');

-- CreateEnum
CREATE TYPE "NotifikasiTipe" AS ENUM ('Sistem', 'Pengingat', 'Peringatan');

-- CreateTable
CREATE TABLE "role" (
    "id_role" SERIAL NOT NULL,
    "nama_role" "RoleName" NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id_role")
);

-- CreateTable
CREATE TABLE "user" (
    "id_user" SERIAL NOT NULL,
    "id_role" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fcm_token" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id_user")
);

-- CreateTable
CREATE TABLE "admin" (
    "id_admin" SERIAL NOT NULL,
    "id_user" INTEGER NOT NULL,
    "id_sekolah" INTEGER NOT NULL,
    "nama_admin" TEXT NOT NULL,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id_admin")
);

-- CreateTable
CREATE TABLE "guru" (
    "id_guru" SERIAL NOT NULL,
    "id_user" INTEGER NOT NULL,
    "id_sekolah" INTEGER NOT NULL,
    "nama_lengkap" TEXT NOT NULL,
    "NIP" TEXT NOT NULL,

    CONSTRAINT "guru_pkey" PRIMARY KEY ("id_guru")
);

-- CreateTable
CREATE TABLE "siswa" (
    "id_siswa" SERIAL NOT NULL,
    "id_user" INTEGER NOT NULL,
    "id_sekolah" INTEGER NOT NULL,
    "nama_lengkap" TEXT NOT NULL,
    "NIS" TEXT NOT NULL,
    "face_model" TEXT,

    CONSTRAINT "siswa_pkey" PRIMARY KEY ("id_siswa")
);

-- CreateTable
CREATE TABLE "sekolah" (
    "id_sekolah" SERIAL NOT NULL,
    "nama_sekolah" TEXT NOT NULL,
    "alamat" TEXT NOT NULL,
    "latitude_pusat" DOUBLE PRECISION NOT NULL,
    "longitude_pusat" DOUBLE PRECISION NOT NULL,
    "radius_meter" INTEGER NOT NULL,

    CONSTRAINT "sekolah_pkey" PRIMARY KEY ("id_sekolah")
);

-- CreateTable
CREATE TABLE "master_kelas" (
    "id_kelas" SERIAL NOT NULL,
    "id_sekolah" INTEGER NOT NULL,
    "nama_kelas" TEXT NOT NULL,

    CONSTRAINT "master_kelas_pkey" PRIMARY KEY ("id_kelas")
);

-- CreateTable
CREATE TABLE "master_angkatan" (
    "id_angkatan" SERIAL NOT NULL,
    "id_sekolah" INTEGER NOT NULL,
    "nomor_angkatan" TEXT NOT NULL,

    CONSTRAINT "master_angkatan_pkey" PRIMARY KEY ("id_angkatan")
);

-- CreateTable
CREATE TABLE "master_tahun_akademik" (
    "id_tahun_akademik" SERIAL NOT NULL,
    "id_sekolah" INTEGER NOT NULL,
    "tahun_ajaran" TEXT NOT NULL,
    "semester" "Semester" NOT NULL,
    "is_active" BOOLEAN NOT NULL,

    CONSTRAINT "master_tahun_akademik_pkey" PRIMARY KEY ("id_tahun_akademik")
);

-- CreateTable
CREATE TABLE "enrolment_kelas" (
    "id_enrolment_kelas" SERIAL NOT NULL,
    "id_sekolah" INTEGER NOT NULL,
    "id_kelas" INTEGER NOT NULL,
    "id_angkatan" INTEGER NOT NULL,
    "id_tahun_akademik" INTEGER NOT NULL,
    "keterangan" TEXT,

    CONSTRAINT "enrolment_kelas_pkey" PRIMARY KEY ("id_enrolment_kelas")
);

-- CreateTable
CREATE TABLE "enrolment_siswa" (
    "id_enrolment_siswa" SERIAL NOT NULL,
    "id_siswa" INTEGER NOT NULL,
    "id_enrolment_kelas" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL,

    CONSTRAINT "enrolment_siswa_pkey" PRIMARY KEY ("id_enrolment_siswa")
);

-- CreateTable
CREATE TABLE "enrolment_guru" (
    "id_enrolment_guru" SERIAL NOT NULL,
    "id_guru" INTEGER NOT NULL,
    "id_enrolment_kelas" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL,

    CONSTRAINT "enrolment_guru_pkey" PRIMARY KEY ("id_enrolment_guru")
);

-- CreateTable
CREATE TABLE "jadwal_absensi" (
    "id_jadwal" SERIAL NOT NULL,
    "id_sekolah" INTEGER NOT NULL,
    "nama_jadwal" TEXT NOT NULL,
    "hari" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "jam_masuk_start" TIME NOT NULL,
    "jam_masuk_finish" TIME NOT NULL,
    "jam_pulang" TIME NOT NULL,
    "is_libur" BOOLEAN NOT NULL,

    CONSTRAINT "jadwal_absensi_pkey" PRIMARY KEY ("id_jadwal")
);

-- CreateTable
CREATE TABLE "absensi" (
    "id_absensi" SERIAL NOT NULL,
    "id_siswa" INTEGER NOT NULL,
    "id_jadwal" INTEGER NOT NULL,
    "tanggal" DATE NOT NULL,
    "jam_masuk" TIME,
    "jam_pulang" TIME,
    "lat_masuk" DOUBLE PRECISION,
    "lon_masuk" DOUBLE PRECISION,
    "lat_pulang" DOUBLE PRECISION,
    "lon_pulang" DOUBLE PRECISION,
    "foto_masuk" TEXT,
    "foto_pulang" TEXT,
    "status" "AbsensiStatus" NOT NULL,
    "keterangan" TEXT,

    CONSTRAINT "absensi_pkey" PRIMARY KEY ("id_absensi")
);

-- CreateTable
CREATE TABLE "perizinan" (
    "id_perizinan" SERIAL NOT NULL,
    "id_siswa" INTEGER NOT NULL,
    "tanggal_mulai" DATE NOT NULL,
    "tanggal_selesai" DATE NOT NULL,
    "jenis_izin" "PerizinanJenis" NOT NULL,
    "alasan" TEXT NOT NULL,
    "file_bukti" TEXT,
    "status" "PerizinanStatus" NOT NULL,
    "disetujui_oleh" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perizinan_pkey" PRIMARY KEY ("id_perizinan")
);

-- CreateTable
CREATE TABLE "notifikasi" (
    "id_notifikasi" SERIAL NOT NULL,
    "id_user" INTEGER NOT NULL,
    "judul" TEXT NOT NULL,
    "tipe" "NotifikasiTipe" NOT NULL,
    "isi_pesan" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifikasi_pkey" PRIMARY KEY ("id_notifikasi")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_id_user_key" ON "admin"("id_user");

-- CreateIndex
CREATE UNIQUE INDEX "guru_id_user_key" ON "guru"("id_user");

-- CreateIndex
CREATE UNIQUE INDEX "guru_NIP_key" ON "guru"("NIP");

-- CreateIndex
CREATE UNIQUE INDEX "siswa_id_user_key" ON "siswa"("id_user");

-- CreateIndex
CREATE UNIQUE INDEX "siswa_NIS_key" ON "siswa"("NIS");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_id_role_fkey" FOREIGN KEY ("id_role") REFERENCES "role"("id_role") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin" ADD CONSTRAINT "admin_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "user"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin" ADD CONSTRAINT "admin_id_sekolah_fkey" FOREIGN KEY ("id_sekolah") REFERENCES "sekolah"("id_sekolah") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guru" ADD CONSTRAINT "guru_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "user"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guru" ADD CONSTRAINT "guru_id_sekolah_fkey" FOREIGN KEY ("id_sekolah") REFERENCES "sekolah"("id_sekolah") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "siswa" ADD CONSTRAINT "siswa_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "user"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "siswa" ADD CONSTRAINT "siswa_id_sekolah_fkey" FOREIGN KEY ("id_sekolah") REFERENCES "sekolah"("id_sekolah") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_kelas" ADD CONSTRAINT "master_kelas_id_sekolah_fkey" FOREIGN KEY ("id_sekolah") REFERENCES "sekolah"("id_sekolah") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_angkatan" ADD CONSTRAINT "master_angkatan_id_sekolah_fkey" FOREIGN KEY ("id_sekolah") REFERENCES "sekolah"("id_sekolah") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_tahun_akademik" ADD CONSTRAINT "master_tahun_akademik_id_sekolah_fkey" FOREIGN KEY ("id_sekolah") REFERENCES "sekolah"("id_sekolah") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_kelas" ADD CONSTRAINT "enrolment_kelas_id_sekolah_fkey" FOREIGN KEY ("id_sekolah") REFERENCES "sekolah"("id_sekolah") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_kelas" ADD CONSTRAINT "enrolment_kelas_id_kelas_fkey" FOREIGN KEY ("id_kelas") REFERENCES "master_kelas"("id_kelas") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_kelas" ADD CONSTRAINT "enrolment_kelas_id_angkatan_fkey" FOREIGN KEY ("id_angkatan") REFERENCES "master_angkatan"("id_angkatan") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_kelas" ADD CONSTRAINT "enrolment_kelas_id_tahun_akademik_fkey" FOREIGN KEY ("id_tahun_akademik") REFERENCES "master_tahun_akademik"("id_tahun_akademik") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_siswa" ADD CONSTRAINT "enrolment_siswa_id_siswa_fkey" FOREIGN KEY ("id_siswa") REFERENCES "siswa"("id_siswa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_siswa" ADD CONSTRAINT "enrolment_siswa_id_enrolment_kelas_fkey" FOREIGN KEY ("id_enrolment_kelas") REFERENCES "enrolment_kelas"("id_enrolment_kelas") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_guru" ADD CONSTRAINT "enrolment_guru_id_guru_fkey" FOREIGN KEY ("id_guru") REFERENCES "guru"("id_guru") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolment_guru" ADD CONSTRAINT "enrolment_guru_id_enrolment_kelas_fkey" FOREIGN KEY ("id_enrolment_kelas") REFERENCES "enrolment_kelas"("id_enrolment_kelas") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jadwal_absensi" ADD CONSTRAINT "jadwal_absensi_id_sekolah_fkey" FOREIGN KEY ("id_sekolah") REFERENCES "sekolah"("id_sekolah") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absensi" ADD CONSTRAINT "absensi_id_siswa_fkey" FOREIGN KEY ("id_siswa") REFERENCES "siswa"("id_siswa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absensi" ADD CONSTRAINT "absensi_id_jadwal_fkey" FOREIGN KEY ("id_jadwal") REFERENCES "jadwal_absensi"("id_jadwal") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perizinan" ADD CONSTRAINT "perizinan_id_siswa_fkey" FOREIGN KEY ("id_siswa") REFERENCES "siswa"("id_siswa") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perizinan" ADD CONSTRAINT "perizinan_disetujui_oleh_fkey" FOREIGN KEY ("disetujui_oleh") REFERENCES "guru"("id_guru") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifikasi" ADD CONSTRAINT "notifikasi_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "user"("id_user") ON DELETE RESTRICT ON UPDATE CASCADE;
