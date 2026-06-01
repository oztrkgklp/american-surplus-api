# QuickBooks Online OAuth Integration Guide

This guide explains how the UI should consume the QBO authentication endpoints.

## Overview

The QBO OAuth flow is implemented with the following endpoints:

- **Authorization URL** — Get the QB login URL
- **Auth Callback** — Handle QB's redirect after authorization
- **Token Validation** — Check if stored token is valid
- **Token Refresh** — Refresh expired access token
- **Revoke Connection** — Disconnect QB account and delete tokens

## OAuth Flow Sequence

```
1. User clicks "Connect QuickBooks"
   ↓
2. Frontend calls GET /qbo/auth-url
   ↓
3. Frontend redirects user to returned authUrl
   ↓
4. User logs in to QuickBooks and authorizes app
   ↓
5. QuickBooks redirects to GET /qbo/auth-callback
   ↓
6. Backend saves tokens to database
   ↓
7. Frontend can now use QB APIs
```

## API Endpoints

### 1. Get Authorization URL

**Request**
```
GET /qbo/auth-url
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "authUrl": "https://appcenter.intuit.com/connect/oauth2?client_id=...",
    "message": "Redirect user to this URL to authorize QuickBooks access"
  }
}
```

**Usage**
```typescript
// Frontend code
const response = await fetch('/qbo/auth-url');
const { data } = await response.json();

// Redirect user to authorization page
window.location.href = data.authUrl;
```

---

### 2. Handle Authorization Callback

**Request**
```
GET /qbo/auth-callback?code=<auth_code>&realmId=<realm_id>&state=qbo_auth
```

This is called automatically by QuickBooks after user authorizes. No frontend action needed—backend handles it.

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "message": "Authorization successful",
    "realmId": "1234567890",
    "expiresIn": 3600,
    "tokenType": "bearer"
  }
}
```

**After this call:**
- Access token and refresh token are saved to database
- Frontend can redirect user to dashboard or QB integration page

---

### 3. Check Token Validity

**Request**
```
GET /qbo/token-validity?realmId=1234567890
```

Use this to determine if user needs to re-authorize QB.

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "isAccessTokenExpired": false,
    "isRefreshTokenExpired": false,
    "isAccessTokenExpiringSoon": false,
    "requiresReauthorization": false,
    "accessTokenExpiresAt": "2026-02-20T10:30:00Z",
    "refreshTokenExpiresAt": "2026-08-19T10:30:00Z"
  }
}
```

**Response when token not found**
```json
{
  "success": true,
  "data": {
    "isValid": false,
    "message": "No token found for this realm",
    "requiresReauthorization": true
  }
}
```

**Usage**
```typescript
// Check if QB is connected and valid
const response = await fetch(`/qbo/token-validity?realmId=${realmId}`);
const { data } = await response.json();

if (!data.isValid) {
  // Show "Connect QuickBooks" button
  showQBConnectButton = true;
} else if (data.isAccessTokenExpiringSoon) {
  // Proactively refresh token
  await refreshToken();
}
```

---

### 4. Refresh Access Token

**Request**
```
POST /qbo/refresh-token
Authorization: Bearer <user_jwt_token>
Content-Type: application/json

{
  "realmId": "1234567890"
}
```

Call this when access token is about to expire (within 5 minutes).

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "message": "Token refreshed successfully",
    "accessToken": "new_access_token_here",
    "expiresIn": 3600,
    "tokenType": "bearer"
  }
}
```

**Error Response (401 Unauthorized)**
```json
{
  "success": false,
  "error": {
    "statusCode": 401,
    "message": "Token not found or expired. User must re-authorize."
  }
}
```

**Usage**
```typescript
// Auto-refresh token when it's about to expire
const response = await fetch('/qbo/refresh-token', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userJwt}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ realmId })
});

if (!response.ok) {
  // User must re-authorize
  showQBReauthorizePrompt = true;
}
```

---

### 5. Revoke QB Connection

**Request**
```
POST /qbo/revoke
Authorization: Bearer <user_jwt_token>
Content-Type: application/json

{
  "realmId": "1234567890"
}
```

Disconnect QB account and delete stored tokens. User will need to re-authorize to use QB APIs again.

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "message": "QuickBooks connection revoked successfully",
    "realmId": "1234567890"
  }
}
```

**Usage**
```typescript
// Disconnect QB
const response = await fetch('/qbo/revoke', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userJwt}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ realmId })
});

if (response.ok) {
  // Show "Connect QuickBooks" button again
  showQBConnectButton = true;
}
```

---

### 6. Get Token Status (Admin/Monitoring)

**Request**
```
GET /qbo/token-status?realmId=1234567890
Authorization: Bearer <user_jwt_token>
```

Get detailed token status (for admin panel or monitoring). Does NOT expose actual tokens.

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "status": "CONNECTED",
    "realmId": "1234567890",
    "accessTokenStatus": "VALID",
    "refreshTokenStatus": "VALID",
    "accessTokenExpiresAt": "2026-02-20T10:30:00Z",
    "accessTokenExpiresInMinutes": 58,
    "refreshTokenExpiresAt": "2026-08-19T10:30:00Z",
    "refreshTokenExpiresInDays": 180,
    "connectedAt": "2026-02-19T09:30:00Z",
    "lastUpdated": "2026-02-19T09:35:00Z"
  }
}
```

**Response when no connection**
```json
{
  "success": true,
  "data": {
    "status": "NO_TOKEN",
    "message": "No QuickBooks connection established"
  }
}
```

---

## Frontend Implementation Example

```typescript
// QuickBooks Connection Manager
class QBConnectionManager {
  private realmId: string | null = null;
  private checkInterval: number | null = null;

  async initializeConnection() {
    // Check if already connected
    const validity = await this.checkTokenValidity();
    
    if (!validity.isValid) {
      // Show connect button
      this.showConnectButton();
    } else if (validity.isAccessTokenExpiringSoon) {
      // Proactively refresh
      await this.refreshToken();
    }

    // Start periodic checks (every 30 minutes)
    this.startTokenMonitoring();
  }

  async connectQuickBooks() {
    try {
      const response = await fetch('/qbo/auth-url');
      const { data } = await response.json();
      
      // Redirect to QB login
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('Failed to get auth URL', error);
    }
  }

  async checkTokenValidity(): Promise<TokenValidity> {
    if (!this.realmId) return { isValid: false };

    const response = await fetch(`/qbo/token-validity?realmId=${this.realmId}`);
    const { data } = await response.json();
    return data;
  }

  async refreshToken(): Promise<boolean> {
    try {
      const response = await fetch('/qbo/refresh-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getUserJwt()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ realmId: this.realmId })
      });

      if (response.ok) {
        return true;
      } else {
        // Need to re-authorize
        await this.disconnectQuickBooks();
        return false;
      }
    } catch (error) {
      console.error('Token refresh failed', error);
      return false;
    }
  }

  async disconnectQuickBooks(): Promise<void> {
    try {
      await fetch('/qbo/revoke', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getUserJwt()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ realmId: this.realmId })
      });

      this.realmId = null;
      this.showConnectButton();
    } catch (error) {
      console.error('Failed to disconnect QB', error);
    }
  }

  private startTokenMonitoring(): void {
    this.checkInterval = window.setInterval(async () => {
      const validity = await this.checkTokenValidity();
      
      if (validity.isAccessTokenExpiringSoon) {
        await this.refreshToken();
      }
    }, 30 * 60 * 1000); // Check every 30 minutes
  }

  private showConnectButton(): void {
    // Show QB connect button in UI
  }

  private getUserJwt(): string {
    // Get from localStorage or session
    return localStorage.getItem('userJwt') || '';
  }
}
```

---

## Error Handling

All endpoints return standardized error responses:

**400 Bad Request**
```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "message": "realmId query parameter is required"
  }
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "error": {
    "statusCode": 401,
    "message": "Token not found or expired. User must re-authorize."
  }
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "error": {
    "statusCode": 500,
    "message": "Internal server error"
  }
}
```

---

## Security Notes

1. **Access Token Protection** — Never expose the actual access token to the frontend. The backend always keeps it private.
2. **Refresh Token Persistence** — Tokens are stored securely in the database with expiry tracking.
3. **Token Rotation** — Refresh token is valid for 180 days (QB maximum). After expiry, user must re-authorize.
4. **Protected Endpoints** — Token refresh and revoke require user authentication (`authenticate` middleware).
5. **Realm ID** — Always include `realmId` in requests. This identifies which QB company account is being used.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No token found for this realm" | User needs to authorize QB again via `/qbo/auth-url` |
| "Refresh token expired" | User must re-authorize; show QB connect button |
| "Access token expired, refreshing" | Automatic; backend will refresh or ask user to re-authorize |
| QB login page shows error | Check QB Client ID and Client Secret in config |
| Callback URL not recognized | Verify `redirectUri` matches QB app settings |

