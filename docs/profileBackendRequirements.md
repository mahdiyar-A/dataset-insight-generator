# Profile Area - Backend Implementation Requirements

## Overview
The Profile Area feature requires implementing 4 main endpoints to support user profile viewing, editing, password management, and session handling.

## Core Endpoints Required

### 1. GET /api/users/profile
- **Purpose:** Fetch authenticated user's profile data
- **Auth:** Bearer token required
- **Returns:** User object with id, email, username, firstName, lastName, phoneNumber, profilePicture, createdAt, lastLoginAt, isActive
- **Errors:** 401 (Unauthorized), 404 (User not found)

### 2. PUT /api/users/profile
- **Purpose:** Update user profile (name, username, phone, profile picture)
- **Auth:** Bearer token required
- **Input:** firstName, lastName, username, phoneNumber, profilePicture (all optional)
- **Returns:** Updated user object
- **Validation:** Username must be unique, phone in E.164 format (recommended)
- **Errors:** 400 (Validation), 401 (Unauthorized), 409 (Duplicate username)

### 3. PUT /api/users/password
- **Purpose:** Change user password with current password verification
- **Auth:** Bearer token required
- **Input:** currentPassword, newPassword, confirmPassword
- **Password Requirements:** Min 8 chars, uppercase, lowercase, number, special character
- **Returns:** Success message
- **Errors:** 400 (Validation), 401 (Invalid current password or unauthorized)

### 4. POST /api/auth/logout
- **Purpose:** Invalidate current session (optional; client can discard token)
- **Auth:** Bearer token required
- **Returns:** Success message
- **Errors:** 401 (Unauthorized)

## Database Schema Changes

### Users Table
Add or update these columns:
- `firstName` (string, optional, max 50 chars)
- `lastName` (string, optional, max 50 chars)
- `phoneNumber` (string, optional, max 20 chars, E.164 format recommended)
- `profilePicture` (string/URL, optional, max 500 chars)
- `lastLoginAt` (datetime, nullable)
- `isActive` (boolean, default true)

## Key Implementation Details

### Security
- Hash passwords with bcrypt or PBKDF2 (never store plaintext)
- Validate email format on registration
- Validate phone format (E.164: `^\+?[1-9]\d{1,14}$`)
- Implement JWT token validation on all protected routes
- Add rate limiting on password change (e.g., 5 attempts per 15 mins)
- Use HTTPS only in production

### Error Response Format (Consistent)
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": { /* optional field-specific errors */ }
}