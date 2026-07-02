-- CreateTable
CREATE TABLE "allocations" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL DEFAULT '',
    "updated_by" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "allocations_project_id_idx" ON "allocations"("project_id");

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
