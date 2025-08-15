-- Minimal Bookmark Import Schema for MVP
-- Just the essential tables and indexes

-- Store imported bookmarks
CREATE TABLE IF NOT EXISTS imported_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core bookmark data
  chrome_id VARCHAR(100),
  title TEXT NOT NULL,
  url TEXT,
  folder_path TEXT,
  date_added TIMESTAMP WITH TIME ZONE,
  
  -- Import tracking
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  import_batch_id UUID,
  
  -- Processing status
  processing_status VARCHAR(50) DEFAULT 'completed'
);

-- Import batches for tracking
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_bookmarks INTEGER DEFAULT 0,
  processed_bookmarks INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'completed'
);

-- Essential indexes only
CREATE INDEX IF NOT EXISTS idx_imported_bookmarks_user_id ON imported_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_user_id ON import_batches(user_id);