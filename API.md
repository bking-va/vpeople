# vPeople Bamboo-Compatible API

This document describes the BambooHR-compatible API shim that vPeople provides for legacy integrations.

## Authentication

All API requests require an API key passed as a Bearer token in the Authorization header:

```bash
Authorization: Bearer YOUR_API_KEY
```

API keys are configured via the `BAMBOO_API_KEYS` environment variable (comma-separated list).

## Base URL

```
https://your-domain.com/api/gateway/v1/{company}
```

The `{company}` parameter is maintained for BambooHR compatibility but is currently ignored (single-tenant).

## Implemented Endpoints

### GET /employees/directory

Returns a list of all active employees.

**Query Parameters:**
- `fields` (optional): Comma-separated list of fields to include

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/gateway/v1/vendasta/employees/directory?fields=id,firstName,lastName,email,jobTitle"
```

**Response:**
```json
{
  "employees": [
    {
      "id": "1",
      "employeeNumber": "E001",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@vendasta.com",
      "jobTitle": "Senior Developer",
      "department": "Technology",
      "location": "Saskatoon HQ",
      "hireDate": "2020-01-15",
      "employmentStatus": "full_time"
    }
  ],
  "count": 1
}
```

### GET /employees/{id}

Returns detailed information for a specific employee.

**Query Parameters:**
- `fields` (optional): Comma-separated list of fields to include

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/gateway/v1/vendasta/employees/123"
```

**Response:**
```json
{
  "id": "123",
  "employeeNumber": "E123",
  "firstName": "Jane",
  "lastName": "Smith",
  "displayName": "Jane Smith",
  "email": "jane.smith@vendasta.com",
  "workPhone": "+1-306-555-0100",
  "workPhoneExtension": "201",
  "jobTitle": "Product Manager",
  "department": "Product",
  "location": "Saskatoon HQ",
  "hireDate": "2019-05-12",
  "employmentStatus": "full_time"
}
```

### GET /reports/custom

Returns a basic custom report with employee data.

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://your-domain.com/api/gateway/v1/vendasta/reports/custom"
```

**Response:**
```json
{
  "report": [
    {
      "employeeNumber": "E001",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@vendasta.com",
      "jobTitle": "Senior Developer",
      "department": "Technology",
      "location": "Saskatoon HQ",
      "hireDate": "2020-01-15",
      "status": "full_time"
    }
  ],
  "count": 1,
  "generatedAt": "2026-11-07T19:00:00.000Z"
}
```

## Available Fields

When using the `fields` query parameter, you can request any combination of:

- `id`
- `employeeNumber`
- `firstName`
- `lastName`
- `preferredName`
- `displayName` (computed from preferredName or firstName/lastName)
- `email`
- `workPhone`
- `workPhoneExtension`
- `mobilePhone`
- `jobTitle`
- `department`
- `division`
- `location`
- `hireDate`
- `employmentStatus`
- `photoUrl`

## Not Yet Implemented

The following BambooHR API endpoints are stubbed but not fully implemented:

- Time tracking endpoints
- Time off request creation/approval
- File/document upload
- Webhook subscriptions
- Custom field metadata
- Organization chart API

## Migration Guide

To migrate an existing BambooHR integration:

1. Update the base URL from `https://api.bamboohr.com/api/gateway/v1/{subdomain}` to your vPeople instance URL
2. Replace your BambooHR API key with a vPeople API key (configured in environment variables)
3. Test with the `/employees/directory` endpoint to verify connectivity
4. Most read operations should work without code changes
5. Write operations (POST/PUT/DELETE) are not yet supported and will return 405

## Rate Limiting

Currently no rate limiting is enforced, but this may be added in future versions.

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message description"
}
```

Common status codes:
- `400` Bad Request: Invalid parameters
- `401` Unauthorized: Missing or invalid API key
- `404` Not Found: Resource doesn't exist
- `405` Method Not Allowed: Operation not supported
- `500` Internal Server Error: Server-side error
