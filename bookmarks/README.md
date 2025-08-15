# Bookmarks Import Feature

This directory contains the backend implementation for importing Chrome bookmarks into the Glance extension.

## Files

- `bookmarks-routes.js` - Express routes for bookmark import API endpoints
- `schema.sql` - Database schema for imported bookmarks and import batches
- `README.md` - This documentation file

## Setup

### 1. Database Setup

Run the SQL schema in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of schema.sql
```

This will create:
- `imported_bookmarks` table - stores individual bookmarks
- `import_batches` table - tracks import sessions
- Indexes for performance
- Row Level Security (RLS) policies
- Helper functions and triggers

### 2. Environment Variables

Ensure these are set in your environment:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for server-side operations

### 3. API Endpoints

The following endpoints are available under `/api/bookmarks`:

#### `POST /check-duplicates`
Check for duplicate URLs before importing.

**Request:**
```json
{
  "urls": ["https://example.com", "https://test.com"]
}
```

**Response:**
```json
{
  "success": true,
  "duplicates": ["https://example.com"]
}
```

#### `POST /import-batch`
Create a new import batch to track progress.

**Request:**
```json
{
  "totalBookmarks": 150,
  "options": {
    "generateSummaries": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "batch": {
    "id": "uuid",
    "user_id": "uuid",
    "total_bookmarks": 150,
    "status": "in_progress"
  }
}
```

#### `POST /import`
Import a batch of bookmarks.

**Request:**
```json
{
  "bookmarks": [
    {
      "chromeId": "1",
      "title": "Example Site",
      "url": "https://example.com",
      "folderPath": "Bookmarks Bar/Development",
      "dateAdded": 1634567890000,
      "tags": ["development", "tools"]
    }
  ],
  "batchId": "uuid",
  "generateSummaries": false
}
```

**Response:**
```json
{
  "success": true,
  "imported": 1,
  "bookmarks": [...]
}
```

#### `GET /imported`
Retrieve imported bookmarks for the authenticated user.

**Query Parameters:**
- `limit` - Number of bookmarks to return (default: 100)
- `offset` - Offset for pagination (default: 0)
- `status` - Filter by processing status

**Response:**
```json
{
  "success": true,
  "bookmarks": [
    {
      "id": "uuid",
      "title": "Example Site",
      "url": "https://example.com",
      "folder_path": "Bookmarks Bar/Development",
      "tags": ["development", "tools"],
      "processing_status": "completed",
      "imported_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### `DELETE /imported/:id`
Delete an imported bookmark.

**Response:**
```json
{
  "success": true
}
```

#### `POST /import-batch/:id/complete`
Mark an import batch as completed.

**Response:**
```json
{
  "success": true,
  "batch": {
    "id": "uuid",
    "status": "completed",
    "completed_at": "2024-01-01T00:00:00Z"
  }
}
```

## Authentication

All endpoints require authentication via Bearer token in the Authorization header:

```
Authorization: Bearer <supabase_auth_token>
```

## Security

- All tables have Row Level Security (RLS) enabled
- Users can only access their own bookmarks and import batches
- Input validation is performed on all endpoints
- Rate limiting applies to all API calls

## Database Schema

### imported_bookmarks
- `id` - Primary key (UUID)
- `user_id` - Foreign key to auth.users
- `chrome_id` - Original Chrome bookmark ID
- `title` - Bookmark title
- `url` - Bookmark URL
- `folder_path` - Original folder structure
- `tags` - Array of tags extracted from folder path
- `processing_status` - Status of AI processing
- `imported_at` - Timestamp of import
- Additional metadata fields

### import_batches
- `id` - Primary key (UUID)
- `user_id` - Foreign key to auth.users
- `total_bookmarks` - Total bookmarks in batch
- `processed_bookmarks` - Number of processed bookmarks
- `status` - Batch status (in_progress, completed, failed)
- `started_at` - Batch start time
- `completed_at` - Batch completion time
- `options` - Import options (JSONB)

## Error Handling

The API returns standard HTTP status codes:
- `200` - Success
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `404` - Not Found (table doesn't exist, needs migration)
- `500` - Internal Server Error

Error responses include a descriptive message:
```json
{
  "success": false,
  "error": "Description of the error"
}
```