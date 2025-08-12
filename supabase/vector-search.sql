-- Vector search function for semantic similarity in Supabase
-- This function performs cosine similarity search on user content embeddings

CREATE OR REPLACE FUNCTION search_content_by_embedding(
  query_embedding vector(1536),
  user_id uuid,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  preview text,
  content_text text,
  type varchar(50),
  timestamp bigint,
  source_url text,
  source_title text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uc.id,
    uc.title,
    uc.preview,
    uc.content_text,
    uc.type,
    uc.timestamp,
    uc.source_url,
    uc.source_title,
    (1 - (uc.embedding <=> query_embedding)) as similarity
  FROM user_content uc
  WHERE 
    uc.user_id = search_content_by_embedding.user_id
    AND uc.status != 'deleted'
    AND uc.embedding IS NOT NULL
    AND (1 - (uc.embedding <=> query_embedding)) > match_threshold
  ORDER BY uc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to get content recommendations based on user's reading patterns
CREATE OR REPLACE FUNCTION get_content_recommendations(
  user_id uuid,
  days_back int DEFAULT 30,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  preview text,
  type varchar(50),
  timestamp bigint,
  similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
  avg_embedding vector(1536);
BEGIN
  -- Calculate average embedding from user's recent content
  SELECT 
    (
      SELECT ARRAY_AGG(val)::vector(1536)
      FROM (
        SELECT 
          unnest(
            ARRAY(
              SELECT AVG(elem)
              FROM (
                SELECT unnest(embedding::float[]) as elem, 
                       generate_subscripts(embedding::float[], 1) as idx
                FROM user_content 
                WHERE user_content.user_id = get_content_recommendations.user_id
                  AND embedding IS NOT NULL
                  AND timestamp > EXTRACT(epoch FROM NOW() - INTERVAL '1 day' * days_back) * 1000
                  AND status != 'deleted'
              ) t
              GROUP BY idx
              ORDER BY idx
            )
          ) as val
      ) agg
    )
  INTO avg_embedding;

  -- If no embeddings found, return empty
  IF avg_embedding IS NULL THEN
    RETURN;
  END IF;

  -- Find similar content (excluding user's own content from same period)
  RETURN QUERY
  SELECT
    uc.id,
    uc.title,
    uc.preview,
    uc.type,
    uc.timestamp,
    (1 - (uc.embedding <=> avg_embedding)) as similarity
  FROM user_content uc
  WHERE 
    uc.user_id = get_content_recommendations.user_id
    AND uc.embedding IS NOT NULL
    AND uc.status != 'deleted'
    AND uc.timestamp <= EXTRACT(epoch FROM NOW() - INTERVAL '1 day' * days_back) * 1000
    AND (1 - (uc.embedding <=> avg_embedding)) > 0.3
  ORDER BY uc.embedding <=> avg_embedding
  LIMIT match_count;
END;
$$;

-- Function to find duplicate content based on embedding similarity
CREATE OR REPLACE FUNCTION find_duplicate_content(
  user_id uuid,
  content_embedding vector(1536),
  similarity_threshold float DEFAULT 0.9
)
RETURNS TABLE (
  id uuid,
  title text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    uc.id,
    uc.title,
    (1 - (uc.embedding <=> content_embedding)) as similarity
  FROM user_content uc
  WHERE 
    uc.user_id = find_duplicate_content.user_id
    AND uc.embedding IS NOT NULL
    AND uc.status != 'deleted'
    AND (1 - (uc.embedding <=> content_embedding)) > similarity_threshold
  ORDER BY uc.embedding <=> content_embedding
  LIMIT 5;
END;
$$;

-- Function to get trending topics from user's content
CREATE OR REPLACE FUNCTION get_trending_topics(
  user_id uuid,
  days_back int DEFAULT 7,
  min_similarity float DEFAULT 0.7
)
RETURNS TABLE (
  topic_cluster int,
  content_count int,
  sample_titles text[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- This is a simplified version - in practice, you'd want to use
  -- more sophisticated clustering algorithms
  
  RETURN QUERY
  WITH content_similarities AS (
    SELECT 
      c1.id as id1,
      c2.id as id2,
      c1.title as title1,
      c2.title as title2,
      (1 - (c1.embedding <=> c2.embedding)) as similarity
    FROM user_content c1
    CROSS JOIN user_content c2
    WHERE 
      c1.user_id = get_trending_topics.user_id
      AND c2.user_id = get_trending_topics.user_id
      AND c1.id != c2.id
      AND c1.timestamp > EXTRACT(epoch FROM NOW() - INTERVAL '1 day' * days_back) * 1000
      AND c2.timestamp > EXTRACT(epoch FROM NOW() - INTERVAL '1 day' * days_back) * 1000
      AND c1.embedding IS NOT NULL
      AND c2.embedding IS NOT NULL
      AND c1.status != 'deleted'
      AND c2.status != 'deleted'
      AND (1 - (c1.embedding <=> c2.embedding)) > min_similarity
  ),
  topic_groups AS (
    SELECT 
      ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as topic_cluster,
      COUNT(*) as content_count,
      ARRAY_AGG(DISTINCT title1) as sample_titles
    FROM content_similarities
    GROUP BY id1
    HAVING COUNT(*) > 1
  )
  SELECT * FROM topic_groups
  ORDER BY content_count DESC
  LIMIT 10;
END;
$$;