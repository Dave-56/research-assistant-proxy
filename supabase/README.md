# Otto Research Assistant - Supabase Migration

This directory contains all the Supabase integration files for migrating Otto Research Assistant from Chrome Storage to cloud-based storage.

## 🏗️ Architecture Overview

The migration replaces Chrome's local storage with Supabase PostgreSQL database, enabling:
- Multi-device synchronization
- User authentication (email + Google OAuth)
- Advanced semantic search with vector embeddings
- Offline/online sync capabilities
- Data persistence and backup

## 📁 File Structure

```
supabase/
├── README.md                 # This file
├── schema.sql               # Database schema and setup
├── vector-search.sql        # Vector search functions
├── supabase-client.js       # Supabase client configuration
├── auth-service.js          # Authentication service
├── storage-service.js       # Storage operations (replaces Chrome storage)
├── migration-service.js     # Chrome storage → Supabase migration
├── sync-service.js          # Offline/online synchronization
├── auth-routes.js           # Authentication API endpoints
└── storage-routes.js        # Storage API endpoints
```

## 🚀 Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key
3. Run the database schema:
   ```sql
   -- Copy and paste contents of schema.sql into Supabase SQL Editor
   ```
4. Run the vector search functions:
   ```sql
   -- Copy and paste contents of vector-search.sql into Supabase SQL Editor
   ```

### 2. Configure Authentication

1. In Supabase Dashboard → Authentication → Settings
2. Enable Email authentication
3. Configure Google OAuth:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add your Supabase auth callback URL: `https://your-project.supabase.co/auth/v1/callback`
   - Copy Client ID and Client Secret to Supabase

### 3. Environment Variables

Add to your `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OAuth Configuration
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:3000/auth/callback
PASSWORD_RESET_REDIRECT_URL=http://localhost:3000/reset-password

# Existing keys
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
```

### 4. Install Dependencies

```bash
npm install @supabase/supabase-js
```

## 🔄 Migration Process

### Automatic Migration

Users can migrate their data through the API:

```javascript
// POST /auth/migrate
{
  "chromeStorageData": {
    "insights": [...],
    "savedContent": [...],
    "autoSummarizedContent": [...],
    "settings": {...}
  }
}
```

### Manual Migration Script

```javascript
const MigrationService = require('./migration-service');
const migrationService = new MigrationService();

// Validate data first
const validation = migrationService.validateChromeStorageData(chromeData);
if (validation.isValid) {
  const result = await migrationService.migrateUserData(userId, chromeData);
  console.log('Migration result:', result);
}
```

## 🔐 Authentication Flow

### Email/Password Registration
```javascript
// POST /auth/register
{
  "email": "user@example.com",
  "password": "secure-password",
  "fullName": "User Name"
}
```

### Email/Password Sign In
```javascript
// POST /auth/signin
{
  "email": "user@example.com", 
  "password": "secure-password"
}
```

### Google OAuth Flow
```javascript
// 1. Initiate OAuth
// POST /auth/google
// Returns: { "url": "https://accounts.google.com/oauth/authorize..." }

// 2. Handle callback  
// POST /auth/callback
{
  "code": "oauth-authorization-code",
  "state": "optional-state"
}
```

## 💾 Storage Operations

### Save Content
```javascript
// POST /api/storage/content
{
  "title": "Article Title",
  "content": "Article content...",
  "type": "bookmark",
  "source": {
    "url": "https://example.com",
    "title": "Source Title"
  }
}
```

### Get All Content
```javascript
// GET /api/storage/content?limit=50&type=bookmark&days=30
```

### Search Content (Vector Similarity)
```javascript
// POST /api/storage/search
{
  "queryEmbedding": [0.1, 0.2, ...], // 1536-dimensional vector
  "limit": 10,
  "threshold": 0.5
}
```

## 🔄 Sync Operations

The sync service handles offline/online scenarios:

```javascript
const SyncService = require('./sync-service');
const syncService = new SyncService();

// Queue operations when offline
syncService.queueOperation(userId, {
  type: 'save_content',
  data: contentData
});

// Full sync when back online
const syncResult = await syncService.syncUserContent(userId, clientId, localContent);
```

## 🔍 Vector Search Features

### Semantic Search
Find content based on meaning, not just keywords:

```sql
SELECT * FROM search_content_by_embedding(
  query_embedding,
  user_id,
  0.5,  -- similarity threshold
  10    -- max results
);
```

### Content Recommendations
Get personalized recommendations based on reading history:

```sql
SELECT * FROM get_content_recommendations(
  user_id,
  30,  -- days back to analyze
  5    -- number of recommendations
);
```

### Duplicate Detection
Automatically detect similar content:

```sql
SELECT * FROM find_duplicate_content(
  user_id,
  content_embedding,
  0.9  -- similarity threshold for duplicates
);
```

## 🛡️ Security Features

- **Row Level Security (RLS)**: Users can only access their own data
- **JWT Authentication**: Secure session management
- **API Rate Limiting**: Prevents abuse
- **Input Validation**: Sanitizes all user inputs
- **Environment Variables**: Secure configuration management

## 📊 Database Schema

### Users Table
- User profiles and authentication data
- Google OAuth integration
- Activity tracking

### User Content Table  
- Unified storage for saved pages and insights
- Vector embeddings for semantic search
- Rich metadata and source tracking
- Soft delete functionality

### User Settings Table
- Personalized configuration
- JSONB format for flexibility

### Sync Metadata Table
- Multi-device synchronization tracking
- Conflict resolution support

## 🧪 Testing

### Connection Test
```javascript
const connectionTest = await supabaseStorage.testConnection();
console.log(connectionTest.success ? '✅ Connected' : '❌ Failed');
```

### Migration Test
```javascript
const testData = { insights: [], settings: {} };
const validation = migrationService.validateChromeStorageData(testData);
console.log('Validation:', validation);
```

## 📈 Performance Considerations

- **Vector Index**: Optimized for similarity search
- **Database Indexes**: Fast queries on common fields  
- **Connection Pooling**: Efficient database connections
- **Caching**: In-memory embedding cache
- **Pagination**: Handles large content libraries
- **Background Processing**: Async embedding generation

## 🚨 Error Handling

The system includes comprehensive error handling:
- Network connectivity issues
- Authentication failures  
- Database constraints
- Migration conflicts
- Sync queue management

## 🔧 Maintenance

### Monitoring
- Connection health checks
- Sync queue status
- Error logging
- Performance metrics

### Backup
- Automatic database backups via Supabase
- Export functionality for user data
- Migration rollback capabilities

## 📞 Support

For issues with the Supabase integration:
1. Check environment variables
2. Verify database schema
3. Test authentication flow
4. Monitor sync queue status
5. Check network connectivity