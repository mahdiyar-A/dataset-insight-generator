# User Profile API

Note: This API assumes authentication is present and the backend exposes the current user's id as a claim (`sub` or `nameidentifier`). Do NOT pass `userId` in request bodies or routes.

Base: `POST /api/user` routes operate on the current user (`/me` style).

Endpoints

- GET `/api/user/me`
  - Auth: Bearer
  - Returns: `GetMeResponseDto`
  - 200 OK

- PATCH `/api/user/me/username`
  - Auth: Bearer
  - Body: `{ "userName": "newname" }`
  - 200 OK -> updated `GetMeResponseDto`
  - 400 validation

- PATCH `/api/user/me/email`
  - Auth: Bearer
  - Body: `{ "email": "new@example.com" }`
  - 200 OK -> updated `GetMeResponseDto`
  - 409 email already used

- POST `/api/user/me/profile-picture`
  - Auth: Bearer
  - Form: `file` multipart IFormFile
  - Returns: `{ "profilePicturePath": "/storage/users/{userId}/profile/profile.jpg" }`
  - 400 invalid file

- DELETE `/api/user/me`
  - Auth: Bearer
  - Returns: 204 No Content

Error format example

```
{ "error": "ERROR_CODE", "message": "Human friendly message", "details": { } }
```

Security & Storage

- Profile pictures are stored on disk under `storage/users/{userId}/profile/` and served from `/storage/...`.
- Do not store picture bytes in JSON; store the path only.

Common errors

- 400 Validation
- 401 Unauthorized (missing claim)
- 404 User not found (rare)
- 409 Conflict (email already used)
