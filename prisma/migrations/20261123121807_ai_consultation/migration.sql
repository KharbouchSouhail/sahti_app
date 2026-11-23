-- CreateEnum
CREATE TYPE "CreationMode" AS ENUM ('MANUAL', 'AI');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'PAUSED', 'FINISHED', 'UPLOADING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('TRANSCRIBE', 'EXTRACT', 'PURGE');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('AUDIO', 'AI_PROCESSING', 'RETENTION', 'PATIENT_QR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsultationStatus" ADD VALUE 'RECORDING';
ALTER TYPE "ConsultationStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "ConsultationStatus" ADD VALUE 'AI_REVIEW';

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "aiMeta" JSONB,
ADD COLUMN     "creationMode" "CreationMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "validatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RecordingConsent" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "method" TEXT NOT NULL DEFAULT 'DOCTOR_ATTESTATION',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "mimeType" TEXT NOT NULL DEFAULT 'audio/webm',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "recordingId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "text" TEXT NOT NULL DEFAULT '',
    "segments" JSONB NOT NULL DEFAULT '[]',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "model" TEXT,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiExtraction" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "transcriptId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "data" JSONB NOT NULL,
    "raw" JSONB,
    "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unverifiedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warnings" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "error" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecorderSession" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "pairingCode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecorderSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordingConsent_consultationId_idx" ON "RecordingConsent"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingConsent_consultationId_type_key" ON "RecordingConsent"("consultationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_consultationId_key" ON "Recording"("consultationId");

-- CreateIndex
CREATE INDEX "Recording_status_idx" ON "Recording"("status");

-- CreateIndex
CREATE INDEX "Recording_expiresAt_idx" ON "Recording"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_consultationId_key" ON "Transcript"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_recordingId_key" ON "Transcript"("recordingId");

-- CreateIndex
CREATE INDEX "AiExtraction_consultationId_createdAt_idx" ON "AiExtraction"("consultationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiExtraction_consultationId_version_key" ON "AiExtraction"("consultationId", "version");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_runAt_idx" ON "ProcessingJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "ProcessingJob_consultationId_type_idx" ON "ProcessingJob"("consultationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "RecorderSession_tokenHash_key" ON "RecorderSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RecorderSession_pairingCode_key" ON "RecorderSession"("pairingCode");

-- CreateIndex
CREATE INDEX "RecorderSession_consultationId_idx" ON "RecorderSession"("consultationId");

-- CreateIndex
CREATE INDEX "RecorderSession_expiresAt_idx" ON "RecorderSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "RecordingConsent" ADD CONSTRAINT "RecordingConsent_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExtraction" ADD CONSTRAINT "AiExtraction_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExtraction" ADD CONSTRAINT "AiExtraction_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecorderSession" ADD CONSTRAINT "RecorderSession_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
