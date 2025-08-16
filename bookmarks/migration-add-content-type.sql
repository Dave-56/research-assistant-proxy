-- Migration: Add content_type and metadata fields to user_content table
-- This supports the new content-type-aware bookmark system

-- Add content_type column to store the detected type (article, product, social, video, other)
ALTER TABLE user_content 
ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'article';

-- Add metadata column to store type-specific extracted data
ALTER TABLE user_content 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index on content_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_user_content_type ON user_content(content_type);

-- Update existing bookmarks to have 'article' type (since they were all cleaned as articles)
UPDATE user_content 
SET content_type = 'article' 
WHERE type = 'bookmark' AND content_type IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_content.content_type IS 'Type of content: article, product, social, video, or other';
COMMENT ON COLUMN user_content.metadata IS 'Type-specific metadata extracted from the content';