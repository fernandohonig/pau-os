-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "subject" TEXT NOT NULL DEFAULT 'mathematics-ii';

-- AlterTable
ALTER TABLE "PracticeSession" ADD COLUMN     "subject" TEXT NOT NULL DEFAULT 'mathematics-ii';
