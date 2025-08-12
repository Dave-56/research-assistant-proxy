// Storage routes for Otto Research Assistant - Supabase version
const express = require('express');
const SupabaseStorageService = require('./storage-service');
const { requireAuth } = require('./auth-routes');

const router = express.Router();
const storageService = new SupabaseStorageService();

// All routes require authentication
router.use(requireAuth);

// Get all content for user
router.get('/content', async (req, res) => {
  try {
    const { limit, type, days } = req.query;
    const options = {};

    if (limit) options.limit = parseInt(limit);
    if (type) options.type = type;
    if (days) options.days = parseInt(days);

    const result = await storageService.getAllContent(req.user.id, options);

    if (result.success) {
      res.json({
        success: true,
        content: result.content
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save new content
router.post('/content', async (req, res) => {
  try {
    const contentData = req.body;

    if (!contentData.title) {
      return res.status(400).json({ error: 'Content title is required' });
    }

    const result = await storageService.saveContent(req.user.id, contentData);

    if (result.success) {
      res.json({
        success: true,
        entry: result.entry
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Save content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update existing content
router.put('/content/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    const updates = req.body;

    const result = await storageService.updateContent(req.user.id, contentId, updates);

    if (result.success) {
      res.json({
        success: true,
        content: result.content
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete content (soft delete)
router.delete('/content/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;

    const result = await storageService.deleteContent(req.user.id, contentId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Content deleted successfully'
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user settings
router.get('/settings', async (req, res) => {
  try {
    const result = await storageService.getSettings(req.user.id);

    if (result.success) {
      res.json({
        success: true,
        settings: result.settings
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user settings
router.put('/settings', async (req, res) => {
  try {
    const newSettings = req.body;

    const result = await storageService.updateSettings(req.user.id, newSettings);

    if (result.success) {
      res.json({
        success: true,
        settings: result.settings
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check for duplicate URL
router.post('/check-duplicate', async (req, res) => {
  try {
    const { url, timeWindowHours = 24 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const result = await storageService.checkDuplicateUrl(req.user.id, url, timeWindowHours);

    if (result.success) {
      res.json({
        success: true,
        isDuplicate: result.isDuplicate
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Check duplicate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vector search content
router.post('/search', async (req, res) => {
  try {
    const { queryEmbedding, limit = 10, threshold = 0.5 } = req.body;

    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      return res.status(400).json({ error: 'Query embedding array is required' });
    }

    const result = await storageService.searchContent(req.user.id, queryEmbedding, limit, threshold);

    if (result.success) {
      res.json({
        success: true,
        matches: result.matches
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Search content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync operations
router.get('/sync/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await storageService.getLastSyncTime(req.user.id, clientId);

    if (result.success) {
      res.json({
        success: true,
        lastSync: result.lastSync,
        syncVersion: result.syncVersion
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Get sync time error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/sync/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await storageService.updateSyncTime(req.user.id, clientId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Sync time updated'
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Update sync time error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    const result = await storageService.testConnection();

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Storage health check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;