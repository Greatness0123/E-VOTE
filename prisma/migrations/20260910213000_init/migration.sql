-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ELECTION_OFFICER', 'STUDENT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'CLOSED', 'CANCELLED', 'RESULTS_PUBLISHED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('ACTIVE', 'DISQUALIFIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VotingSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('OTP', 'WEBAUTHN', 'CAMERA_LIVENESS');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ELECTION_STARTED', 'ELECTION_CLOSING_SOON', 'ELECTION_CLOSED', 'RESULTS_PUBLISHED', 'ACCOUNT_STATUS_CHANGED', 'SECURITY_ALERT');

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "matricNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "department" TEXT,
    "level" TEXT,
    "profilePhotoUrl" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "isEligibleDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnChallenge" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "status" "VotingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordVerifiedAt" TIMESTAMP(3),
    "otpVerifiedAt" TIMESTAMP(3),
    "webauthnVerifiedAt" TIMESTAMP(3),
    "livenessVerifiedAt" TIMESTAMP(3),
    "livenessChallengeId" TEXT,
    "livenessAction" TEXT,
    "livenessNonceHash" TEXT,
    "livenessExpiresAt" TIMESTAMP(3),
    "livenessConsumedAt" TIMESTAMP(3),
    "eligibilityCheckedAt" TIMESTAMP(3),
    "sessionToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VotingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvent" (
    "id" TEXT NOT NULL,
    "votingSessionId" TEXT NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "result" "VerificationResult" NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "academicSession" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "ElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionEligibility" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "studentId" TEXT,
    "fullName" TEXT NOT NULL,
    "profilePhotoUrl" TEXT,
    "mediaAssetId" TEXT,
    "slogan" TEXT,
    "manifesto" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "disqualifiedReason" TEXT,
    "disqualifiedAt" TIMESTAMP(3),
    "disqualifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoterParticipation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoterParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "anonymousBallotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BallotSelection" (
    "id" TEXT NOT NULL,
    "ballotId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,

    CONSTRAINT "BallotSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "electionId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_matricNumber_key" ON "Student"("matricNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");

-- CreateIndex
CREATE INDEX "Student_accountStatus_idx" ON "Student"("accountStatus");

-- CreateIndex
CREATE INDEX "Student_role_idx" ON "Student"("role");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_studentId_idx" ON "PasswordReset"("studentId");

-- CreateIndex
CREATE INDEX "OtpCode_studentId_purpose_idx" ON "OtpCode"("studentId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_studentId_idx" ON "WebAuthnCredential"("studentId");

-- CreateIndex
CREATE INDEX "WebAuthnChallenge_studentId_purpose_idx" ON "WebAuthnChallenge"("studentId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "VotingSession_sessionToken_key" ON "VotingSession"("sessionToken");

-- CreateIndex
CREATE INDEX "VotingSession_studentId_electionId_idx" ON "VotingSession"("studentId", "electionId");

-- CreateIndex
CREATE INDEX "VotingSession_status_idx" ON "VotingSession"("status");

-- CreateIndex
CREATE INDEX "VerificationEvent_votingSessionId_idx" ON "VerificationEvent"("votingSessionId");

-- CreateIndex
CREATE INDEX "Election_status_idx" ON "Election"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionEligibility_electionId_studentId_key" ON "ElectionEligibility"("electionId", "studentId");

-- CreateIndex
CREATE INDEX "Position_electionId_idx" ON "Position"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_mediaAssetId_key" ON "Candidate"("mediaAssetId");

-- CreateIndex
CREATE INDEX "Candidate_electionId_positionId_idx" ON "Candidate"("electionId", "positionId");

-- CreateIndex
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");

-- CreateIndex
CREATE INDEX "VoterParticipation_electionId_idx" ON "VoterParticipation"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "VoterParticipation_studentId_electionId_key" ON "VoterParticipation"("studentId", "electionId");

-- CreateIndex
CREATE UNIQUE INDEX "Ballot_anonymousBallotId_key" ON "Ballot"("anonymousBallotId");

-- CreateIndex
CREATE INDEX "Ballot_electionId_idx" ON "Ballot"("electionId");

-- CreateIndex
CREATE INDEX "BallotSelection_positionId_candidateId_idx" ON "BallotSelection"("positionId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "BallotSelection_ballotId_positionId_key" ON "BallotSelection"("ballotId", "positionId");

-- CreateIndex
CREATE INDEX "Notification_studentId_readAt_idx" ON "Notification"("studentId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnChallenge" ADD CONSTRAINT "WebAuthnChallenge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingSession" ADD CONSTRAINT "VotingSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingSession" ADD CONSTRAINT "VotingSession_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvent" ADD CONSTRAINT "VerificationEvent_votingSessionId_fkey" FOREIGN KEY ("votingSessionId") REFERENCES "VotingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionEligibility" ADD CONSTRAINT "ElectionEligibility_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionEligibility" ADD CONSTRAINT "ElectionEligibility_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_disqualifiedById_fkey" FOREIGN KEY ("disqualifiedById") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterParticipation" ADD CONSTRAINT "VoterParticipation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterParticipation" ADD CONSTRAINT "VoterParticipation_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BallotSelection" ADD CONSTRAINT "BallotSelection_ballotId_fkey" FOREIGN KEY ("ballotId") REFERENCES "Ballot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BallotSelection" ADD CONSTRAINT "BallotSelection_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BallotSelection" ADD CONSTRAINT "BallotSelection_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
