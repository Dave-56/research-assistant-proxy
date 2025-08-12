require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');

// Import Supabase routes
const { router: authRoutes, requireAuth } = require('./supabase/auth-routes');
const storageRoutes = require('./supabase/storage-routes');
const SupabaseStorageService = require('./supabase/storage-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase storage service
const supabaseStorage = new SupabaseStorageService();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Add OPENAI_API_KEY=your_key_here to your .env file
});

// Configure CORS to allow requests from Chrome extensions
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from Chrome extensions (they have chrome-extension:// protocol)
    if (!origin || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Increase limit for large content

// Trust proxy headers when running in production (required for Render)
// Set to the specific number of proxies between the server and the client
// For Render, this is typically 1
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Use the first IP in X-Forwarded-For when behind proxy
  keyGenerator: (req) => {
    if (process.env.NODE_ENV === 'production') {
      // In production, use the X-Forwarded-For header
      return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
             req.connection.remoteAddress || 
             'unknown';
    }
    // In development, use the default
    return req.ip;
  },
  // Skip rate limiting in development
  skip: () => process.env.NODE_ENV === 'development'
});

app.use('/api/', limiter);

// Register Supabase routes
app.use('/auth', authRoutes);
app.use('/api/storage', storageRoutes);

// Embedding generation functions
async function generateEmbedding(text) {
  try {
    const truncatedText = text.substring(0, 8000);
    console.log(`🔍 Generating embedding for ${text.length} chars (truncated to ${truncatedText.length})`);
    console.log(`📝 Text preview: "${truncatedText.substring(0, 200)}..."`);
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small", // More cost-effective than ada-002
      input: truncatedText
    });
    
    const embedding = response.data[0].embedding;
    console.log(`✅ Embedding generated successfully: ${embedding.length} dimensions`);
    console.log(`📊 First 5 embedding values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    return embedding;
    
  } catch (error) {
    console.error('❌ Embedding generation error:', error.message);
    if (error.response) {
      console.error('❌ OpenAI API Response:', error.response.status, error.response.data);
    }
    return null;
  }
}

// Cosine similarity calculation
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB) {
    console.log(`⚠️ Cosine similarity: Missing vectors (vecA: ${!!vecA}, vecB: ${!!vecB})`);
    return 0;
  }
  
  if (vecA.length !== vecB.length) {
    console.log(`⚠️ Cosine similarity: Vector length mismatch (${vecA.length} vs ${vecB.length})`);
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  
  // Log similarity calculation details occasionally for debugging
  if (Math.random() < 0.1) { // 10% of the time
    console.log(`🔍 Similarity calc: dotProduct=${dotProduct.toFixed(4)}, normA=${Math.sqrt(normA).toFixed(4)}, normB=${Math.sqrt(normB).toFixed(4)}, result=${similarity.toFixed(4)}`);
  }
  
  return similarity;
}

// Semantic content matching
async function findSemanticMatches(userQuery, allItems) {
  try {
    console.log(`\n🔍 === SEMANTIC SEARCH START ===`);
    console.log(`Query: "${userQuery}"`);
    console.log(`Total items to search: ${allItems.length}`);
    
    // Check how many items have embeddings
    const itemsWithEmbeddings = allItems.filter(item => item.embedding);
    console.log(`Items with embeddings: ${itemsWithEmbeddings.length}/${allItems.length}`);
    
    if (itemsWithEmbeddings.length === 0) {
      console.log(`⚠️ No items have embeddings! Need to generate embeddings first.`);
      console.log(`📝 Sample item structure:`, JSON.stringify(allItems[0], null, 2));
      return allItems.slice(0, 3); // Fallback to recent items
    }
    
    // Generate embedding for user query
    console.log(`🔄 Generating query embedding...`);
    const queryEmbedding = await generateEmbedding(userQuery);
    if (!queryEmbedding) {
      console.log('❌ Query embedding failed, falling back to recent items');
      return allItems.slice(0, 3);
    }
    
    console.log(`✅ Query embedding generated successfully`);
    
    // Calculate similarity with all content embeddings
    console.log(`🔄 Calculating similarities...`);
    const matches = itemsWithEmbeddings.map((item, index) => {
      const similarity = cosineSimilarity(queryEmbedding, item.embedding);
      
      if (index < 5) { // Log first 5 for debugging
        console.log(`  Item ${index + 1}: "${item.title}" → similarity: ${similarity.toFixed(4)}`);
      }
      
      return {
        ...item,
        similarity: similarity
      };
    }).sort((a, b) => b.similarity - a.similarity);
    
    console.log(`\n📊 TOP SEMANTIC MATCHES:`);
    matches.slice(0, 5).forEach((match, i) => {
      console.log(`  ${i + 1}. "${match.title}"`);
      console.log(`     Similarity: ${match.similarity.toFixed(4)}`);
      console.log(`     Type: ${match.type}`);
      console.log(`     Has embedding: ${!!match.embedding}`);
    });
    
    const topMatches = matches.slice(0, 3);
    console.log(`\n✅ Returning top ${topMatches.length} matches`);
    console.log(`🔍 === SEMANTIC SEARCH END ===\n`);
    
    return topMatches;
    
  } catch (error) {
    console.error('❌ Semantic search error:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.log(`🔍 === SEMANTIC SEARCH ERROR END ===\n`);
    return allItems.slice(0, 3); // Fallback to recent items
  }
}

// In-memory cache for embeddings (in production, use Redis or database)
const embeddingCache = new Map();

// Background embedding generation with caching
async function generateEmbeddingsInBackground(allItems) {
  console.log(`\n🔄 === BACKGROUND EMBEDDING GENERATION START ===`);
  console.log(`Processing ${allItems.length} items for embeddings...`);
  
  const { generateContentSummary } = require('./content-processing/basic-processor');
  
  let successCount = 0;
  let cachedCount = 0;
  let errorCount = 0;
  
  try {
    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      
      // Check if we already have embedding for this item
      const cacheKey = `${item.id}_${item.timestamp}`;
      if (embeddingCache.has(cacheKey)) {
        console.log(`💾 Using cached embedding for "${item.title}"`);
        // Add embedding to item for future use
        item.embedding = embeddingCache.get(cacheKey);
        cachedCount++;
        continue;
      }
      
      try {
        console.log(`🔄 Generating embedding ${i + 1}/${allItems.length}: "${item.title}"`);
        
        // Extract proper text content using the same function as search
        const { extractTextContent } = require('./content-processing/basic-processor');
        const cleanText = extractTextContent(item);
        
        // Generate summary for embedding
        const summary = generateContentSummary({
          ...item,
          cleanText: cleanText
        });
        
        // Create searchable text
        const searchableText = `${item.title} ${summary.preview}`;
        
        // Generate embedding
        const embedding = await generateEmbedding(searchableText);
        
        if (embedding) {
          // Cache the embedding
          embeddingCache.set(cacheKey, embedding);
          
          // Add embedding to item
          item.embedding = embedding;
          item.searchableText = searchableText;
          
          successCount++;
          console.log(`✅ Embedding cached for "${item.title}"`);
        } else {
          errorCount++;
          console.log(`❌ Failed to generate embedding for "${item.title}"`);
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error processing "${item.title}":`, error.message);
        errorCount++;
      }
    }
    
    console.log(`✅ Background embedding generation complete:`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Cached: ${cachedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Total processed: ${successCount + cachedCount + errorCount}/${allItems.length}`);
    console.log(`🔄 === BACKGROUND EMBEDDING GENERATION END ===\n`);
    
    return {
      success: successCount + cachedCount,
      total: allItems.length,
      cached: cachedCount,
      errors: errorCount
    };
    
  } catch (error) {
    console.error('❌ Background embedding generation failed:', error);
    return {
      success: successCount + cachedCount,
      total: allItems.length,
      cached: cachedCount,
      errors: errorCount + 1
    };
  }
}

// Helper function for AI API calls
async function generateAISummary(prompt, maxTokens = 400) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      
      let userFriendlyMessage = 'I\'m having a moment. Please try again - I\'m ready to help!';
      try {
        const errorData = JSON.parse(error);
        if (errorData.error?.type === 'rate_limit_error') {
          userFriendlyMessage = 'I\'m processing your content! Give me a moment and try again.';
        } else if (errorData.error?.message?.includes('token')) {
          userFriendlyMessage = 'This content is rich! Try breaking it into smaller parts.';
        }
      } catch (e) {}
      
      return { 
        success: false, 
        error: userFriendlyMessage,
        details: process.env.NODE_ENV === 'development' ? error : undefined
      };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim();

    if (!text) {
      return { success: false, error: 'No summary generated' };
    }

    return { success: true, text };
    
  } catch (error) {
    console.error('AI summary generation error:', error);
    return { 
      success: false, 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
}

// Root endpoint - API information
app.get('/', (req, res) => {
  res.json({
    name: 'Research Assistant Proxy API',
    version: '1.0.0',
    status: 'online',
    message: 'API server for Research Assistant Chrome Extension',
    documentation: {
      health: 'GET /health - Health check endpoint',
      summary: 'POST /api/summary - Generate AI summaries',
      chat: 'POST /api/chat - Chat with AI assistant',
      recentContent: 'POST /api/recent-content - Analyze recent saved content',
      contentSearch: 'POST /api/content-search - Search through saved content',
      classification: 'POST /api/classify-conversation - Classify conversation intent'
    },
    repository: 'https://github.com/Dave-56/research-assistant-proxy',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Research Assistant Proxy is running' });
});

// Configuration status endpoint (for debugging)
app.get('/api/config-status', (req, res) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'not set',
    configured: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      supabaseUrl: !!process.env.SUPABASE_URL,
      supabaseKey: !!process.env.SUPABASE_ANON_KEY,
      port: process.env.PORT || 3000
    },
    supabase: {
      url: process.env.SUPABASE_URL ? 'configured' : 'missing',
      hasAnonKey: !!process.env.SUPABASE_ANON_KEY
    }
  });
});

// AI Summary endpoint
app.post('/api/summary', async (req, res) => {
  try {
    const { content, pageTitle, pageUrl, type = 'summary', structuredTabs } = req.body;

    if (!content && !structuredTabs) {
      return res.status(400).json({ error: 'Content or structuredTabs is required' });
    }

    // Determine which prompt to use based on type
    let prompt;
    let maxTokens = 300; // Default for summary
    
    if (type === 'multi-tab-summary') {
      if (!structuredTabs) {
        return res.status(400).json({ error: 'structuredTabs is required for multi-tab-summary' });
      }
      
      const tabCount = Object.values(structuredTabs).reduce((sum, tabs) => sum + tabs.length, 0);
      const domainCount = Object.keys(structuredTabs).length;
      
      prompt = `Analyze and summarize this browsing session with ${tabCount} tabs across ${domainCount} domains. Create a cohesive summary that identifies themes, patterns, and key insights across all tabs.\n\n`;
      
      for (const [domain, tabs] of Object.entries(structuredTabs)) {
        prompt += `\n**${domain}** (${tabs.length} tab${tabs.length > 1 ? 's' : ''}):\n`;
        tabs.forEach((tab, index) => {
          prompt += `${index + 1}. "${tab.title}"\n`;
          prompt += `   Key content: ${tab.content}\n`;
          if (tab.topics && tab.topics.length > 0) {
            prompt += `   Topics: ${tab.topics.join(', ')}\n`;
          }
          prompt += '\n';
        });
      }
      
      prompt += `\nProvide a unified summary that:
1. Identifies the main themes across all tabs
2. Highlights connections between different domains/tabs
3. Summarizes the key information from each domain
4. Keeps the summary concise but informative (2-3 paragraphs max)

Format the response with clear sections and use **bold** for emphasis where appropriate.`;
      
      maxTokens = 400; // Slightly more for multi-tab summaries
    } else if (type === 'tldr') {
      maxTokens = 1200; // More tokens for detailed TL;DR
      prompt = `You're an expert communicator helping me make sense of dense or formal text.

Your job is to extract meaning and make it easy to scan and understand.
I want two things:

Quick Summary:
• In 2–3 sentences, explain the main idea and why it matters
• Focus on the "so what" — what's changing, or what's the big takeaway?
• Keep it clear, casual, and easy on the eyes

Key Points:
• Give me 4–6 bullet points with the most important facts or takeaways
• Use bold for names, dates, numbers, and key terms
• Be specific and concrete — avoid vague summaries
• Write in plain, natural language — like you're explaining to a smart friend
• Skip fluff or jargon; focus on what actually matters

CRITICAL Guidelines:
• Don't use corporate-speak or abstract words like "landscape," "emergence," or "transformation"
• No tables — just clean bullet points and a natural summary
• Prioritize what the reader needs to know right away
• NEVER add meta-commentary like "Note:", "The article appears to be", or "this may be"
• DO NOT comment on dates, URLs, or technical details unless they're central to the content
• Focus ONLY on summarizing the actual content - no editorial comments about the source
• If you want to suggest saving it, use "💡 Tip:" format only

Content to summarize:
${content.substring(0, 4000)}${content.length > 4000 ? '...' : ''}

Generate the TL;DR:`;
    } else {
      prompt = `Please provide a concise 2-3 sentence summary of this web page content.

Page Title: ${pageTitle}
Domain: ${pageUrl ? new URL(pageUrl).hostname : ''}

Content:
${content.substring(0, 4000)}${content.length > 4000 ? '...' : ''}

Summary:`;
    }

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      let userFriendlyMessage = 'I\'m having a moment. Please try again!';
      try {
        const errorData = JSON.parse(error);
        if (errorData.error?.type === 'rate_limit_error') {
          userFriendlyMessage = 'I\'m working through your content! Give me a moment and try again.';
        } else if (errorData.error?.message?.includes('token')) {
          userFriendlyMessage = 'You have so much content! Try focusing on specific pages or topics.';
        }
      } catch (e) {}
      
      return res.status(response.status).json({ 
        error: userFriendlyMessage,
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }

    const data = await response.json();
    const summary = data.content?.[0]?.text?.trim();

    if (!summary) {
      return res.status(500).json({ error: 'No summary generated' });
    }

    res.json({ 
      success: true, 
      summary,
      type
    });

  } catch (error) {
    console.error('Summary generation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Recent content endpoint for /recent command
app.post('/api/recent-content', async (req, res) => {
  try {
    const { allItems, days = 30 } = req.body;

    if (!allItems || !Array.isArray(allItems)) {
      return res.status(400).json({ error: 'allItems array is required' });
    }

    // Import our basic processor
    const { processUserContent } = require('./content-processing/basic-processor');
    
    // Process the user's content using summary-first approach
    const processedContent = processUserContent(allItems, { days }); // Default to summary mode
    
    if (processedContent.count === 0) {
      return res.json({
        success: true,
        summary: `You haven't saved any pages or insights in the last ${days} days. Try saving some interesting content to get personalized insights!`,
        itemCount: 0,
        timeframe: `${days} days`
      });
    }

    console.log(`📊 Processing ${processedContent.count} items in ${processedContent.mode} mode`);

    // Create lightweight overview using previews/summaries
    const contentSummaries = processedContent.items
      .map(item => `**${item.title}** (${item.type}): ${item.preview}`)
      .join('\n\n');

    const prompt = `The user asked "What have I been reading lately?" - give them a helpful overview of their recent reading content.

Recent content (${processedContent.count} items from last ${days} days):

${contentSummaries}

Provide a helpful response that:
1. Lists ALL the main topics/articles they've been reading 
2. Identifies the different subject areas clearly
3. Keeps it informative and direct
4. Ends with an offer to dig deeper: "Want me to explore any specific topic in detail? I have the full content available."
5. Keep it concise but comprehensive (2-3 paragraphs covering all topics)
6. Avoid personal questions about their interests - just present what's available`;

    console.log(`🔍 DEBUG: Prompt length: ${prompt.length} chars`);
    console.log(`🔍 DEBUG: Content summaries length: ${contentSummaries.length} chars`);
    console.log(`🔍 DEBUG: Estimated tokens: ~${processedContent.totalPreviewTokens}`);

    const summary = await generateAISummary(prompt);

    if (!summary.success) {
      return res.status(500).json({ 
        error: summary.error || 'Failed to analyze recent content'
      });
    }

    // Start background embedding generation (don't await - let it run async)
    generateEmbeddingsInBackground(processedContent.fullItems || allItems)
      .then(result => {
        console.log(`✅ Background embedding generation completed: ${result.success}/${result.total} items`);
      })
      .catch(error => {
        console.error('❌ Background embedding generation failed:', error.message);
      });

    res.json({ 
      success: true, 
      summary: summary.text,
      itemCount: processedContent.count,
      timeframe: processedContent.timeframe,
      processedAt: processedContent.processedAt,
      mode: processedContent.mode,
      totalPreviewTokens: processedContent.totalPreviewTokens,
      approach: 'summary-first',
      embeddingsStatus: 'generating-in-background'
    });

  } catch (error) {
    console.error('Recent content analysis error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Conversation classification endpoint
app.post('/api/classify-conversation', async (req, res) => {
  try {
    const { 
      userMessage, 
      conversationHistory = [], 
      currentPageContext = null,
      openTabs = [],
      referencedTabs = []
    } = req.body;
    
    if (!userMessage) {
      return res.status(400).json({ error: 'userMessage is required' });
    }

    console.log(`🧠 Conversation classification request: "${userMessage}"`);

    const { classifyConversationContext, quickClassificationCheck } = require('./content-processing/conversation-classifier');
    
    // Try quick classification first
    const quickResult = quickClassificationCheck(userMessage);
    if (quickResult) {
      console.log(`⚡ Quick classification: ${quickResult.classification}`);
      return res.json({
        success: true,
        classification: quickResult.classification,
        confidence: quickResult.confidence,
        reason: quickResult.reason,
        method: quickResult.method
      });
    }

    // Use full LLM classification with enhanced context
    const result = await classifyConversationContext(
      userMessage, 
      conversationHistory, 
      currentPageContext,
      openTabs,
      referencedTabs
    );
    
    res.json({
      success: true,
      classification: result.classification,
      confidence: result.confidence,
      reason: result.reason,
      targetTab: result.targetTab,
      isMetaConversation: result.isMetaConversation,
      metaContext: result.metaContext,
      method: result.method
    });

  } catch (error) {
    console.error('❌ Classification endpoint error:', error);
    res.status(500).json({ 
      error: 'Classification failed',
      details: error.message 
    });
  }
});

// Content search endpoint for follow-up queries
app.post('/api/content-search', async (req, res) => {
  try {
    const { query, allItems, days = 30 } = req.body;

    if (!query || !allItems || !Array.isArray(allItems)) {
      return res.status(400).json({ error: 'Query and allItems array are required' });
    }

    console.log(`🔍 Content search request: "${query}"`);

    // Import our basic processor
    const { processUserContent } = require('./content-processing/basic-processor');
    
    // Get recent items and add cached embeddings
    const recentContent = processUserContent(allItems, { days, useFullContent: false });
    
    if (recentContent.count === 0) {
      return res.json({
        success: true,
        message: `No content found from last ${days} days.`,
        matches: [],
        itemCount: 0
      });
    }

    // Add cached embeddings to items
    const itemsWithCachedEmbeddings = (recentContent.fullItems || recentContent.items).map(item => {
      const cacheKey = `${item.id}_${item.timestamp}`;
      if (embeddingCache.has(cacheKey)) {
        return {
          ...item,
          embedding: embeddingCache.get(cacheKey)
        };
      }
      return item;
    });

    console.log(`📊 Content search: ${itemsWithCachedEmbeddings.filter(item => item.embedding).length}/${itemsWithCachedEmbeddings.length} items have embeddings`);

    // Find semantically relevant content
    const matches = await findSemanticMatches(query, itemsWithCachedEmbeddings);
    
    if (matches.length === 0) {
      return res.json({
        success: true,
        message: "I couldn't find specific content matching your query. Could you try rephrasing or asking about a different topic?",
        matches: [],
        itemCount: 0,
        suggestion: "Did you mean to ask about the current page instead? I can help discuss what you're currently reading."
      });
    }

    // Use LLM to intelligently determine which articles to include based on query intent
    const { analyzeQueryIntent } = require('./content-processing/query-intent-analyzer');
    
    let articlesToInclude;
    try {
      // Use LLM intent analysis for intelligent article selection
      articlesToInclude = await analyzeQueryIntent(query, matches);
    } catch (error) {
      console.error('Intent analysis failed, using fallback:', error.message);
      // Fallback to simple selection if LLM fails
      articlesToInclude = [matches[0]];
    }
    
    console.log(`📎 Selected ${articlesToInclude.length} article(s) for analysis based on query intent`);

    // Get full content for selected items only
    const fullContentMatches = processUserContent(articlesToInclude, { useFullContent: true });
    
    // Import the content processing functions
    const { extractTextContent } = require('./content-processing/basic-processor');
    
    // Create content text for AI analysis
    const contentText = fullContentMatches.items
      .map((item, index) => {
        const text = extractTextContent(item);
        return `**Article ${index + 1}: ${item.title}**\n${text}`;
      })
      .join('\n\n---\n\n');

    const prompt = `User question: "${query}"

Relevant content found:

${contentText}

Please provide a clear, conversational response that reads naturally. Write it like you're explaining to a smart colleague - informative but not robotic.

Guidelines:
- Connect the facts into a cohesive narrative that tells the complete story
- Use smooth transitions between ideas, not just bullet points
- Keep paragraphs short and readable
- When referencing sources, use natural phrases like "Based on the TechCrunch article about..." or "According to what you saved about..."
- Avoid formal citations like "Article 1" or "From Article 2" - weave sources naturally into the narrative
- End with a thoughtful question or offer to explore specific aspects
- Aim for a friendly, knowledgeable tone - like a helpful research assistant

Avoid:
- Disconnected bullet points that feel like notes
- Overly formal or academic language
- Listing facts without showing how they relate
- Generic summaries - be specific and insightful`;

    console.log(`📊 Deep-dive analysis: ${matches.length} matches, ~${contentText.length} chars`);

    const summary = await generateAISummary(prompt, 800); // More tokens for detailed response

    if (!summary.success) {
      return res.status(500).json({ 
        error: summary.error || 'Failed to analyze content'
      });
    }

    res.json({ 
      success: true, 
      response: summary.text,
      matches: matches.map(m => ({
        title: m.title,
        type: m.type,
        similarity: m.similarity?.toFixed(3) || 'N/A',
        timestamp: m.timestamp
      })),
      itemCount: matches.length,
      approach: 'semantic-search'
    });

  } catch (error) {
    console.error('Content search error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Generate embeddings for existing content (one-time setup)
app.post('/api/generate-embeddings', async (req, res) => {
  try {
    const { allItems } = req.body;

    if (!allItems || !Array.isArray(allItems)) {
      return res.status(400).json({ error: 'allItems array is required' });
    }

    console.log(`🔄 Generating embeddings for ${allItems.length} items...`);

    const { generateContentSummary } = require('./content-processing/basic-processor');
    
    // Process items and generate embeddings
    const itemsWithEmbeddings = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      try {
        console.log(`\n🔄 Processing item ${i + 1}/${allItems.length}: "${item.title}"`);
        
        // Extract proper text content using the same function as search
        const { extractTextContent } = require('./content-processing/basic-processor');
        const cleanText = extractTextContent(item);
        
        // Generate summary for embedding
        const summary = generateContentSummary({
          ...item,
          cleanText: cleanText
        });
        
        console.log(`📝 Summary generated: ${summary.preview.length} chars`);
        
        // Create searchable text
        const searchableText = `${item.title} ${summary.preview}`;
        console.log(`🔍 Searchable text: ${searchableText.length} chars`);
        console.log(`📄 Searchable preview: "${searchableText.substring(0, 150)}..."`);
        
        // Generate embedding
        const embedding = await generateEmbedding(searchableText);
        
        if (embedding) {
          itemsWithEmbeddings.push({
            ...item,
            embedding: embedding,
            searchableText: searchableText
          });
          successCount++;
          console.log(`✅ Embedding added for "${item.title}"`);
        } else {
          itemsWithEmbeddings.push(item); // Keep original item without embedding
          errorCount++;
          console.log(`❌ No embedding for "${item.title}"`);
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ Error processing item "${item.title}":`, error.message);
        itemsWithEmbeddings.push(item); // Keep original item
        errorCount++;
      }
    }

    console.log(`✅ Embedding generation complete: ${successCount} success, ${errorCount} errors`);

    res.json({
      success: true,
      message: `Generated embeddings for ${successCount} items (${errorCount} errors)`,
      items: itemsWithEmbeddings,
      stats: {
        total: allItems.length,
        success: successCount,
        errors: errorCount
      }
    });

  } catch (error) {
    console.error('Embedding generation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { prompt, conversationHistory = [], maxTokens = 300 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Build messages array with conversation history
    const messages = [];
    
    // Add conversation history if provided
    if (conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }
    
    // Add current prompt
    messages.push({ role: 'user', content: prompt });

    // Call Anthropic API
    console.log('🔑 API Key exists:', !!process.env.ANTHROPIC_API_KEY);
    console.log('🔑 API Key preview:', process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 20) + '...' : 'NOT SET');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-1-20250805',
        max_tokens: maxTokens,
        messages: messages
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      
      // Parse error for rate limit issues
      let userFriendlyMessage = 'Something went wrong. Please try again.';
      try {
        const errorData = JSON.parse(error);
        if (errorData.error?.type === 'rate_limit_error') {
          userFriendlyMessage = 'I\'m analyzing a lot of your content right now! Give me a moment to catch up, then try again. You can also ask about specific topics to get faster responses.';
        } else if (errorData.error?.message) {
          // Extract key information without technical details
          if (errorData.error.message.includes('token')) {
            userFriendlyMessage = 'You have so much great content! Try asking about specific topics or time periods to help me give you the best insights.';
          } else {
            userFriendlyMessage = 'I\'m having a moment. Please try again - I\'m ready to help!';
          }
        }
      } catch (e) {
        // If error parsing fails, use generic message
      }
      
      return res.status(response.status).json({ 
        error: userFriendlyMessage,
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }

    const data = await response.json();
    const aiResponse = data.content?.[0]?.text?.trim();

    if (!aiResponse) {
      return res.status(500).json({ error: 'No response generated' });
    }

    res.json({ 
      success: true, 
      response: aiResponse
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Demo data seeding endpoint
app.post('/api/demo/seed', requireAuth, async (req, res) => {
  try {
    console.log('🌱 Seeding demo data for user:', req.user.id);
    
    // Sample demo content
    const demoBrowsingData = [
      {
        title: "AI Safety Research 2025: Key Breakthrough in Constitutional AI",
        content: "Recent developments in constitutional AI have shown remarkable progress in alignment research. Anthropic's latest paper demonstrates how AI systems can be trained to follow human values through constitutional training methods. The research shows that AI models can learn to be helpful, harmless, and honest through iterative refinement processes. This represents a significant step forward in making AI systems safer and more aligned with human intentions. Key findings include improved robustness in edge cases, better calibration of uncertainty, and enhanced ability to refuse harmful requests while remaining helpful for legitimate use cases.",
        url: "https://anthropic.com/research/constitutional-ai-2025",
        timestamp: Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days ago
        type: 'insight'
      },
      {
        title: "The Future of Remote Work: Trends Shaping 2025",
        content: "Remote work continues to evolve with new technologies and changing workplace expectations. Companies are adopting hybrid models that blend in-person collaboration with flexible remote work arrangements. Key trends include the rise of virtual reality meetings, AI-powered productivity tools, and new approaches to company culture in distributed teams. Research shows that employees value flexibility above traditional benefits, leading to fundamental shifts in how organizations attract and retain talent. The article explores best practices for remote team management, communication strategies, and the technology infrastructure needed to support distributed workforces effectively.",
        url: "https://example.com/future-remote-work-2025",
        timestamp: Date.now() - (5 * 24 * 60 * 60 * 1000), // 5 days ago
        type: 'insight'
      }
    ];
    
    // Save demo bookmarks to Supabase
    let seededCount = 0;
    for (const demoItem of demoBrowsingData) {
      try {
        const result = await supabaseStorage.saveContent(req.user.id, {
          title: demoItem.title,
          content: demoItem.content,
          preview: demoItem.content.substring(0, 200) + '...',
          timestamp: demoItem.timestamp,
          type: demoItem.type,
          source: {
            url: demoItem.url,
            hostname: new URL(demoItem.url).hostname,
            title: demoItem.title
          },
          status: 'active'
        });
        
        if (result.success) {
          seededCount++;
          console.log(`✅ Seeded demo item: ${demoItem.title}`);
        } else {
          console.warn(`⚠️ Failed to seed demo item: ${demoItem.title}`, result.error || 'Unknown error');
        }
      } catch (error) {
        console.warn(`⚠️ Error seeding demo item "${demoItem.title}":`, error.message);
      }
    }
    
    console.log(`🌱 Demo seeding complete: ${seededCount}/${demoBrowsingData.length} items seeded`);
    
    res.json({
      success: true,
      seededCount,
      totalItems: demoBrowsingData.length,
      message: `Successfully seeded ${seededCount} demo items`
    });
    
  } catch (error) {
    console.error('❌ Demo seeding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed demo data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`Research Assistant Proxy running on port ${PORT}`);
  console.log(`Anthropic API Key: ${process.env.ANTHROPIC_API_KEY ? 'Yes' : 'No'}`);
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Yes' : 'No'}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL ? 'Yes' : 'No'}`);
  console.log(`Supabase Anon Key: ${process.env.SUPABASE_ANON_KEY ? 'Yes' : 'No'}`);
  
  // Test Supabase connection
  try {
    const connectionTest = await supabaseStorage.testConnection();
    if (connectionTest.success) {
      console.log('✅ Supabase connection successful');
    } else {
      console.log('❌ Supabase connection failed:', connectionTest.error);
    }
  } catch (error) {
    console.log('❌ Supabase connection error:', error.message);
  }
});