# Frontend Submission Format

## 📱 What the Frontend (salama-ui) Should Send

**Backend now handles all encryption. Frontend just sends plaintext responses.**

---

## Endpoint

```
POST http://localhost:3001/api/submitReport
Content-Type: application/json
```

---

## Request Format

```json
{
  "responses": [
    "User's text response or description"
  ],
  "metadata": {
    "location": "Nairobi, Kenya",
    "mood": "anxious",
    "type": "text|audio|mixed",
    "audioDuration": 45000,
    "timestamp": "2024-01-22T14:30:00Z"
  }
}
```

---

## Field Descriptions

### `responses` (Required)
- **Type:** Array of strings
- **What:** User's text responses/descriptions
- **Example:** `["I was harassed at work yesterday"]`
- **Limit:** Any number of items, each ≤1000 characters
- **Note:** Send plaintext - backend will encrypt

### `metadata` (Required)
- **Type:** Object
- **What:** Additional context about the report

#### `metadata.location` (Recommended)
- **Type:** String
- **What:** Location where incident occurred
- **Example:** `"Office, Nairobi"` or `"Home"`
- **Note:** Will be encrypted by backend

#### `metadata.mood` (Optional)
- **Type:** String
- **What:** User's emotional state
- **Examples:** `"scared"`, `"anxious"`, `"angry"`, `"sad"`
- **Note:** Will be encrypted by backend

#### `metadata.type` (Required)
- **Type:** String (`"text"` | `"audio"` | `"mixed"`)
- **What:** Type of report
- **Examples:**
  - `"text"` - Only text description
  - `"audio"` - Only audio recording
  - `"mixed"` - Both text and audio

#### `metadata.audioDuration` (Optional)
- **Type:** Number (milliseconds)
- **What:** Length of audio recording
- **Example:** `45000` (45 seconds)
- **Note:** Only if `type` is `"audio"` or `"mixed"`

#### `metadata.timestamp` (Required)
- **Type:** ISO string
- **What:** When the report was created
- **Example:** `"2024-01-22T14:30:00Z"`
- **Note:** Use `new Date().toISOString()`

---

## Examples

### Example 1: Text Report

```json
{
  "responses": [
    "I was harassed by a coworker in the office today. They made inappropriate comments about my appearance."
  ],
  "metadata": {
    "location": "Office, Building A",
    "mood": "anxious",
    "type": "text",
    "timestamp": "2024-01-22T14:30:00Z"
  }
}
```

### Example 2: Audio Report

```json
{
  "responses": [],
  "metadata": {
    "location": "Home",
    "mood": "scared",
    "type": "audio",
    "audioDuration": 120000,
    "timestamp": "2024-01-22T15:45:00Z"
  }
}
```

### Example 3: Mixed Report (Text + Audio)

```json
{
  "responses": [
    "I recorded a conversation with my supervisor where they made threatening comments."
  ],
  "metadata": {
    "location": "Work meeting room",
    "mood": "angry",
    "type": "mixed",
    "audioDuration": 300000,
    "timestamp": "2024-01-22T16:20:00Z"
  }
}
```

---

## Backend Handles Encryption

**Important:** You send **plaintext** - backend encrypts everything

```
Frontend sends (plaintext):
  {
    "responses": ["User's text"],
    "metadata": {
      "location": "Office",
      "mood": "scared",
      "timestamp": "..."
    }
  }
        ↓
Backend encrypts:
  - responses → encrypted
  - metadata → encrypted
        ↓
Backend stores:
  - Database: encrypted data
  - IPFS: encrypted blob
  - Blockchain: immutable hash ✓
```

**You do NOT need to:**
- ❌ Encrypt data on frontend
- ❌ Handle encryption keys
- ❌ Create encryptedPayload
- ❌ Manage passwords

**Backend handles all encryption for you!**

---

## Response Format

**Success (200):**
```json
{
  "success": true,
  "reportId": "report_1674332400_abc123",
  "txHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "ipfsHash": "QmXYZ123abc456def789ghi000jkl111mno222pqr333stu",
  "status": "pending",
  "message": "Report submitted successfully",
  "data": {
    "reportId": "report_1674332400_abc123",
    "txHash": "0x1234567890abcdef...",
    "ipfsHash": "QmXYZ123abc456def...",
    "blockNumber": 12345678,
    "gasUsed": "150000",
    "timestamp": "2024-01-22T14:30:45.000Z"
  }
}
```

**Save the `reportId`** for status checking later.

---

## Error Responses

**Validation Error (400):**
```json
{
  "error": true,
  "message": "responses must be an array"
}
```

**IPFS Error (503):**
```json
{
  "error": true,
  "reportId": "report_...",
  "message": "Failed to upload to IPFS. Please try again.",
  "code": "IPFS_ERROR"
}
```

**Blockchain Error (500):**
```json
{
  "error": true,
  "reportId": "report_...",
  "message": "Failed to submit to blockchain",
  "code": "BLOCKCHAIN_ERROR"
}
```

---

## Frontend Implementation Example

```typescript
// services/api.ts

async function submitReport(report: {
  responses: string[];
  metadata: {
    location: string;
    mood?: string;
    type: "text" | "audio" | "mixed";
    audioDuration?: number;
    timestamp: string;
  };
}) {
  try {
    const response = await fetch(
      "http://localhost:3001/api/submitReport",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      }
    );

    const data = await response.json();

    if (data.success) {
      // Save reportId for status checking
      localStorage.setItem("lastReportId", data.reportId);

      return {
        success: true,
        reportId: data.reportId,
        txHash: data.txHash,
        ipfsHash: data.ipfsHash,
      };
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error("Submission failed:", error);
    throw error;
  }
}
```

---

## From Local Report to API Format

**Convert from your local report format:**

```typescript
// Your local report (from salama-ui storage)
const localReport = {
  id: "report_...",
  type: "mixed",
  textContent: "I experienced harassment",
  audioUri: "file:///...",
  audioDuration: 45000,
  metadata: {
    location: "Office",
    mood: "scared"
  },
  createdAt: "2024-01-22T14:30:00Z"
};

// Convert to API format
const apiPayload = {
  responses: [localReport.textContent],  // Text as response
  metadata: {
    location: localReport.metadata.location,
    mood: localReport.metadata.mood,
    type: localReport.type,
    audioDuration: localReport.audioDuration,
    timestamp: localReport.createdAt
  }
};

// Send to backend
await submitReport(apiPayload);
```

---

## Key Points for Frontend Team

1. ✅ **Send plaintext** - No encryption needed
2. ✅ **Include responses array** - User's text descriptions
3. ✅ **Include metadata** - Location, mood, type, timestamp
4. ✅ **Use HTTPS** - Transport is encrypted
5. ✅ **Save reportId** - Use for status checking
6. ❌ **Don't encrypt** - Backend does it
7. ❌ **Don't handle keys** - Backend manages keys
8. ❌ **Don't worry about security** - Backend + blockchain handles it

---

## Status Checking

After submission, check status with reportId:

```
GET /api/reportStatus?reportId=report_1674332400_abc123
```

Backend will return blockchain confirmation status.

---

## Security Note

- **Your phone stores drafts locally** (unencrypted in SQLite)
- **Backend encrypts everything** when submitted
- **Blockchain verifies integrity** - we can always check if backend was tampered with
- **Your data is safe** once on blockchain

---

## Questions?

- **Do I need to encrypt?** No - backend does it
- **Can I send empty responses?** Yes - just send empty array
- **What if I only have audio?** Send empty responses array + type: "audio"
- **What if I lose the reportId?** Can query backend or check local storage
- **Can backend read my data?** Data is encrypted at rest - backend only has encrypted copy

