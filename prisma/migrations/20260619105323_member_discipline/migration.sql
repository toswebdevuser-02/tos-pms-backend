-- AlterTable
ALTER TABLE "members" ADD COLUMN     "discipline" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "role" SET DEFAULT 'Employee';
