// Background content fetcher for imported bookmarks
const { createClient } = require('@supabase/supabase-js');
// Node.js 22 has native fetch, no need to import
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

class BookmarkContentFetcher {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.processing = false;
    this.batchSize = 5; // Process 5 bookmarks at a time
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

      // Fetch the page
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

      // Parse with Readability
      const dom = new JSDOM(html, { url: bookmark.url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article || !article.content) {
        throw new Error('Could not extract content from page');
      }

      // Clean up the content
      const cleanContent = this.cleanContent(article.content);
      const preview = this.generatePreview(article.textContent || cleanContent);

      // Store in user_content table
      const { data: content, error: contentError } = await this.supabase
        .from('user_content')
        .insert({
          user_id: bookmark.user_id,
          title: article.title || bookmark.title,
          content_text: cleanContent,
          preview: preview,
          type: 'bookmark',
          source_url: bookmark.url,
          source_hostname: new URL(bookmark.url).hostname,
          source_title: bookmark.title,
          byline: article.byline,
          site_name: article.siteName,
          timestamp: Date.now(),
          is_readable: true
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

  // Clean HTML content
  cleanContent(html) {
    // Remove script and style tags
    let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove excessive whitespace
    clean = clean.replace(/\s+/g, ' ');
    clean = clean.replace(/\n{3,}/g, '\n\n');
    
    return clean.trim();
  }

  // Generate preview from content
  generatePreview(text, maxLength = 200) {
    if (!text) return '';
    
    const cleaned = text.replace(/\s+/g, ' ').trim();
    
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    
    // Try to cut at sentence boundary
    const truncated = cleaned.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    
    if (lastPeriod > 100) {
      return cleaned.substring(0, lastPeriod + 1);
    }
    
    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 100) {
      return cleaned.substring(0, lastSpace) + '...';
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
}

module.exports = BookmarkContentFetcher;