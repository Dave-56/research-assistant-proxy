// Authentication service for Otto Research Assistant
const SupabaseClient = require('./supabase-client');

class AuthService {
  constructor() {
    this.supabase = new SupabaseClient();
  }

  // Register new user with email/password
  async registerUser(email, password, fullName = null) {
    try {
      const { data, error } = await this.supabase.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) throw error;

      // Create user settings with defaults
      if (data.user) {
        await this.createDefaultSettings(data.user.id);
      }

      return {
        success: true,
        user: data.user,
        session: data.session,
        message: 'User registered successfully. Please check your email for verification.'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Sign in with email/password
  async signInWithPassword(email, password) {
    try {
      const { data, error } = await this.supabase.client.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Update last login
      if (data.user) {
        await this.updateLastLogin(data.user.id);
      }

      return {
        success: true,
        user: data.user,
        session: data.session
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Sign in with Google OAuth
  async signInWithGoogle() {
    try {
      const { data, error } = await this.supabase.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: process.env.GOOGLE_OAUTH_REDIRECT_URL || 'http://localhost:3000/auth/callback',
          queryParams: {
            prompt: 'select_account' // Force account selection
          }
        }
      });

      if (error) throw error;

      return {
        success: true,
        url: data.url
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Handle OAuth callback
  async handleOAuthCallback(code, state) {
    try {
      const { data, error } = await this.supabase.client.auth.exchangeCodeForSession(code);

      if (error) throw error;

      // Check if this is a new user and create default settings
      if (data.user && data.user.created_at === data.user.updated_at) {
        await this.createDefaultSettings(data.user.id);
      }

      // Update last login
      if (data.user) {
        await this.updateLastLogin(data.user.id);
      }

      return {
        success: true,
        user: data.user,
        session: data.session
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Sign out
  async signOut(accessToken) {
    try {
      const client = this.supabase.getClientWithAuth(accessToken);
      const { error } = await client.auth.signOut();

      if (error) throw error;

      return {
        success: true,
        message: 'Signed out successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get current user
  async getCurrentUser(accessToken) {
    try {
      const client = this.supabase.getClientWithAuth(accessToken);
      const { data: { user }, error } = await client.auth.getUser();

      if (error) throw error;

      return {
        success: true,
        user
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Refresh session
  async refreshSession(refreshToken) {
    try {
      const { data, error } = await this.supabase.client.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (error) throw error;

      return {
        success: true,
        session: data.session
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Reset password
  async resetPassword(email) {
    try {
      const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
        redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL || 'http://localhost:3000/reset-password'
      });

      if (error) throw error;

      return {
        success: true,
        message: 'Password reset email sent'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update password
  async updatePassword(accessToken, newPassword) {
    try {
      const client = this.supabase.getClientWithAuth(accessToken);
      const { error } = await client.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      return {
        success: true,
        message: 'Password updated successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verify user session middleware
  async verifySession(accessToken) {
    try {
      console.log('🚨 DEBUG: verifySession called');
      console.log('🚨 DEBUG: Access token preview:', accessToken ? accessToken.substring(0, 50) + '...' : 'null');
      
      // Try using Supabase REST API directly to validate the token
      const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': process.env.SUPABASE_ANON_KEY
        }
      });

      console.log('🚨 DEBUG: REST API response status:', response.status);
      
      if (!response.ok) {
        console.log('🚨 DEBUG: REST API call failed');
        return {
          success: false,
          error: 'Invalid or expired session'
        };
      }

      const user = await response.json();
      console.log('🚨 DEBUG: REST API user exists:', !!user);
      
      if (user && user.id) {
        console.log('🚨 DEBUG: User ID:', user.id);
        console.log('🚨 DEBUG: User email:', user.email);
        
        console.log('🚨 DEBUG: Session verification successful');
        return {
          success: true,
          user
        };
      } else {
        console.log('🚨 DEBUG: No valid user in response');
        return {
          success: false,
          error: 'Invalid or expired session'
        };
      }
    } catch (error) {
      console.error('🚨 DEBUG: verifySession caught error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Private helper methods
  async createDefaultSettings(userId) {
    try {
      const defaultSettings = {
        autoSummarize: false,
        autoSummaryTimer: 7000,
        maxAutoSummariesPerDay: 100
      };

      if (this.supabase.adminClient) {
        await this.supabase.adminClient
          .from('user_settings')
          .insert({
            user_id: userId,
            settings: defaultSettings
          });
      }
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  }

  async updateLastLogin(userId) {
    try {
      if (this.supabase.adminClient) {
        await this.supabase.adminClient
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', userId);
      }
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  }

  // Create anonymous user for demo mode
  async createAnonymousUser(captchaToken = null) {
    try {
      console.log('🎭 Creating anonymous user with Supabase');
      
      // Use Supabase anonymous authentication with optional captcha
      const authOptions = {};
      if (captchaToken) {
        authOptions.captchaToken = captchaToken;
      }
      
      const { data, error } = await this.supabase.client.auth.signInAnonymously({
        options: authOptions
      });
      
      if (error) {
        console.error('❌ Supabase anonymous sign-in failed:', error);
        // If captcha verification failed, provide helpful error message
        if (error.message.includes('captcha verification process failed')) {
          throw new Error('CAPTCHA verification required. Please disable CAPTCHA protection in your Supabase dashboard under Authentication > Settings > Bot and Abuse Protection, or implement CAPTCHA support.');
        }
        throw error;
      }
      
      if (!data.user || !data.session) {
        throw new Error('No user or session returned from anonymous sign-in');
      }
      
      console.log('✅ Anonymous user created:', data.user.id);
      console.log('🚨 DEBUG: Anonymous session access_token preview:', data.session.access_token.substring(0, 50) + '...');
      
      // Create default settings for anonymous user
      await this.createDefaultSettings(data.user.id);
      
      return {
        success: true,
        user: data.user,
        session: data.session
      };
      
    } catch (error) {
      console.error('❌ Anonymous user creation failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to create anonymous user'
      };
    }
  }

  // Convert anonymous user to permanent account
  async convertAnonymousUser(userId, email, password, fullName = null) {
    try {
      console.log('🔄 Converting anonymous user to permanent account');
      console.log('🔄 Anonymous user ID:', userId);
      console.log('🔄 Target email:', email);
      
      // First, check if the user exists and is anonymous
      const { data: existingUser, error: fetchError } = await this.supabase.adminClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (fetchError && fetchError.code !== 'PGRST116') {
        throw new Error(`Failed to fetch user: ${fetchError.message}`);
      }
      
      if (!existingUser) {
        throw new Error('User not found');
      }
      
      // Check if user is anonymous (no email)
      if (existingUser.email) {
        throw new Error('User already has a permanent account');
      }
      
      // Create a new permanent user with the provided credentials
      const { data: newUserData, error: signUpError } = await this.supabase.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });
      
      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          throw new Error('An account with this email already exists');
        }
        throw signUpError;
      }
      
      if (!newUserData.user) {
        throw new Error('Failed to create permanent account');
      }
      
      // Copy all content from anonymous user to new permanent user
      console.log('🔄 Copying content from anonymous user to permanent user');
      
      // Copy user_content
      const { error: contentCopyError } = await this.supabase.adminClient
        .from('user_content')
        .update({ user_id: newUserData.user.id })
        .eq('user_id', userId);
      
      if (contentCopyError) {
        console.warn('⚠️ Failed to copy content:', contentCopyError);
      } else {
        console.log('✅ Content copied successfully');
      }
      
      // Copy user_settings
      const { error: settingsCopyError } = await this.supabase.adminClient
        .from('user_settings')
        .update({ user_id: newUserData.user.id })
        .eq('user_id', userId);
      
      if (settingsCopyError) {
        console.warn('⚠️ Failed to copy settings:', settingsCopyError);
      } else {
        console.log('✅ Settings copied successfully');
      }
      
      // Delete the anonymous user record (cleanup)
      const { error: deleteError } = await this.supabase.adminClient.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.warn('⚠️ Failed to cleanup anonymous user:', deleteError);
      } else {
        console.log('✅ Anonymous user cleaned up');
      }
      
      // Sign in the new permanent user to get a session
      const { data: signInData, error: signInError } = await this.supabase.client.auth.signInWithPassword({
        email,
        password
      });
      
      if (signInError) {
        throw new Error(`Failed to sign in new user: ${signInError.message}`);
      }
      
      console.log('✅ Anonymous user successfully converted to permanent account');
      
      return {
        success: true,
        user: signInData.user,
        session: signInData.session
      };
      
    } catch (error) {
      console.error('❌ Anonymous user conversion failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to convert anonymous user'
      };
    }
  }
}

module.exports = AuthService;