// Authentication routes for Otto Research Assistant
const express = require('express');
const AuthService = require('./auth-service');
const MigrationService = require('./migration-service');

const router = express.Router();
const authService = new AuthService();
const migrationService = new MigrationService();

// Middleware to verify authentication
const requireAuth = async (req, res, next) => {
  try {
    console.log('🚨 DEBUG: requireAuth middleware called');
    console.log('🚨 DEBUG: Request path:', req.path);
    console.log('🚨 DEBUG: Request method:', req.method);
    
    const authHeader = req.headers.authorization;
    console.log('🚨 DEBUG: Auth header exists:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('🚨 DEBUG: No Bearer token in auth header');
      return res.status(401).json({ error: 'No access token provided' });
    }

    const accessToken = authHeader.substring(7);
    console.log('🚨 DEBUG: Access token preview:', accessToken.substring(0, 50) + '...');
    
    const authResult = await authService.verifySession(accessToken);
    console.log('🚨 DEBUG: Session verification result:', authResult.success);
    console.log('🚨 DEBUG: Session verification error:', authResult.error);

    if (!authResult.success) {
      console.log('🚨 DEBUG: Session verification failed, returning 401');
      return res.status(401).json({ error: authResult.error });
    }

    console.log('🚨 DEBUG: User authenticated successfully:', !!authResult.user);
    req.user = authResult.user;
    req.accessToken = accessToken;
    next();
  } catch (error) {
    console.error('🚨 DEBUG: requireAuth middleware error:', error);
    res.status(401).json({ error: 'Invalid authentication' });
  }
};

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await authService.registerUser(email, password, fullName);

    if (result.success) {
      res.json({
        success: true,
        user: result.user,
        session: result.session,
        message: result.message
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign in with email/password
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await authService.signInWithPassword(email, password);

    if (result.success) {
      res.json({
        success: true,
        user: result.user,
        session: result.session
      });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initiate Google OAuth
router.post('/google', async (req, res) => {
  try {
    const result = await authService.signInWithGoogle();

    if (result.success) {
      res.json({
        success: true,
        url: result.url
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle OAuth callback (GET request from Google - Implicit Flow)
router.get('/callback', async (req, res) => {
  try {
    // Inject the environment variables into the HTML
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    // For implicit flow, tokens come in the fragment (after #), not query params
    // We need to handle this client-side
    res.send(`
      <html>
        <head>
          <title>Otto Authentication</title>
        </head>
        <body>
          <h2>Completing authentication...</h2>
          <p>Please wait while we process your login.</p>
          <script>
            // Parse the fragment to get tokens
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            const expiresIn = hashParams.get('expires_in');
            const expiresAt = hashParams.get('expires_at');
            const error = hashParams.get('error');
            const errorDescription = hashParams.get('error_description');
            
            if (error) {
              console.error('OAuth error:', error, errorDescription);
              document.body.innerHTML = '<h2>Authentication failed</h2><p>Error: ' + (errorDescription || error) + '</p>';
              
              // Notify extension
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'auth-error', 
                  error: errorDescription || error
                }, '*');
              }
              
              setTimeout(() => {
                window.close();
              }, 3000);
            } else if (accessToken) {
              // We have tokens, need to get user data
              fetch('${supabaseUrl}/auth/v1/user', {
                headers: {
                  'Authorization': 'Bearer ' + accessToken,
                  'apikey': '${supabaseAnonKey}'
                }
              })
              .then(response => response.json())
              .then(userData => {
                // Create session object similar to what Supabase SDK returns
                const session = {
                  access_token: accessToken,
                  refresh_token: refreshToken,
                  expires_in: parseInt(expiresIn),
                  expires_at: parseInt(expiresAt),
                  token_type: 'bearer',
                  user: userData
                };
                
                // Store auth data in localStorage for the extension to pick up
                localStorage.setItem('ottoAuthData', JSON.stringify({
                  user: userData,
                  session: session
                }));
                
                document.body.innerHTML = '<h2>Authentication successful!</h2><p>You can close this window.</p>';
                
                // Try to communicate with the extension
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'auth-success',
                    user: userData,
                    session: session
                  }, '*');
                }
                
                // Auto-close after 2 seconds
                setTimeout(() => {
                  window.close();
                }, 2000);
              })
              .catch(error => {
                console.error('Failed to fetch user data:', error);
                document.body.innerHTML = '<h2>Authentication failed</h2><p>Could not retrieve user information.</p>';
                setTimeout(() => {
                  window.close();
                }, 3000);
              });
            } else {
              document.body.innerHTML = '<h2>Authentication failed</h2><p>No access token received.</p>';
              setTimeout(() => {
                window.close();
              }, 3000);
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Internal server error');
  }
});

// Handle OAuth callback (POST - kept for backwards compatibility)
router.post('/callback', async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const result = await authService.handleOAuthCallback(code, state);

    if (result.success) {
      res.json({
        success: true,
        user: result.user,
        session: result.session
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign out
router.post('/signout', requireAuth, async (req, res) => {
  try {
    const result = await authService.signOut(req.accessToken);

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Sign out error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh session
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const result = await authService.refreshSession(refreshToken);

    if (result.success) {
      res.json({
        success: true,
        session: result.session
      });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (error) {
    console.error('Refresh session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await authService.resetPassword(email);

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update password
router.post('/update-password', requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const result = await authService.updatePassword(req.accessToken, newPassword);

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Migration endpoint - migrate Chrome storage data to Supabase
router.post('/migrate', requireAuth, async (req, res) => {
  try {
    const { chromeStorageData } = req.body;

    if (!chromeStorageData) {
      return res.status(400).json({ error: 'Chrome storage data is required' });
    }

    // Validate the data first
    const validation = migrationService.validateChromeStorageData(chromeStorageData);
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Invalid Chrome storage data',
        details: validation.errors 
      });
    }

    // Perform migration
    const migrationResult = await migrationService.migrateUserData(req.user.id, chromeStorageData);
    const report = migrationService.generateMigrationReport(migrationResult);

    res.json({
      success: migrationResult.success,
      report: report,
      warnings: validation.warnings
    });

  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed', details: error.message });
  }
});

// Anonymous sign-in for demo mode
router.post('/anonymous', async (req, res) => {
  try {
    console.log('🎭 Creating anonymous user for demo mode');
    
    const { captchaToken } = req.body;
    const result = await authService.createAnonymousUser(captchaToken);
    
    if (result.success) {
      console.log('✅ Anonymous user created successfully');
      res.json({
        success: true,
        user: result.user,
        session: result.session
      });
    } else {
      console.error('❌ Anonymous user creation failed:', result.error);
      res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('❌ Anonymous sign-in error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Anonymous sign-in failed' 
    });
  }
});

// Convert anonymous user to real account
router.post('/convert-anonymous', requireAuth, async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    
    console.log('🔄 Converting anonymous user to real account');
    console.log('🔄 User ID:', req.user.id);
    console.log('🔄 Email:', email);
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }
    
    const result = await authService.convertAnonymousUser(req.user.id, email, password, fullName);
    
    if (result.success) {
      console.log('✅ Anonymous user converted successfully');
      res.json({
        success: true,
        user: result.user,
        session: result.session
      });
    } else {
      console.error('❌ Anonymous user conversion failed:', result.error);
      res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('❌ Anonymous user conversion error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Account conversion failed' 
    });
  }
});

module.exports = { router, requireAuth };