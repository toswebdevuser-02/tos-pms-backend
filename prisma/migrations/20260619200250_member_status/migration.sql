-- AlterTable
ALTER TABLE "members" ADD COLUMN     "left_date" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
