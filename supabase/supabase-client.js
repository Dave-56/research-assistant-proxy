// Supabase client configuration for Otto Research Assistant
const { createClient } = require('@supabase/supabase-js');

class SupabaseClient {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Missing Supabase environment variables. Please check SUPABASE_URL and SUPABASE_ANON_KEY');
    }
    
    // Client for user-authenticated operations
    this.client = createClient(this.supabaseUrl, this.supabaseKey);
    
    // Admin client for server-side operations (bypasses RLS)
    this.adminClient = this.supabaseServiceKey ? 
      createClient(this.supabaseUrl, this.supabaseServiceKey) : null;
  }

  // Get client with user session
  getClientWithAuth(accessToken) {
    // Create client with custom headers to include the access token
    const clientWithAuth = createClient(this.supabaseUrl, this.supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    });
    
    return clientWithAuth;
  }

  // Test connection
  async testConnection() {
    try {
      const { data, error } = await this.client.from('users').select('count').limit(1);
      if (error) throw error;
      return { success: true, message: 'Connected to Supabase successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = SupabaseClient;