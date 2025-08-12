-- Otto Research Assistant - Supabase Database Schema
-- Migration from Chrome Storage to Supabase

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Users table for authentication and user management
CREATE TABLE users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    google_id VARCHAR(255) UNIQUE, -- For Google OAuth
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- User content table (combines bookmark and insight types from Chrome storage)
CREATE TABLE user_content (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Core content fields
    title TEXT NOT NULL,
    content_text TEXT, -- HTML content from Readability or insight content
    preview TEXT, -- Preview/excerpt text
    type VARCHAR(50) DEFAULT 'insight', -- 'bookmark', 'insight', 'ANALYSIS', etc.
    
    -- Timestamps
    timestamp BIGINT NOT NULL, -- Unix timestamp for compatibility with existing code
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Source information (for bookmarks)
    source_title TEXT,
    source_url TEXT,
    source_hostname TEXT,
    byline TEXT, -- Author information
    site_name TEXT,
    
    -- Content metadata
    is_readable BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'deleted', 'archived'
    
    -- Search and AI features
    embedding VECTOR(1536), -- OpenAI embedding vector for semantic search
    searchable_text TEXT, -- Preprocessed text for embedding generation
    
    -- Insight-specific fields (JSON for flexibility)
    insight_data JSONB, -- For storing takeaways, significance, questions, etc.
    sources JSONB, -- Array of source objects for insights
    
    -- Indexes for performance
    CONSTRAINT valid_type CHECK (type IN ('bookmark', 'insight', 'ANALYSIS', 'auto_summary'))
);

-- User settings table
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sync metadata table for offline/online sync
CREATE TABLE sync_metadata (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    client_id VARCHAR(255), -- Unique identifier for each client/device
    sync_version BIGINT DEFAULT 1,
    PRIMARY KEY (user_id, client_id)
);

-- Create indexes for performance
CREATE INDEX idx_user_content_user_id ON user_content(user_id);
CREATE INDEX idx_user_content_timestamp ON user_content(timestamp DESC);
CREATE INDEX idx_user_content_type ON user_content(type);
CREATE INDEX idx_user_content_status ON user_content(status);
CREATE INDEX idx_user_content_source_url ON user_content(source_url);
CREATE INDEX idx_user_content_created_at ON user_content(created_at DESC);

-- Full-text search index
CREATE INDEX idx_user_content_search ON user_content USING GIN(to_tsvector('english', title || ' ' || COALESCE(preview, '') || ' ' || COALESCE(searchable_text, '')));

-- Vector similarity search index (for semantic search)
CREATE INDEX ON user_content USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS (Row Level Security) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Content policies
CREATE POLICY "Users can view own content" ON user_content FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own content" ON user_content FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own content" ON user_content FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own content" ON user_content FOR DELETE USING (auth.uid() = user_id);

-- Settings policies
CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (auth.uid() = user_id);

-- Sync metadata policies
CREATE POLICY "Users can view own sync data" ON sync_metadata FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sync data" ON sync_metadata FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sync data" ON sync_metadata FOR UPDATE USING (auth.uid() = user_id);

-- Functions for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_content_updated_at BEFORE UPDATE ON user_content FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample default settings for new users
INSERT INTO user_settings (user_id, settings) 
SELECT id, '{
  "autoSummarize": false,
  "autoSummaryTimer": 7000,
  "maxAutoSummariesPerDay": 100
}'::jsonb
FROM users 
WHERE NOT EXISTS (SELECT 1 FROM user_settings WHERE user_settings.user_id = users.id);