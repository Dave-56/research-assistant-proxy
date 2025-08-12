// Offline/Online sync service for Otto Research Assistant
const SupabaseStorageService = require('./storage-service');

class SyncService {
  constructor() {
    this.storageService = new SupabaseStorageService();
    this.syncQueue = new Map(); // Store pending sync operations
    this.isOnline = true;
    this.syncInProgress = false;
  }

  // Initialize sync service
  initialize() {
    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('🌐 Back online - resuming sync');
        this.isOnline = true;
        this.processSyncQueue();
      });

      window.addEventListener('offline', () => {
        console.log('📵 Gone offline - queueing sync operations');
        this.isOnline = false;
      });

      this.isOnline = navigator.onLine;
    }

    // Process sync queue periodically
    setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.processSyncQueue();
      }
    }, 30000); // Every 30 seconds
  }

  // Add operation to sync queue
  queueOperation(userId, operation) {
    const operationId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.syncQueue.set(operationId, {
      id: operationId,
      userId: userId,
      operation: operation,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3
    });

    console.log(`📤 Queued sync operation: ${operation.type} (${operationId})`);

    // Try to process immediately if online
    if (this.isOnline && !this.syncInProgress) {
      this.processSyncQueue();
    }

    return operationId;
  }

  // Process all queued sync operations
  async processSyncQueue() {
    if (this.syncInProgress || !this.isOnline || this.syncQueue.size === 0) {
      return;
    }

    this.syncInProgress = true;
    console.log(`🔄 Processing ${this.syncQueue.size} sync operations`);

    const operations = Array.from(this.syncQueue.values());
    const completedOperations = [];

    for (const queuedOp of operations) {
      try {
        const success = await this.executeOperation(queuedOp);
        
        if (success) {
          completedOperations.push(queuedOp.id);
          console.log(`✅ Completed sync operation: ${queuedOp.operation.type} (${queuedOp.id})`);
        } else {
          // Increment retry count
          queuedOp.retryCount++;
          
          if (queuedOp.retryCount >= queuedOp.maxRetries) {
            console.error(`❌ Max retries exceeded for operation: ${queuedOp.operation.type} (${queuedOp.id})`);
            completedOperations.push(queuedOp.id); // Remove from queue
          } else {
            console.warn(`⚠️ Retry ${queuedOp.retryCount}/${queuedOp.maxRetries} for operation: ${queuedOp.operation.type} (${queuedOp.id})`);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing sync operation ${queuedOp.id}:`, error);
        queuedOp.retryCount++;
        
        if (queuedOp.retryCount >= queuedOp.maxRetries) {
          completedOperations.push(queuedOp.id);
        }
      }
    }

    // Remove completed operations from queue
    completedOperations.forEach(id => {
      this.syncQueue.delete(id);
    });

    this.syncInProgress = false;
    console.log(`🏁 Sync processing complete. ${this.syncQueue.size} operations remaining`);
  }

  // Execute a single sync operation
  async executeOperation(queuedOperation) {
    const { userId, operation } = queuedOperation;

    try {
      switch (operation.type) {
        case 'save_content':
          return await this.syncSaveContent(userId, operation.data);
          
        case 'update_content':
          return await this.syncUpdateContent(userId, operation.contentId, operation.data);
          
        case 'delete_content':
          return await this.syncDeleteContent(userId, operation.contentId);
          
        case 'update_settings':
          return await this.syncUpdateSettings(userId, operation.data);
          
        default:
          console.warn(`Unknown sync operation type: ${operation.type}`);
          return false;
      }
    } catch (error) {
      console.error(`Error executing sync operation ${operation.type}:`, error);
      return false;
    }
  }

  // Sync content save operation
  async syncSaveContent(userId, contentData) {
    try {
      const result = await this.storageService.saveContent(userId, contentData);
      return result.success;
    } catch (error) {
      console.error('Error syncing save content:', error);
      return false;
    }
  }

  // Sync content update operation
  async syncUpdateContent(userId, contentId, updates) {
    try {
      const result = await this.storageService.updateContent(userId, contentId, updates);
      return result.success;
    } catch (error) {
      console.error('Error syncing update content:', error);
      return false;
    }
  }

  // Sync content delete operation
  async syncDeleteContent(userId, contentId) {
    try {
      const result = await this.storageService.deleteContent(userId, contentId);
      return result.success;
    } catch (error) {
      console.error('Error syncing delete content:', error);
      return false;
    }
  }

  // Sync settings update operation
  async syncUpdateSettings(userId, settings) {
    try {
      const result = await this.storageService.updateSettings(userId, settings);
      return result.success;
    } catch (error) {
      console.error('Error syncing update settings:', error);
      return false;
    }
  }

  // Sync content with server and resolve conflicts
  async syncUserContent(userId, clientId, localContent = []) {
    try {
      console.log(`🔄 Starting full content sync for user ${userId}`);

      // Get last sync time
      const syncInfo = await this.storageService.getLastSyncTime(userId, clientId);
      const lastSync = syncInfo.lastSync ? new Date(syncInfo.lastSync) : null;

      // Get server content since last sync
      const serverContentResult = await this.storageService.getAllContent(userId, {
        // Only get content modified since last sync if we have a sync time
        ...(lastSync && { 
          modifiedSince: lastSync.toISOString() 
        })
      });

      if (!serverContentResult.success) {
        throw new Error('Failed to fetch server content');
      }

      const serverContent = serverContentResult.content || [];
      const conflicts = [];
      const updates = [];

      // Compare local and server content
      for (const localItem of localContent) {
        const serverItem = serverContent.find(item => item.id === localItem.id);

        if (!serverItem) {
          // Item exists locally but not on server - upload it
          updates.push({
            type: 'upload',
            item: localItem
          });
        } else if (new Date(serverItem.updated_at) > new Date(localItem.updated_at || localItem.timestamp)) {
          // Server version is newer - download it
          updates.push({
            type: 'download',
            item: serverItem
          });
        } else if (new Date(localItem.updated_at || localItem.timestamp) > new Date(serverItem.updated_at)) {
          // Local version is newer - upload it
          updates.push({
            type: 'upload',
            item: localItem
          });
        }
        // If timestamps match, no action needed
      }

      // Find server items not in local content
      for (const serverItem of serverContent) {
        if (!localContent.find(item => item.id === serverItem.id)) {
          updates.push({
            type: 'download',
            item: serverItem
          });
        }
      }

      // Apply updates
      const syncResults = {
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        errors: []
      };

      for (const update of updates) {
        try {
          if (update.type === 'upload') {
            const result = await this.storageService.saveContent(userId, update.item);
            if (result.success) {
              syncResults.uploaded++;
            } else {
              syncResults.errors.push(`Upload failed for ${update.item.title}: ${result.error}`);
            }
          } else if (update.type === 'download') {
            // For downloads, we just return the items to be applied locally
            syncResults.downloaded++;
          }
        } catch (error) {
          syncResults.errors.push(`Sync error for ${update.item.title}: ${error.message}`);
        }
      }

      // Update sync timestamp
      await this.storageService.updateSyncTime(userId, clientId);

      console.log(`✅ Content sync complete: ${syncResults.uploaded} uploaded, ${syncResults.downloaded} downloaded, ${syncResults.errors.length} errors`);

      return {
        success: true,
        updates: updates.filter(u => u.type === 'download').map(u => u.item),
        results: syncResults
      };

    } catch (error) {
      console.error('Full content sync error:', error);
      return {
        success: false,
        error: error.message,
        updates: [],
        results: { uploaded: 0, downloaded: 0, conflicts: 0, errors: [error.message] }
      };
    }
  }

  // Get sync status
  getSyncStatus() {
    return {
      isOnline: this.isOnline,
      queueSize: this.syncQueue.size,
      syncInProgress: this.syncInProgress,
      pendingOperations: Array.from(this.syncQueue.values()).map(op => ({
        id: op.id,
        type: op.operation.type,
        timestamp: op.timestamp,
        retryCount: op.retryCount
      }))
    };
  }

  // Clear sync queue (for testing/debugging)
  clearSyncQueue() {
    this.syncQueue.clear();
    console.log('🗑️ Sync queue cleared');
  }

  // Force sync processing (for testing/debugging)
  async forceSyncProcessing() {
    if (this.isOnline) {
      await this.processSyncQueue();
    } else {
      console.warn('Cannot force sync - currently offline');
    }
  }
}

module.exports = SyncService;