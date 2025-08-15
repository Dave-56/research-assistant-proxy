const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const BookmarkContentFetcher = require('./content-fetcher');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize content fetcher
const contentFetcher = new BookmarkContentFetcher();

// Middleware to verify authentication
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Check for duplicate URLs
router.post('/check-duplicates', authenticate, async (req, res) => {
  try {
    const { urls } = req.body;
    const userId = req.user.id;

    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    // Check both imported bookmarks and regular content
    const { data: existingContent, error: contentError } = await supabase
      .from('content')
      .select('source_url')
      .eq('user_id', userId)
      .in('source_url', urls);

    if (contentError) throw contentError;

    const { data: existingBookmarks, error: bookmarksError } = await supabase
      .from('imported_bookmarks')
      .select('url')
      .eq('user_id', userId)
      .in('url', urls);

    if (bookmarksError && bookmarksError.code !== 'PGRST116') { // Table might not exist yet
      console.log('Bookmarks table not found, will be created on first import');
    }

    const duplicateUrls = [
      ...(existingContent || []).map(c => c.source_url),
      ...(existingBookmarks || []).map(b => b.url)
    ];

    res.json({ 
      success: true, 
      duplicates: [...new Set(duplicateUrls)] 
    });
  } catch (error) {
    console.error('Error checking duplicates:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create import batch
router.post('/import-batch', authenticate, async (req, res) => {
  try {
    const { totalBookmarks, options } = req.body;
    const userId = req.user.id;

    const { data: batch, error } = await supabase
      .from('import_batches')
      .insert({
        user_id: userId,
        total_bookmarks: totalBookmarks,
        options: options || {},
        status: 'in_progress'
      })
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'Import batches table not found. Please run database migrations.' 
        });
      }
      throw error;
    }

    res.json({ success: true, batch });
  } catch (error) {
    console.error('Error creating import batch:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Import bookmarks
router.post('/import', authenticate, async (req, res) => {
  try {
    const { bookmarks, batchId, generateSummaries } = req.body;
    const userId = req.user.id;

    if (!bookmarks || !Array.isArray(bookmarks)) {
      return res.status(400).json({ error: 'Bookmarks array is required' });
    }

    // Prepare bookmark records
    const records = bookmarks.map(bookmark => ({
      user_id: userId,
      chrome_id: bookmark.chromeId,
      parent_chrome_id: bookmark.parentChromeId || null,
      title: bookmark.title || 'Untitled',
      url: bookmark.url,
      folder_path: bookmark.folderPath || '',
      date_added: bookmark.dateAdded ? new Date(bookmark.dateAdded).toISOString() : new Date().toISOString(),
      import_batch_id: batchId || null,
      tags: bookmark.tags || [],
      processing_status: generateSummaries ? 'pending' : 'completed',
      is_folder: false
    }));

    // Bulk insert
    const { data: imported, error } = await supabase
      .from('imported_bookmarks')
      .insert(records)
      .select();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'Imported bookmarks table not found. Please run database migrations.' 
        });
      }
      throw error;
    }

    // Update batch progress if batchId provided
    if (batchId) {
      const { error: updateError } = await supabase
        .from('import_batches')
        .update({ 
          processed_bookmarks: imported.length,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', batchId);

      if (updateError) {
        console.error('Error updating batch:', updateError);
      }
    }

    res.json({ 
      success: true, 
      imported: imported.length,
      bookmarks: imported 
    });
  } catch (error) {
    console.error('Error importing bookmarks:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get imported bookmarks
router.get('/imported', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 100, offset = 0, status } = req.query;

    let query = supabase
      .from('imported_bookmarks')
      .select('*')
      .eq('user_id', userId)
      .order('date_added', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (status) {
      query = query.eq('processing_status', status);
    }

    const { data: bookmarks, error } = await query;

    if (error) {
      if (error.code === 'PGRST116') {
        return res.json({ 
          success: true, 
          bookmarks: [] 
        });
      }
      throw error;
    }

    res.json({ success: true, bookmarks });
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Delete imported bookmark
router.delete('/imported/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const bookmarkId = req.params.id;

    const { error } = await supabase
      .from('imported_bookmarks')
      .delete()
      .eq('id', bookmarkId)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Complete import batch and start content fetching
router.post('/import-batch/:id/complete', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const batchId = req.params.id;

    const { data, error } = await supabase
      .from('import_batches')
      .update({ 
        import_status: 'fetching_content',
        imported_count: await supabase
          .from('imported_bookmarks')
          .select('*', { count: 'exact', head: true })
          .eq('import_batch_id', batchId)
          .then(r => r.count)
      })
      .eq('id', batchId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    // Start background content fetching
    setTimeout(() => {
      contentFetcher.processPendingBookmarks(userId, batchId);
    }, 1000);

    res.json({ 
      success: true, 
      batch: data,
      message: 'Import complete, fetching content in background'
    });
  } catch (error) {
    console.error('Error completing batch:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get batch progress
router.get('/import-batch/:id/progress', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const batchId = req.params.id;

    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('import_batches')
      .select('*')
      .eq('id', batchId)
      .eq('user_id', userId)
      .single();

    if (batchError) throw batchError;

    // Get bookmark counts by status
    const { data: statusCounts, error: countError } = await supabase
      .from('imported_bookmarks')
      .select('fetch_status')
      .eq('import_batch_id', batchId);

    if (countError) throw countError;

    const counts = statusCounts.reduce((acc, item) => {
      acc[item.fetch_status] = (acc[item.fetch_status] || 0) + 1;
      return acc;
    }, {});

    const progress = {
      batchId: batchId,
      status: batch.import_status,
      total: batch.total_bookmarks,
      imported: batch.imported_count || 0,
      fetchPending: counts.pending || 0,
      fetchInProgress: counts.fetching || 0,
      fetchCompleted: counts.completed || 0,
      fetchFailed: counts.failed || 0,
      percentComplete: batch.total_bookmarks > 0 
        ? Math.round(((counts.completed || 0) + (counts.failed || 0)) / batch.total_bookmarks * 100)
        : 0,
      isComplete: batch.import_status === 'completed'
    };

    res.json({ success: true, progress });
  } catch (error) {
    console.error('Error getting batch progress:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Retry failed content fetches
router.post('/import-batch/:id/retry-failed', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const batchId = req.params.id;

    // Reset failed bookmarks to pending
    const { data: reset, error } = await supabase
      .from('imported_bookmarks')
      .update({ 
        fetch_status: 'pending',
        fetch_error: null
      })
      .eq('import_batch_id', batchId)
      .eq('user_id', userId)
      .eq('fetch_status', 'failed')
      .select();

    if (error) throw error;

    if (reset && reset.length > 0) {
      // Restart content fetching
      setTimeout(() => {
        contentFetcher.processPendingBookmarks(userId, batchId);
      }, 1000);

      res.json({ 
        success: true, 
        retrying: reset.length,
        message: `Retrying ${reset.length} failed bookmarks`
      });
    } else {
      res.json({ 
        success: true, 
        retrying: 0,
        message: 'No failed bookmarks to retry'
      });
    }
  } catch (error) {
    console.error('Error retrying failed fetches:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;