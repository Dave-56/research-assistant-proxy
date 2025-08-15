-- Script to drop existing bookmark tables and recreate with new schema
-- Run this in Supabase SQL Editor

-- Step 1: Drop existing tables (CASCADE will remove dependent objects)
DROP TABLE IF EXISTS imported_bookmarks CASCADE;
DROP TABLE IF EXISTS import_batches CASCADE;

-- Step 2: Drop any views that might exist
DROP VIEW IF EXISTS bookmark_stats CASCADE;

-- Step 3: Now create the new schema
-- Minimal Bookmark Import Schema for MVP with Background Processing
-- Optimized for fast import + background content fetching

-- Store imported bookmarks with content fetching status
CREATE TABLE IF NOT EXISTS imported_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core bookmark data
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  folder_path TEXT, -- For organizing/tagging
  date_added TIMESTAMP WITH TIME ZONE,
  
  -- Import tracking
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  import_batch_id UUID,
  
  -- Content fetching status
  fetch_status VARCHAR(50) DEFAULT 'pending', -- pending, fetching, completed, failed
  fetched_at TIMESTAMP WITH TIME ZONE,
  fetch_error TEXT,
  
  -- Link to content once fetched
  content_id UUID REFERENCES user_content(id),
  
  -- Temporary storage before moving to user_content
  temp_content TEXT,
  temp_preview TEXT
);

-- Import batches for tracking
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Import stats
  total_bookmarks INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  
  -- Content fetching stats
  fetch_pending INTEGER DEFAULT 0,
  fetch_completed INTEGER DEFAULT 0,
  fetch_failed INTEGER DEFAULT 0,
  
  -- Overall status
  import_status VARCHAR(50) DEFAULT 'importing', -- importing, fetching_content, completed
  
  -- Notification preference
  notify_on_complete BOOLEAN DEFAULT true
);

-- Essential indexes for performance
CREATE INDEX IF NOT EXISTS idx_imported_bookmarks_user_id ON imported_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_imported_bookmarks_fetch_status ON imported_bookmarks(fetch_status);
CREATE INDEX IF NOT EXISTS idx_imported_bookmarks_batch_id ON imported_bookmarks(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_user_id ON import_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(import_status);