// Basic content processing for Otto
// Start small - just extract text and filter recent items

/**
 * Clean HTML content to extract readable text
 */
const cleanHtmlContent = (htmlContent) => {
  if (!htmlContent || typeof htmlContent !== 'string') return '';
  
  // Remove HTML tags and decode entities
  let cleanText = htmlContent
    .replace(/<script[^>]*>.*?<\/script>/gis, '') // Remove scripts
    .replace(/<style[^>]*>.*?<\/style>/gis, '') // Remove styles
    .replace(/<[^>]*>/g, ' ') // Remove all HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Decode common entities
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return cleanText;
};

/**
 * Extract text content from bookmarks or insights
 */
const extractTextContent = (item) => {
  if (item.type === 'bookmark') {
    // Bookmarks: try different content fields based on actual storage structure
    const rawContent = item.content || item.text || item.preview || '';
    
    console.log(`🔍 Extracting from bookmark:`, {
      id: item.id,
      title: item.title,
      hasContent: !!item.content,
      hasText: !!item.text,
      hasPreview: !!item.preview,
      usingField: item.content ? 'content' : item.text ? 'text' : item.preview ? 'preview' : 'none',
      rawLength: rawContent.length,
      allKeys: Object.keys(item)
    });
    
    if (!rawContent) {
      console.warn(`⚠️ No content found in bookmark: ${item.title}`);
      return '';
    }
    
    // If it's already plain text (from 'text' field), return as-is
    // If it's HTML (from 'content' field), clean it
    const isHtml = rawContent.includes('<') && rawContent.includes('>');
    const cleanText = isHtml ? cleanHtmlContent(rawContent) : rawContent;
    
    console.log(`🧹 Content extraction: ${rawContent.length} chars → ${cleanText.length} chars (${isHtml ? 'HTML→text' : 'text→text'})`);
    return cleanText;
  } else {
    // Insights: combine summary, takeaways, and significance (no questions)
    // Try both 'content' field (new format) and 'insight_data' field (database format)
    const content = item.content || item.insight_data || {};
    const textParts = [
      content.summary,
      content.takeaways?.join(' '),
      content.significance
    ].filter(Boolean); // Remove empty/undefined parts
    
    console.log(`🔍 Insight content extraction for "${item.title}":`, {
      hasContent: !!item.content,
      hasInsightData: !!item.insight_data,
      usingField: item.content ? 'content' : item.insight_data ? 'insight_data' : 'none',
      textPartsFound: textParts.length,
      summaryLength: content.summary?.length || 0,
      takeawaysCount: content.takeaways?.length || 0
    });
    
    if (textParts.length === 0) {
      // Fallback to other available fields if insight structure is missing
      const fallbackText = item.content_text || item.text || item.preview || item.title || '';
      console.warn(`⚠️ No standard insight content found for "${item.title}", using fallback: ${fallbackText.substring(0, 100)}...`);
      return fallbackText;
    }
    
    return textParts.join(' ');
  }
};

/**
 * Get recent content (last 30 days by default)
 */
const getRecentContent = (allItems, days = 30) => {
  const timeWindow = Date.now() - (days * 24 * 60 * 60 * 1000);
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  
  console.log('⏰ getRecentContent() - Timestamp filtering:');
  console.log(`  Days filter: ${days} days`);
  console.log(`  Current time: ${now.toISOString()}`);
  console.log(`  Cutoff date: ${cutoffDate.toISOString()}`);
  console.log(`  Time window (ms): ${timeWindow}`);
  console.log(`  Total items to filter: ${allItems.length}`);
  
  // Count by type before filtering
  const bookmarksBefore = allItems.filter(item => item.type === 'bookmark');
  const insightsBefore = allItems.filter(item => !item.type || item.type === 'insight');
  console.log(`  Before timestamp filter - Bookmarks: ${bookmarksBefore.length}, Insights: ${insightsBefore.length}`);
  
  // Show timestamp details for first few items
  allItems.slice(0, 3).forEach((item, index) => {
    const itemDate = new Date(item.timestamp);
    const isRecent = item.timestamp > timeWindow;
    console.log(`  Item ${index + 1}: "${item.title}" (${item.type || 'insight'})`);
    console.log(`    Timestamp: ${item.timestamp} (${itemDate.toISOString()})`);
    console.log(`    Is recent: ${isRecent}`);
  });
  
  const recentItems = allItems.filter(item => item.timestamp > timeWindow);
  
  // Count by type after filtering
  const bookmarksAfter = recentItems.filter(item => item.type === 'bookmark');
  const insightsAfter = recentItems.filter(item => !item.type || item.type === 'insight');
  console.log(`  After timestamp filter - Recent items: ${recentItems.length}`);
  console.log(`    Bookmarks: ${bookmarksAfter.length}, Insights: ${insightsAfter.length}`);
  
  return recentItems.map(item => ({
    id: item.id,
    title: item.title,
    type: item.type || 'insight',
    text: extractTextContent(item),
    timestamp: item.timestamp,
    source: item.source?.url || 'unknown'
  }));
};

/**
 * Estimate tokens for text content (more accurate than simple division)
 * Based on Claude/OpenAI tokenization patterns
 */
const estimateTokens = (text) => {
  if (!text || typeof text !== 'string') return 0;
  
  // More sophisticated estimation than simple character count
  // Account for:
  // - Average 3.5-4 chars per token for English text
  // - Punctuation and spaces
  // - HTML markup (if present)
  
  // Remove HTML tags for more accurate estimation
  const cleanText = text.replace(/<[^>]*>/g, '');
  
  // Split by spaces and punctuation to get word-like tokens
  const words = cleanText.split(/\s+/).filter(word => word.length > 0);
  
  // Estimate tokens: shorter words ≈ 1 token, longer words ≈ 1.5+ tokens
  const tokenEstimate = words.reduce((total, word) => {
    if (word.length <= 4) return total + 1;
    if (word.length <= 8) return total + 1.5;
    return total + 2;
  }, 0);
  
  // Add overhead for punctuation and formatting
  const finalEstimate = Math.ceil(tokenEstimate * 1.1);
  
  console.log(`📊 Token estimation for ${cleanText.length} chars: ~${finalEstimate} tokens`);
  return finalEstimate;
};

/**
 * Process content in chunks that fit within API token limits
 */
const processContentInChunks = (allItems, maxTokensPerChunk = 50000) => {
  console.log('🔄 Processing content in chunks...');
  console.log(`  Max tokens per chunk: ${maxTokensPerChunk}`);
  
  let currentChunk = [];
  let currentTokens = 0;
  const chunks = [];
  
  for (const item of allItems) {
    const itemTokens = estimateTokens(item.text);
    
    console.log(`  Item "${item.title}": ${itemTokens} tokens`);
    
    // If adding this item would exceed the limit, start a new chunk
    if (currentTokens + itemTokens > maxTokensPerChunk && currentChunk.length > 0) {
      console.log(`  📦 Chunk ${chunks.length + 1} complete: ${currentChunk.length} items, ~${currentTokens} tokens`);
      chunks.push({
        items: currentChunk,
        tokenCount: currentTokens,
        itemCount: currentChunk.length
      });
      
      currentChunk = [item];
      currentTokens = itemTokens;
    } else {
      currentChunk.push(item);
      currentTokens += itemTokens;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    console.log(`  📦 Final chunk ${chunks.length + 1}: ${currentChunk.length} items, ~${currentTokens} tokens`);
    chunks.push({
      items: currentChunk,
      tokenCount: currentTokens,
      itemCount: currentChunk.length
    });
  }
  
  console.log(`✅ Content split into ${chunks.length} chunks`);
  return chunks;
};

/**
 * Generate lightweight summary for overview purposes
 */
const generateContentSummary = (item) => {
  let preview = '';
  
  console.log(`🔍 Generating summary for "${item.title}" (type: ${item.type})`);
  
  if (item.type === 'bookmark') {
    // Use existing preview or generate from clean content
    if (item.preview && item.preview.length > 50) {
      preview = item.preview;
      console.log(`📝 Using existing preview: ${preview.length} chars`);
    } else {
      // Use the already-cleaned text passed from processUserContent
      const cleanText = item.cleanText || item.text || cleanHtmlContent(item.content);
      preview = cleanText.substring(0, 300) + (cleanText.length > 300 ? '...' : '');
      console.log(`📝 Generated from clean content: ${cleanText.length} → ${preview.length} chars`);
    }
  } else {
    // For insights, use summary or combine key parts
    const content = item.content;
    if (content && content.summary) {
      preview = content.summary.substring(0, 300) + (content.summary.length > 300 ? '...' : '');
      console.log(`📝 Using insight summary: ${preview.length} chars`);
    } else {
      preview = [
        content?.takeaways?.slice(0, 2).join('. '),
        content?.significance?.substring(0, 200)
      ].filter(Boolean).join('. ');
      console.log(`📝 Generated from insight parts: ${preview.length} chars`);
    }
  }
  
  if (!preview || preview.length === 0) {
    preview = `${item.title} - Content preview not available`;
    console.log(`⚠️ Fallback preview used for "${item.title}"`);
  }
  
  return {
    id: item.id,
    title: item.title,
    type: item.type || 'insight',
    preview: preview,
    timestamp: item.timestamp,
    source: item.source?.url || 'unknown',
    // Keep reference to full item for deep-dive retrieval
    hasFullContent: true
  };
};

/**
 * Process user content for AI consumption using summary-first approach
 */
const processUserContent = (allItems, options = {}) => {
  const { days = 30, useFullContent = false } = options;
  
  const recentItems = getRecentContent(allItems, days);
  
  if (useFullContent) {
    // Deep-dive mode: return full content for specific items
    console.log('🔍 Deep-dive mode: returning full content');
    return {
      items: recentItems,
      count: recentItems.length,
      timeframe: `${days} days`,
      processedAt: new Date().toISOString(),
      mode: 'full_content'
    };
  } else {
    // Overview mode: return lightweight summaries
    console.log('📋 Overview mode: generating content summaries');
    const summaries = recentItems.map(item => {
      // Pass the processed item with clean text, not the original
      const summary = generateContentSummary({
        ...item,
        cleanText: item.text // The already-cleaned text from getRecentContent
      });
      console.log(`📄 Summary for "${item.title}": ${summary.preview.length} chars`);
      return summary;
    });
    
    const totalPreviewTokens = summaries.reduce((total, summary) => {
      return total + estimateTokens(summary.preview);
    }, 0);
    
    console.log(`📊 Total preview tokens: ~${totalPreviewTokens} (much lighter than full content)`);
    
    return {
      items: summaries,
      count: summaries.length,
      timeframe: `${days} days`,
      processedAt: new Date().toISOString(),
      mode: 'summary',
      totalPreviewTokens,
      // Keep reference to original items for follow-up queries
      fullItems: recentItems
    };
  }
};

module.exports = {
  extractTextContent,
  getRecentContent,
  processUserContent,
  estimateTokens,
  processContentInChunks,
  cleanHtmlContent,
  generateContentSummary
};