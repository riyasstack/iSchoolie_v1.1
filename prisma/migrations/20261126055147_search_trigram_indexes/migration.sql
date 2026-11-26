-- Trigram search requires the pg_trgm extension (bundled with PostgreSQL contrib).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Post_textLower_trgm_idx" ON "Post" USING GIN ("textLower" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Post_hashtags_gin_idx" ON "Post" USING GIN ("hashtags");

-- CreateIndex
CREATE INDEX "User_handleLower_trgm_idx" ON "User" USING GIN ("handleLower" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_displayName_trgm_idx" ON "User" USING GIN ("displayName" gin_trgm_ops);
