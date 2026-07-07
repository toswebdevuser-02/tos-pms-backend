-- AlterTable
ALTER TABLE "users" ALTER COLUMN "member_id" SET NOT NULL,
DROP CONSTRAINT "users_member_id_fkey",
ADD CONSTRAINT "users_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
