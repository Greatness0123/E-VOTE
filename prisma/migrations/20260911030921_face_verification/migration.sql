-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "faceEmbeddingCiphertext" BYTEA,
ADD COLUMN     "faceEmbeddingIv" BYTEA,
ADD COLUMN     "faceEmbeddingTag" BYTEA,
ADD COLUMN     "faceEnrollmentConsentAt" TIMESTAMP(3),
ADD COLUMN     "faceEnrollmentUpdatedAt" TIMESTAMP(3);
