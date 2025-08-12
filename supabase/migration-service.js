// Migration service to move data from Chrome Storage to Supabase
const SupabaseStorageService = require('./storage-service');

class MigrationService {
  constructor() {
    this.storageService = new SupabaseStorageService();
  }

  // Migrate all Chrome storage data to Supabase for a user
  async migrateUserData(userId, chromeStorageData) {
    try {
      console.log(`🔄 Starting migration for user ${userId}`);
      console.log('🚨 DEBUG: Chrome storage data keys:', Object.keys(chromeStorageData));
      console.log('🚨 DEBUG: Chrome storage data:', JSON.stringify(chromeStorageData, null, 2));
      
      const migrationResult = {
        success: true,
        insights: { migrated: 0, errors: 0 },
        savedContent: { migrated: 0, errors: 0 },
        autoSummarized: { migrated: 0, errors: 0 },
        settings: { migrated: false, error: null },
        errors: []
      };

      // 1. Migrate settings
      console.log('🚨 DEBUG: Checking settings migration...');
      if (chromeStorageData.settings) {
        console.log('🚨 DEBUG: Settings found:', chromeStorageData.settings);
        try {
          const settingsResult = await this.storageService.updateSettings(userId, chromeStorageData.settings);
          console.log('🚨 DEBUG: Settings migration result:', settingsResult);
          migrationResult.settings.migrated = settingsResult.success;
          if (!settingsResult.success) {
            migrationResult.settings.error = settingsResult.error;
            console.log('🚨 DEBUG: Settings migration failed:', settingsResult.error);
          }
        } catch (error) {
          console.error('🚨 DEBUG: Settings migration exception:', error);
          migrationResult.settings.error = error.message;
          migrationResult.errors.push(`Settings migration error: ${error.message}`);
        }
      } else {
        console.log('🚨 DEBUG: No settings found in Chrome storage data');
      }

      // 2. Migrate insights (both bookmarks and actual insights)
      console.log('🚨 DEBUG: Checking insights migration...');
      if (chromeStorageData.insights && Array.isArray(chromeStorageData.insights)) {
        console.log('🚨 DEBUG: Found insights array with', chromeStorageData.insights.length, 'items');
        for (let i = 0; i < chromeStorageData.insights.length; i++) {
          const insight = chromeStorageData.insights[i];
          console.log(`🚨 DEBUG: Processing insight ${i + 1}:`, insight);
          try {
            const migratedInsight = this.transformInsightForSupabase(insight, userId);
            console.log(`🚨 DEBUG: Transformed insight ${i + 1}:`, migratedInsight);
            const result = await this.storageService.saveContent(userId, migratedInsight);
            console.log(`🚨 DEBUG: Save result for insight ${i + 1}:`, result);
            
            if (result.success) {
              migrationResult.insights.migrated++;
            } else {
              migrationResult.insights.errors++;
              migrationResult.errors.push(`Insight migration error: ${result.error}`);
              console.error(`🚨 DEBUG: Insight ${i + 1} failed:`, result.error);
            }
          } catch (error) {
            migrationResult.insights.errors++;
            migrationResult.errors.push(`Insight processing error: ${error.message}`);
            console.error(`🚨 DEBUG: Insight ${i + 1} processing error:`, error);
          }
        }
      } else {
        console.log('🚨 DEBUG: No insights found or not an array');
      }

      // 3. Migrate savedContent (legacy)
      if (chromeStorageData.savedContent && Array.isArray(chromeStorageData.savedContent)) {
        for (const savedItem of chromeStorageData.savedContent) {
          try {
            const migratedItem = this.transformSavedContentForSupabase(savedItem, userId);
            const result = await this.storageService.saveContent(userId, migratedItem);
            
            if (result.success) {
              migrationResult.savedContent.migrated++;
            } else {
              migrationResult.savedContent.errors++;
              migrationResult.errors.push(`Saved content migration error: ${result.error}`);
            }
          } catch (error) {
            migrationResult.savedContent.errors++;
            migrationResult.errors.push(`Saved content processing error: ${error.message}`);
          }
        }
      }

      // 4. Migrate autoSummarizedContent (legacy)
      if (chromeStorageData.autoSummarizedContent && Array.isArray(chromeStorageData.autoSummarizedContent)) {
        for (const autoItem of chromeStorageData.autoSummarizedContent) {
          try {
            const migratedItem = this.transformAutoSummarizedForSupabase(autoItem, userId);
            const result = await this.storageService.saveContent(userId, migratedItem);
            
            if (result.success) {
              migrationResult.autoSummarized.migrated++;
            } else {
              migrationResult.autoSummarized.errors++;
              migrationResult.errors.push(`Auto-summarized migration error: ${result.error}`);
            }
          } catch (error) {
            migrationResult.autoSummarized.errors++;
            migrationResult.errors.push(`Auto-summarized processing error: ${error.message}`);
          }
        }
      }

      const totalMigrated = migrationResult.insights.migrated + 
                           migrationResult.savedContent.migrated + 
                           migrationResult.autoSummarized.migrated;
      const totalErrors = migrationResult.insights.errors + 
                         migrationResult.savedContent.errors + 
                         migrationResult.autoSummarized.errors;

      migrationResult.success = totalErrors === 0;

      console.log(`✅ Migration completed for user ${userId}:`);
      console.log(`   Total items migrated: ${totalMigrated}`);
      console.log(`   Total errors: ${totalErrors}`);
      console.log(`   Settings migrated: ${migrationResult.settings.migrated}`);

      return migrationResult;

    } catch (error) {
      console.error(`❌ Migration failed for user ${userId}:`, error);
      return {
        success: false,
        error: error.message,
        insights: { migrated: 0, errors: 0 },
        savedContent: { migrated: 0, errors: 0 },
        autoSummarized: { migrated: 0, errors: 0 },
        settings: { migrated: false, error: error.message },
        errors: [error.message]
      };
    }
  }

  // Transform Chrome storage insight to Supabase format
  transformInsightForSupabase(insight, userId) {
    const transformed = {
      // Don't set id - let Supabase generate UUID automatically
      user_id: userId,
      title: insight.title,
      timestamp: insight.timestamp,
      type: insight.type || 'insight',
      status: insight.status === 'deleted' ? 'deleted' : 'active'
    };

    // Handle different insight structures
    if (insight.type === 'bookmark') {
      // Bookmark format
      transformed.content_text = insight.text || insight.content;
      transformed.source_title = insight.source?.title || insight.title;
      transformed.source_url = insight.source?.url;
      transformed.source_hostname = this.extractHostname(insight.source?.url);
      transformed.preview = insight.preview;
      transformed.byline = insight.byline;
      transformed.site_name = insight.siteName;
      transformed.is_readable = insight.isReadable;
    } else {
      // Regular insight format
      transformed.preview = insight.preview;
      transformed.sources = insight.sources;
      
      // Handle content structure
      if (insight.content) {
        transformed.insight_data = insight.content;
      }
    }

    // Add any embedding data if present
    if (insight.embedding) {
      transformed.embedding = insight.embedding;
    }

    if (insight.searchableText) {
      transformed.searchable_text = insight.searchableText;
    }

    return transformed;
  }

  // Transform Chrome storage savedContent to Supabase format
  transformSavedContentForSupabase(savedItem, userId) {
    return {
      // Don't set id - let Supabase generate UUID automatically
      user_id: userId,
      title: savedItem.title,
      content_text: savedItem.content,
      timestamp: new Date(savedItem.timestamp).getTime(),
      type: 'bookmark',
      source_url: savedItem.url,
      source_hostname: this.extractHostname(savedItem.url),
      preview: savedItem.summary || this.generatePreview(savedItem.content)
    };
  }

  // Transform Chrome storage autoSummarizedContent to Supabase format
  transformAutoSummarizedForSupabase(autoItem, userId) {
    return {
      // Don't set id - let Supabase generate UUID automatically
      user_id: userId,
      title: autoItem.title,
      content_text: autoItem.content,
      timestamp: new Date(autoItem.timestamp).getTime(),
      type: 'auto_summary',
      source_url: autoItem.url,
      source_hostname: this.extractHostname(autoItem.url),
      preview: autoItem.summary || this.generatePreview(autoItem.content)
    };
  }

  // Helper method to extract hostname from URL
  extractHostname(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (error) {
      return null;
    }
  }

  // Helper method to generate preview from content
  generatePreview(content, maxLength = 200) {
    if (!content) return 'No preview available';
    
    // Remove HTML tags and excessive whitespace
    const cleaned = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    
    // Smart truncation at sentence boundary
    const truncated = cleaned.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    
    if (lastSentenceEnd > 100) {
      return cleaned.substring(0, lastSentenceEnd + 1);
    }
    
    // Fallback to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 100) {
      return cleaned.substring(0, lastSpace) + '...';
    }
    
    return cleaned.substring(0, maxLength - 3) + '...';
  }

  // Validate Chrome storage data before migration
  validateChromeStorageData(chromeStorageData) {
    const validation = {
      isValid: true,
      warnings: [],
      errors: []
    };

    // Check for required structure
    if (!chromeStorageData || typeof chromeStorageData !== 'object') {
      validation.isValid = false;
      validation.errors.push('Invalid Chrome storage data format');
      return validation;
    }

    // Validate insights array
    if (chromeStorageData.insights && !Array.isArray(chromeStorageData.insights)) {
      validation.errors.push('Insights data is not an array');
      validation.isValid = false;
    }

    // Validate savedContent array
    if (chromeStorageData.savedContent && !Array.isArray(chromeStorageData.savedContent)) {
      validation.errors.push('SavedContent data is not an array');
      validation.isValid = false;
    }

    // Validate autoSummarizedContent array
    if (chromeStorageData.autoSummarizedContent && !Array.isArray(chromeStorageData.autoSummarizedContent)) {
      validation.errors.push('AutoSummarizedContent data is not an array');
      validation.isValid = false;
    }

    // Check for empty data
    const hasInsights = chromeStorageData.insights && chromeStorageData.insights.length > 0;
    const hasSavedContent = chromeStorageData.savedContent && chromeStorageData.savedContent.length > 0;
    const hasAutoContent = chromeStorageData.autoSummarizedContent && chromeStorageData.autoSummarizedContent.length > 0;

    if (!hasInsights && !hasSavedContent && !hasAutoContent) {
      validation.warnings.push('No content found to migrate');
    }

    return validation;
  }

  // Generate migration report
  generateMigrationReport(migrationResult) {
    const report = {
      timestamp: new Date().toISOString(),
      success: migrationResult.success,
      summary: {
        totalItems: migrationResult.insights.migrated + 
                   migrationResult.savedContent.migrated + 
                   migrationResult.autoSummarized.migrated,
        totalErrors: migrationResult.insights.errors + 
                    migrationResult.savedContent.errors + 
                    migrationResult.autoSummarized.errors,
        settingsMigrated: migrationResult.settings.migrated
      },
      details: {
        insights: migrationResult.insights,
        savedContent: migrationResult.savedContent,
        autoSummarized: migrationResult.autoSummarized,
        settings: migrationResult.settings
      },
      errors: migrationResult.errors
    };

    return report;
  }
}

module.exports = MigrationService;