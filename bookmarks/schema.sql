-- Bookmark Import Tables Schema
-- Run this in Supabase SQL Editor to create the necessary tables

-- Store imported bookmarks with relationship to original Chrome structure
CREATE TABLE IF NOT EXISTS imported_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Chrome bookmark data
  chrome_id VARCHAR(100), -- Original Chrome bookmark ID
  parent_chrome_id VARCHAR(100), -- For maintaining hierarchy
  title TEXT NOT NULL,
  url TEXT,
  folder_path TEXT, -- Full path like "Bookmarks Bar/Development/React"
  is_folder BOOLEAN DEFAULT FALSE,
  date_added TIMESTAMP WITH TIME ZONE,
  
  -- Import metadata
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  import_batch_id UUID, -- Group bookmarks imported together
  
  -- Processing status
  processing_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  summary TEXT, -- AI-generated summary
  summary_generated_at TIMESTAMP WITH TIME ZONE,
  
  -- Deduplication
  glance_content_id UUID REFERENCES user_content(id), -- Link if already exists
  is_duplicate BOOLEAN DEFAULT FALSE,
  
  -- Additional metadata
  favicon_url TEXT,
  tags TEXT[], -- Extracted from folder structure
  metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_imported_bookmarks_user_chrome ON imported_bookmarks(user_id, chrome_id);
CREATE INDEX IF NOT EXISTS idx_imported_bookmarks_url ON imported_bookmarks(url);
CREATE INDEX IF NOT EXISTS idx_imported_bookmarks_status ON imported_bookmarks(processing_status);
CREATE INDEX IF NOT EXISTS idx_imported_bookmarks_batch ON imported_bookmarks(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_imported_bookmarks_user_id ON imported_bookmarks(user_id);

-- Import batches for tracking
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  total_bookmarks INTEGER DEFAULT 0,
  processed_bookmarks INTEGER DEFAULT 0,
  failed_bookmarks INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed, failed
  options JSONB DEFAULT '{}' -- Store import options (generate_summaries, etc.)
);

-- Index for import batches
CREATE INDEX IF NOT EXISTS idx_import_batches_user_id ON import_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);

-- Enable Row Level Security (RLS) for both tables
ALTER TABLE imported_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for imported_bookmarks
CREATE POLICY "Users can view own imported bookmarks" ON imported_bookmarks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own imported bookmarks" ON imported_bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own imported bookmarks" ON imported_bookmarks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own imported bookmarks" ON imported_bookmarks
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for import_batches
CREATE POLICY "Users can view own import batches" ON import_batches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own import batches" ON import_batches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own import batches" ON import_batches
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own import batches" ON import_batches
  FOR DELETE USING (auth.uid() = user_id);

-- Function to automatically set favicon URL based on domain
CREATE OR REPLACE FUNCTION set_favicon_url()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set favicon if URL exists and favicon_url is not already set
  IF NEW.url IS NOT NULL AND NEW.favicon_url IS NULL THEN
    NEW.favicon_url := 'https://www.google.com/s2/favicons?domain=' || 
                       regexp_replace(NEW.url, '^https?://([^/]+).*', '\1');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set favicon URL
CREATE TRIGGER set_favicon_url_trigger
  BEFORE INSERT OR UPDATE ON imported_bookmarks
  FOR EACH ROW EXECUTE FUNCTION set_favicon_url();

-- View for bookmark statistics
CREATE OR REPLACE VIEW bookmark_stats AS
SELECT 
  user_id,
  COUNT(*) as total_bookmarks,
  COUNT(*) FILTER (WHERE processing_status = 'completed') as completed_bookmarks,
  COUNT(*) FILTER (WHERE processing_status = 'pending') as pending_bookmarks,
  COUNT(*) FILTER (WHERE processing_status = 'failed') as failed_bookmarks,
  COUNT(DISTINCT folder_path) as unique_folders,
  MAX(imported_at) as last_import_date
FROM imported_bookmarks
GROUP BY user_id;

-- Grant necessary permissions
GRANT ALL ON imported_bookmarks TO authenticated;
GRANT ALL ON import_batches TO authenticated;
GRANT SELECT ON bookmark_stats TO authenticated;