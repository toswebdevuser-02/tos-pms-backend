-- CreateTable
CREATE TABLE "project_feedback" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL DEFAULT '',
    "updated_by" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "project_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_feedback_project_id_idx" ON "project_feedback"("project_id");

-- AddForeignKey
ALTER TABLE "project_feedback" ADD CONSTRAINT "project_feedback_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
