-- CreateTable
CREATE TABLE "HNThread" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "itemUrl" TEXT NOT NULL,
    "storyUrl" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HNThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HNThread_workspaceId_discoveredAt_idx" ON "HNThread"("workspaceId", "discoveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "HNThread_workspaceId_externalId_key" ON "HNThread"("workspaceId", "externalId");

-- AddForeignKey
ALTER TABLE "HNThread" ADD CONSTRAINT "HNThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
