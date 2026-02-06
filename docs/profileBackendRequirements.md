# Profile Area — Backend Requirements

Overview: minimal backend surface the frontend needs to enable profile and account flows.

Essential endpoints

- `POST /api/auth/register`
  - Auth: none
  - Body: `{ email, password, username? }`
  - Returns: `{ token, user }`
  - Errors: `400`, `409`

- `POST /api/auth/login`
  - Auth: none
  - Body: `{ email, password }`
  - Returns: `{ token, user }`
  - Errors: `401`

- `POST /api/auth/logout` (optional)
  - Auth: Bearer
  - Returns: success message

- `GET /api/users/profile`
  - Auth: Bearer
  - Returns: user `{ id, email, username, firstName, lastName, phoneNumber, profilePicture, createdAt, lastLoginAt, isActive }`
  - Errors: `401`, `404`

- `PUT /api/users/profile`
  - Auth: Bearer
  - Body: any of `{ firstName, lastName, username, phoneNumber, profilePicture }`
  - Returns: updated `user`
  - Errors: `400`, `401`, `409`

- `PUT /api/users/password`
  - Auth: Bearer
  - Body: `{ currentPassword, newPassword }`
  - Returns: success message
  - Errors: `400`, `401`

- `DELETE /api/users`
  - Auth: Bearer
  - Returns: success message (delete or soft-deactivate)

Database (minimal additions)

- Add fields to `Users` table: `firstName`, `lastName`, `phoneNumber`, `profilePicture`, `lastLoginAt`, `isActive`.

Security & infra (must-haves)

- JWT auth (signing key, validation middleware) wired in `Program.cs`.
- Secure password hashing (bcrypt/ASP.NET Identity) and verification.
- Consistent JSON error format: `{ "error": "CODE", "message": "...", "details": { } }`.
- CORS for frontend origin (dev), HTTPS in production.

Recommended first steps

1. Configure JWT auth in `Program.cs`.
2. Implement `AuthController` with `register` + `login` (issue JWT).
3. Implement `UsersController` with `GET/PUT profile`, `PUT password`, `DELETE`.

If you'd like, I can scaffold controllers + DTOs and add a minimal migration next.
