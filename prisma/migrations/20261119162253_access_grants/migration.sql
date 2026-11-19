-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('LINK_ONLY', 'VITALS', 'FULL');

-- AlterEnum
ALTER TYPE "LinkMethod" ADD VALUE 'ACCESS_GRANT';

-- AlterTable
ALTER TABLE "PatientLinkToken" ADD COLUMN     "durationMin" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "scope" "AccessScope" NOT NULL DEFAULT 'LINK_ONLY';

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "scope" "AccessScope" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessGrant_patientId_expiresAt_idx" ON "AccessGrant"("patientId", "expiresAt");

-- CreateIndex
CREATE INDEX "AccessGrant_doctorId_expiresAt_idx" ON "AccessGrant"("doctorId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_patientId_doctorId_key" ON "AccessGrant"("patientId", "doctorId");

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
