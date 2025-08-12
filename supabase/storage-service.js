// Supabase storage service to replace Chrome storage
const SupabaseClient = require('./supabase-client');

class SupabaseStorageService {
  constructor() {
    this.supabase = new SupabaseClient();
  }

  // Initialize user data (equivalent to Chrome storage initialization)
  async initializeUserData(userId) {
    try {
      // Check if user settings exist, create if not
      const { data: settings } = await this.supabase.adminClient
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!settings) {
        const defaultSettings = {
          autoSummarize: false,
          autoSummaryTimer: 7000,
          maxAutoSummariesPerDay: 100
        };

        await this.supabase.adminClient
          .from('user_settings')
          .insert({
            user_id: userId,
            settings: defaultSettings
          });
      }

      // Add default content if user has no content
      const { data: existingContent } = await this.supabase.adminClient
        .from('user_content')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (!existingContent || existingContent.length === 0) {
        await this.addDefaultContent(userId);
      }

      return { success: true };
    } catch (error) {
      console.error('Error initializing user data:', error);
      return { success: false, error: error.message };
    }
  }

  // Add default content for new users
  async addDefaultContent(userId) {
    try {
      const defaultContent = [
        {
          id: `insight_default_vc_strategies_${userId}`,
          user_id: userId,
          title: 'Contrasting VC Strategies in 2025',
          preview: 'Analysis of how different top-tier VC firms are adapting their investment strategies in response to current market conditions...',
          timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
          type: 'ANALYSIS',
          sources: [
            { title: 'Kleiner Perkins celebrates Figma IPO windfall', url: 'https://example.com/kleiner' },
            { title: 'CRV downsizes to $750M fund', url: 'https://example.com/crv' }
          ],
          insight_data: {
            summary: 'Two contrasting approaches are emerging among top-tier VC firms. Kleiner Perkins is celebrating massive returns from late-stage bets like Figma, while CRV is intentionally shrinking fund size to focus on early-stage investments.',
            takeaways: [
              'Kleiner Perkins is reaping huge gains from late-stage bets like Figma, showing massive upside from IPO wins',
              'CRV is intentionally shrinking its fund size, doubling down on early-stage investing to improve returns',
              'The two strategies show opposite but valid responses to current VC dynamics: celebration vs discipline'
            ],
            significance: 'This represents a fundamental split in how established VC firms are responding to market pressures. Some are harvesting gains from previous cycles while others are tightening focus for better future returns.',
            questions: [
              'Which strategy will prove more successful in the long term?'
            ]
          }
        },
        {
          id: `bookmark_default_mastercard_${userId}`,
          user_id: userId,
          type: 'bookmark',
          title: 'Mastercard denies pressuring game platforms, Valve tells a different story',
          content_text: `Mastercard Denies Pressuring Game Platforms, Valve Tells a Different Story

The payment processing giant Mastercard finds itself at the center of controversy following allegations from game platform operators, including Valve Corporation, regarding pressure tactics related to payment processing for digital content.

Recent reports have emerged suggesting that Mastercard has been applying pressure to various gaming platforms to restrict certain types of transactions, particularly those related to adult-oriented content and digital goods purchases.

According to sources familiar with the matter, these restrictions go beyond standard fraud prevention measures and appear to target specific content categories. The controversy has drawn significant attention from the gaming industry, with several major platforms reportedly receiving similar communications.

Valve Corporation's Position

Valve Corporation, the company behind the popular Steam gaming platform, has been notably vocal about these allegations. The company has characterized Mastercard's demands as going "far beyond reasonable payment processing requirements."

Internal communications suggest that Valve views these restrictions as potentially overreaching, arguing that payment processors should not be making content-based decisions for digital platforms.

Mastercard's Response

Mastercard has strongly denied these characterizations, maintaining that all their policies are designed around risk management and regulatory compliance rather than content control.

A company spokesperson emphasized that their requirements represent "standard industry practices designed to protect consumers and ensure compliance with global financial regulations."

The company maintains that they do not make editorial decisions about platform content and that any restrictions are purely related to financial risk assessment and regulatory compliance.

Industry Implications

This dispute highlights growing tensions between payment processors and digital platforms over the extent of payment companies' influence on content policies.

The controversy comes at a time when digital payment processing faces increased scrutiny from regulators worldwide, particularly regarding the handling of digital goods and services.

Industry observers are watching closely to see whether this dispute will lead to broader changes in how payment processors interact with digital platforms, or whether regulatory intervention might be necessary to clarify the boundaries of payment company authority.`,
          source_title: 'Mastercard denies pressuring game platforms, Valve tells a different story',
          source_url: 'https://example.com/mastercard-valve-dispute',
          source_hostname: 'example.com',
          preview: 'Mastercard seemingly denied playing a role in a recent marketplace crackdown on games with adult content, while Valve says the pressure was indirect.',
          timestamp: Date.now() - 86400000, // 1 day ago
          byline: 'Gaming Industry Reporter',
          site_name: 'Tech News'
        }
      ];

      await this.supabase.adminClient
        .from('user_content')
        .insert(defaultContent);

      console.log('✅ Default content added for user:', userId);
    } catch (error) {
      console.error('Error adding default content:', error);
    }
  }

  // Save content (replaces saveManualContent and insights)
  async saveContent(userId, contentData) {
    try {
      // Ensure user exists in the users table
      await this.ensureUserExists(userId);
      
      const entry = {
        user_id: userId,
        // Don't set id - let Supabase generate UUID automatically
        title: contentData.title,
        content_text: contentData.content || contentData.text,
        preview: contentData.preview || contentData.summary,
        type: contentData.type || 'insight',
        timestamp: contentData.timestamp || Date.now(),
        source_title: contentData.source?.title,
        source_url: contentData.source?.url || contentData.url,
        source_hostname: contentData.source?.hostname,
        byline: contentData.byline,
        site_name: contentData.siteName,
        is_readable: contentData.isReadable,
        insight_data: contentData.insight_data,
        sources: contentData.sources,
        searchable_text: contentData.searchableText,
        embedding: contentData.embedding
      };

      const { data, error } = await this.supabase.adminClient
        .from('user_content')
        .insert(entry)
        .select()
        .single();

      if (error) throw error;

      return { success: true, entry: data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get all content for user (replaces getAllContent)
  async getAllContent(userId, options = {}) {
    try {
      let query = this.supabase.adminClient
        .from('user_content')
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .order('timestamp', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.type) {
        query = query.eq('type', options.type);
      }

      if (options.days) {
        const timeWindow = Date.now() - (options.days * 24 * 60 * 60 * 1000);
        query = query.gte('timestamp', timeWindow);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { success: true, content: data || [] };
    } catch (error) {
      return { success: false, error: error.message, content: [] };
    }
  }

  // Get user settings
  async getSettings(userId) {
    try {
      const { data, error } = await this.supabase.adminClient
        .from('user_settings')
        .select('settings')
        .eq('user_id', userId)
        .maybeSingle(); // Use maybeSingle() instead of single()

      // No error handling needed for "no rows" case with maybeSingle()
      
      const defaultSettings = {
        autoSummarize: false,
        autoSummaryTimer: 7000,
        maxAutoSummariesPerDay: 100
      };

      return { 
        success: true, 
        settings: { ...defaultSettings, ...(data?.settings || {}) }
      };
    } catch (error) {
      // Only catch actual errors, not "no rows found"
      return { 
        success: false, 
        error: error.message,
        settings: {
          autoSummarize: false,
          autoSummaryTimer: 7000,
          maxAutoSummariesPerDay: 100
        }
      };
    }
  }

  // Update user settings
  async updateSettings(userId, newSettings) {
    try {
      const { data, error } = await this.supabase.adminClient
        .from('user_settings')
        .upsert({
          user_id: userId,
          settings: newSettings
        })
        .select('settings')
        .single();

      if (error) throw error;

      return { success: true, settings: data.settings };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Update content (for adding embeddings, editing, etc.)
  async updateContent(userId, contentId, updates) {
    try {
      const { data, error } = await this.supabase.adminClient
        .from('user_content')
        .update(updates)
        .eq('user_id', userId)
        .eq('id', contentId)
        .select()
        .single();

      if (error) throw error;

      return { success: true, content: data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Delete content (soft delete)
  async deleteContent(userId, contentId) {
    try {
      const { error } = await this.supabase.adminClient
        .from('user_content')
        .update({ status: 'deleted' })
        .eq('user_id', userId)
        .eq('id', contentId);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Search content with vector similarity
  async searchContent(userId, queryEmbedding, limit = 10, threshold = 0.5) {
    try {
      const { data, error } = await this.supabase.adminClient
        .rpc('search_content_by_embedding', {
          query_embedding: queryEmbedding,
          user_id: userId,
          match_threshold: threshold,
          match_count: limit
        });

      if (error) throw error;

      return { success: true, matches: data || [] };
    } catch (error) {
      console.error('Vector search error:', error);
      // Fallback to regular content search
      const fallback = await this.getAllContent(userId, { limit });
      return fallback;
    }
  }

  // Check for duplicate URLs (for saved pages)
  async checkDuplicateUrl(userId, url, timeWindowHours = 24) {
    try {
      const timeWindow = Date.now() - (timeWindowHours * 60 * 60 * 1000);

      const { data, error } = await this.supabase.adminClient
        .from('user_content')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'bookmark')
        .eq('source_url', url)
        .gte('timestamp', timeWindow)
        .neq('status', 'deleted')
        .limit(1);

      if (error) throw error;

      return { success: true, isDuplicate: data && data.length > 0 };
    } catch (error) {
      return { success: false, error: error.message, isDuplicate: false };
    }
  }

  // Sync operations for offline/online sync
  async getLastSyncTime(userId, clientId) {
    try {
      const { data, error } = await this.supabase.adminClient
        .from('sync_metadata')
        .select('last_sync, sync_version')
        .eq('user_id', userId)
        .eq('client_id', clientId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

      return { 
        success: true, 
        lastSync: data?.last_sync || null,
        syncVersion: data?.sync_version || 0
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateSyncTime(userId, clientId) {
    try {
      const { error } = await this.supabase.adminClient
        .from('sync_metadata')
        .upsert({
          user_id: userId,
          client_id: clientId,
          last_sync: new Date().toISOString(),
          sync_version: Date.now()
        });

      if (error) throw error;

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Health check
  async testConnection() {
    return await this.supabase.testConnection();
  }

  // Ensure user exists in the users table (create if doesn't exist)
  async ensureUserExists(userId) {
    try {
      // Check if user already exists
      const { data: existingUser, error: selectError } = await this.supabase.adminClient
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (selectError) {
        console.error('Error checking user existence:', selectError);
        return;
      }

      // If user doesn't exist, create them
      if (!existingUser) {
        console.log('🚨 DEBUG: Creating user in users table:', userId);
        
        // Get user info from Supabase Auth
        const { data: authUser, error: authError } = await this.supabase.adminClient.auth.admin.getUserById(userId);
        
        let insertResult;
        if (authError) {
          console.error('Error getting auth user:', authError);
          // Create with minimal info if auth lookup fails - use unique email for anonymous users
          insertResult = await this.supabase.adminClient
            .from('users')
            .insert({
              id: userId,
              email: `anonymous-${userId}@example.com`,
              created_at: new Date().toISOString()
            });
        } else {
          // Create with auth user info
          insertResult = await this.supabase.adminClient
            .from('users')
            .insert({
              id: userId,
              email: authUser.user.email || `anonymous-${userId}@example.com`,
              full_name: authUser.user.user_metadata?.full_name,
              avatar_url: authUser.user.user_metadata?.avatar_url,
              created_at: authUser.user.created_at
            });
        }
        
        if (insertResult.error) {
          console.error('❌ Failed to create user in users table:', insertResult.error);
          throw insertResult.error;
        }
        
        console.log('✅ User created in users table');
      }
    } catch (error) {
      console.error('Error ensuring user exists:', error);
      // Don't throw - we want content saving to continue even if user creation fails
    }
  }
}

module.exports = SupabaseStorageService;