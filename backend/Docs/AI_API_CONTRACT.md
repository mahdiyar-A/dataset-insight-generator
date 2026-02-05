# AI API Contract

## Backend Endpoint

POST /api/ai/analyze

---
### Response (200 OK)
- Returns Raw JSON file

```json
{
  "sessionId": "uuid",
  "rawJson": "{...python ai output...}"
}
```
### Error Responses

400 Bad Request
- Missing datasetId or file
- Missing sessionId
```json
{
  "error": "AI service is unavailable. Please try again later."
}
```
or
```json
{
  "error": "DatasetId or UploadedFile must be provided."
} 
```

408 Request Timeout
- Python AI didn't respond in time and the request got timed out
```json
{
  "error": "AI request timed out."
}
```

503 Service Unavailable
- Misconfigured or unreachable service
```json
{
  "error": "AI service is unavailable. Please try again later."
}
```

500 Internal Server Error
- Unexpected errors
```json
{
    "error": "An unexpected error occured."
}
```
---
# Python AI Service Contract
POST /analyze

### Accepts multipart/form-data:

- sessionId (required)

- either datasetId OR file is required.

### Returns JSON Analysis result