-- Migration: Add ChatThread model and link existing ChatMessages

-- 1. Create ChatThread table
CREATE TABLE IF NOT EXISTS "ChatThread" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "gameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- 2. Add nullable threadId column to ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "threadId" TEXT;

-- 3. Create a default ChatThread for each game that has messages
INSERT INTO "ChatThread" ("id", "title", "gameId", "createdAt", "updatedAt")
SELECT
    'thread_' || "gameId",
    'General',
    "gameId",
    MIN("createdAt"),
    MAX("createdAt")
FROM "ChatMessage"
WHERE "gameId" NOT IN (SELECT "gameId" FROM "ChatThread")
GROUP BY "gameId";

-- 4. Link existing messages to their game's default thread
UPDATE "ChatMessage"
SET "threadId" = 'thread_' || "gameId"
WHERE "threadId" IS NULL;

-- 5. Make threadId NOT NULL
ALTER TABLE "ChatMessage" ALTER COLUMN "threadId" SET NOT NULL;

-- 6. Add foreign key constraint
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Add indexes
CREATE INDEX IF NOT EXISTS "ChatThread_gameId_idx" ON "ChatThread"("gameId");
CREATE INDEX IF NOT EXISTS "ChatMessage_threadId_idx" ON "ChatMessage"("threadId");
