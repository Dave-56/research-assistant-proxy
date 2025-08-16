// Background content fetcher for imported bookmarks
const { createClient } = require('@supabase/supabase-js');
// Node.js 22 has native fetch, no need to import
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const ContentCleaner = require('./content-cleaning/index');
const ContentTypeDetector = require('./content-type-detector');
const PDFExtractor = require('../pdf-extractor');

class BookmarkContentFetcher {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.processing = false;
    this.batchSize = 5; // Process 5 bookmarks at a time
    
    // Initialize content cleaner with debug mode based on environment
    this.contentCleaner = new ContentCleaner({
      enableMetrics: true,
      enableContentScoring: true,
      debugMode: process.env.NODE_ENV !== 'production'
    });
    
    // Initialize content type detector
    this.typeDetector = new ContentTypeDetector();
    
    // Initialize PDF extractor
    this.pdfExtractor = new PDFExtractor();
  }

  // Start processing pending bookmarks for a user
  async processPendingBookmarks(userId, batchId) {
    if (this.processing) {
      console.log('Already processing bookmarks');
      return { success: false, message: 'Already processing' };
    }

    this.processing = true;
    console.log(`🔄 Starting content fetch for batch ${batchId}`);

    try {
      // Get pending bookmarks
      const { data: bookmarks, error } = await this.supabase
        .from('imported_bookmarks')
        .select('*')
        .eq('user_id', userId)
        .eq('import_batch_id', batchId)
        .eq('fetch_status', 'pending')
        .limit(this.batchSize);

      if (error) throw error;

      if (!bookmarks || bookmarks.length === 0) {
        console.log('No pending bookmarks to process');
        await this.updateBatchStatus(batchId, 'completed');
        return { success: true, message: 'No bookmarks to process' };
      }

      console.log(`📚 Found ${bookmarks.length} bookmarks to fetch content for`);

      // Process each bookmark
      const results = await Promise.allSettled(
        bookmarks.map(bookmark => this.fetchBookmarkContent(bookmark))
      );

      // Count successes and failures
      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'rejected' || !r.value?.success).length;

      console.log(`✅ Fetched content for ${succeeded} bookmarks, ${failed} failed`);

      // Update batch statistics
      await this.updateBatchStats(batchId, succeeded, failed);

      // Check if there are more bookmarks to process
      const { count } = await this.supabase
        .from('imported_bookmarks')
        .select('*', { count: 'exact', head: true })
        .eq('import_batch_id', batchId)
        .eq('fetch_status', 'pending');

      if (count > 0) {
        // Schedule next batch
        setTimeout(() => {
          this.processing = false;
          this.processPendingBookmarks(userId, batchId);
        }, 2000); // Wait 2 seconds before next batch
      } else {
        // All done!
        await this.updateBatchStatus(batchId, 'completed');
        this.processing = false;
        return { success: true, message: 'All bookmarks processed', completed: succeeded, failed };
      }

    } catch (error) {
      console.error('Error processing bookmarks:', error);
      this.processing = false;
      return { success: false, error: error.message };
    }
  }

  // Fetch content for a single bookmark
  async fetchBookmarkContent(bookmark) {
    console.log(`🔍 Fetching content for: ${bookmark.title}`);

    try {
      // Update status to fetching
      await this.supabase
        .from('imported_bookmarks')
        .update({ fetch_status: 'fetching' })
        .eq('id', bookmark.id);

      // Check if this is a PDF URL first
      const isPDF = PDFExtractor.isPDFURL(bookmark.url);
      
      if (isPDF) {
        // Handle PDF extraction
        console.log(`📄 Detected PDF URL: ${bookmark.url}`);
        return await this.processPDFBookmark(bookmark);
      }

      // Fetch the page for non-PDF content
      const response = await fetch(bookmark.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Glance/1.0; +https://glance.app)'
        },
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Step 1: Detect content type
      console.log(`🔍 Detecting content type for: ${bookmark.title}`);
      const contentType = await this.typeDetector.detectType(bookmark.url, html);
      console.log(`📋 Content type detected: ${contentType}`);

      let finalContent, preview, extractedData;

      if (contentType === 'article') {
        // Step 2A: For articles, use existing cleaning pipeline
        console.log(`🧹 Cleaning HTML for article: ${bookmark.title}`);
        const cleaningResult = await this.contentCleaner.cleanContent(html, bookmark.url);
        
        if (!cleaningResult.success) {
          console.log(`⚠️ Cleaning failed, using original HTML: ${cleaningResult.error}`);
        } else {
          console.log(`✨ Cleaned HTML: ${cleaningResult.preCleaningStats.reductionPercent}% size reduction`);
        }

        // Parse with Readability using cleaned HTML
        const cleanedHtml = cleaningResult.success ? cleaningResult.html : html;
        const dom = new JSDOM(cleanedHtml, { url: bookmark.url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article || !article.content) {
          throw new Error('Could not extract content from page');
        }

        // Post-process the Readability content
        const postProcessResult = await this.contentCleaner.postProcessContent(article.content, bookmark.url);
        finalContent = postProcessResult.success ? postProcessResult.content : article.content;
        
        // Generate preview from final content
        preview = this.generatePreview(finalContent);
        
        console.log(`📊 Content quality score: ${postProcessResult.qualityScore?.overall || 'N/A'}/100`);
        
        extractedData = {
          byline: article.byline,
          siteName: article.siteName
        };
        
      } else {
        // Step 2B: For non-articles, preserve original HTML and extract metadata
        console.log(`📦 Preserving original content for ${contentType}: ${bookmark.title}`);
        
        // Extract type-specific metadata
        const metadata = this.typeDetector.extractMetadata(html, contentType);
        
        // Store full HTML as content (for now, will be enhanced later)
        finalContent = html;
        preview = metadata.description || metadata.title || bookmark.title;
        
        extractedData = {
          ...metadata,
          contentType: contentType,
          preservedHtml: true
        };
        
        console.log(`📊 Extracted metadata:`, Object.keys(metadata).join(', '));
      }

      // Store in user_content table
      const { data: content, error: contentError } = await this.supabase
        .from('user_content')
        .insert({
          user_id: bookmark.user_id,
          title: extractedData?.title || bookmark.title,
          content_text: finalContent,
          preview: preview,
          type: 'bookmark',
          content_type: contentType,  // NEW: Store detected content type
          source_url: bookmark.url,
          source_hostname: new URL(bookmark.url).hostname,
          source_title: bookmark.title,
          byline: extractedData?.byline,
          site_name: extractedData?.siteName,
          timestamp: Date.now(),
          is_readable: contentType === 'article',
          metadata: extractedData  // NEW: Store all extracted metadata
        })
        .select()
        .single();

      if (contentError) throw contentError;

      // Update bookmark with content reference
      await this.supabase
        .from('imported_bookmarks')
        .update({
          fetch_status: 'completed',
          fetched_at: new Date().toISOString(),
          content_id: content.id
        })
        .eq('id', bookmark.id);

      console.log(`✅ Content fetched for: ${bookmark.title}`);
      return { success: true, bookmarkId: bookmark.id, contentId: content.id };

    } catch (error) {
      console.error(`❌ Failed to fetch ${bookmark.url}:`, error.message);

      // Update bookmark with error
      await this.supabase
        .from('imported_bookmarks')
        .update({
          fetch_status: 'failed',
          fetch_error: error.message.substring(0, 500)
        })
        .eq('id', bookmark.id);

      return { success: false, bookmarkId: bookmark.id, error: error.message };
    }
  }

  // Process PDF bookmark
  async processPDFBookmark(bookmark) {
    try {
      console.log(`📄 Processing PDF: ${bookmark.title}`);
      
      // Extract PDF content
      const pdfResult = await this.pdfExtractor.extractFromURL(bookmark.url);
      
      if (!pdfResult.success) {
        throw new Error(pdfResult.error || 'PDF extraction failed');
      }
      
      // Store in user_content table
      const { data: content, error: contentError } = await this.supabase
        .from('user_content')
        .insert({
          user_id: bookmark.user_id,
          title: pdfResult.metadata?.info?.Title || bookmark.title,
          content_text: pdfResult.text,
          preview: pdfResult.preview,
          type: 'bookmark',
          content_type: 'pdf', // Mark as PDF content type
          source_url: bookmark.url,
          source_hostname: new URL(bookmark.url).hostname,
          source_title: bookmark.title,
          timestamp: Date.now(),
          is_readable: true,
          metadata: {
            contentType: 'pdf',
            pdfInfo: {
              pages: pdfResult.metadata.pages,
              fileSize: pdfResult.metadata.fileSize,
              info: pdfResult.metadata.info,
              extractionMethod: pdfResult.metadata.extractionMethod,
              extractedAt: new Date().toISOString()
            }
          }
        })
        .select()
        .single();

      if (contentError) throw contentError;

      // Update bookmark with content reference
      await this.supabase
        .from('imported_bookmarks')
        .update({
          fetch_status: 'completed',
          fetched_at: new Date().toISOString(),
          content_id: content.id
        })
        .eq('id', bookmark.id);

      console.log(`✅ PDF content extracted and saved: ${bookmark.title}`);
      console.log(`📊 PDF stats: ${pdfResult.metadata.pages} pages, ${Math.round(pdfResult.metadata.fileSize / 1024)}KB`);
      
      return { success: true, bookmarkId: bookmark.id, contentId: content.id };
      
    } catch (error) {
      console.error(`❌ Failed to process PDF ${bookmark.url}:`, error.message);
      
      // Update bookmark with error
      await this.supabase
        .from('imported_bookmarks')
        .update({
          fetch_status: 'failed',
          fetch_error: `PDF extraction failed: ${error.message.substring(0, 500)}`
        })
        .eq('id', bookmark.id);

      return { success: false, bookmarkId: bookmark.id, error: error.message };
    }
  }

  // Generate preview from content (kept for compatibility)
  generatePreview(text, maxLength = 200) {
    if (!text) return '';
    
    // Remove markdown formatting for preview
    const plainText = text
      .replace(/[#*`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace links with just text
      .replace(/\s+/g, ' ')
      .trim();
    
    if (plainText.length <= maxLength) {
      return plainText;
    }
    
    // Try to cut at sentence boundary
    const truncated = plainText.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    
    if (lastPeriod > 100) {
      return plainText.substring(0, lastPeriod + 1);
    }
    
    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 100) {
      return plainText.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  // Update batch statistics
  async updateBatchStats(batchId, succeeded, failed) {
    try {
      // Use direct SQL UPDATE instead of stored procedure
      const { error } = await this.supabase
        .from('import_batches')
        .update({
          fetch_completed: succeeded,
          fetch_failed: failed,
          fetch_pending: 0 // All processed now
        })
        .eq('id', batchId);

      if (error) {
        console.error('Error updating batch stats:', error);
      } else {
        console.log(`📊 Updated batch stats: ${succeeded} completed, ${failed} failed`);
      }
    } catch (error) {
      console.error('Error updating batch stats:', error);
    }
  }

  // Update batch status
  async updateBatchStatus(batchId, status) {
    const update = {
      import_status: status
    };

    if (status === 'completed') {
      update.completed_at = new Date().toISOString();
    }

    const { error } = await this.supabase
      .from('import_batches')
      .update(update)
      .eq('id', batchId);

    if (error) {
      console.error('Error updating batch status:', error);
    }
  }

  // Get batch progress
  async getBatchProgress(batchId) {
    const { data, error } = await this.supabase
      .from('import_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (error) {
      return null;
    }

    const progress = {
      total: data.total_bookmarks,
      imported: data.imported_count,
      fetchCompleted: data.fetch_completed,
      fetchFailed: data.fetch_failed,
      fetchPending: data.fetch_pending,
      status: data.import_status,
      percentComplete: Math.round(((data.fetch_completed + data.fetch_failed) / data.total_bookmarks) * 100)
    };

    return progress;
  }

  // Get content cleaning metrics and statistics
  getCleaningMetrics() {
    return this.contentCleaner.getStats();
  }

  // Log cleaning metrics summary
  logCleaningMetrics() {
    const { logSummary } = require('./content-cleaning/utils/metrics');
    logSummary();
  }

  // Add custom cleaning rule (for site-specific improvements)
  addCleaningRule(rule) {
    this.contentCleaner.addRule(rule);
  }
}

module.exports = BookmarkContentFetcher;