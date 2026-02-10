# Changes Summary - Removed 5 Questions Requirement

## Overview

Removed the rigid "5 screening questions" requirement from the backend. The API now accepts **flexible, variable-length responses** that match your frontend's actual data structure (text, audio, mixed reports).

---

## What Changed

### 1. **Validation Middleware** (`backend/middleware/validation.js`)

**Before:**
```javascript
if (responses.length !== 5) {
  return error("Must provide exactly 5 responses");
}
```

**After:**
```javascript
// Responses are now optional (can send 0, 1, 2, or any number)
if (responses && Array.isArray(responses)) {
  // Validate each response if provided
  for (let i = 0; i < responses.length; i++) {
    // Check max 1000 chars per response
  }
}
```

**Changes:**
- ❌ Removed: Requirement for exactly 5 responses
- ✅ Added: Support for any number of responses (0 to many)
- ✅ Added: Increased max char limit from 500 to 1000 per response
- ✅ Added: Support for larger payloads (50MB instead of 10MB for audio)

---

### 2. **Report Controller** (`backend/controllers/reportController.js`)

Updated logging to handle variable response counts:

```javascript
// Logs responseCount as 0 if no responses sent
responseCount: responses ? responses.length : 0
```

---

### 3. **Database Schema** (`backend/db/init.sql`)

No schema changes needed - the `responses` column already accepts flexible data.

---

### 4. **API Documentation** (`API_DOCUMENTATION.md`)

Updated all examples to show flexible format:

**Before:**
```json
{
  "responses": [
    "Yes, I feel safe",
    "I want to share what happened",
    "Last week",
    "At home",
    "Yes, I am currently safe"
  ]
}
```

**After:**
```json
{
  "responses": [
    "Response 1",
    "Response 2"
  ]
}
```

---

### 5. **Frontend Integration Guide** (`FRONTEND_BACKEND_INTEGRATION.md`)

Removed `reportMapper.ts` - no mapping needed!

**Before:**
```typescript
// Had to map local report to 5 questions
const responses = mapReportToResponses(localReport);
```

**After:**
```typescript
// Just send the text directly
const responses = [];
if (localReport.textContent) {
  responses.push(localReport.textContent);
}
```

---

## What Your Frontend Can Now Send

### Text Report
```json
{
  "encryptedPayload": "0x...",
  "responses": ["User's text description"],
  "metadata": {
    "type": "text",
    "location": "Nairobi",
    "mood": "anxious"
  }
}
```

### Audio Report
```json
{
  "encryptedPayload": "0x...",
  "responses": ["Optional transcription or notes"],
  "metadata": {
    "type": "audio",
    "audioDuration": 45000,
    "location": "Home"
  }
}
```

### Mixed Report
```json
{
  "encryptedPayload": "0x...",
  "responses": [
    "My text description",
    "Optional notes about the audio"
  ],
  "metadata": {
    "type": "mixed",
    "audioDuration": 120000,
    "location": "Work",
    "mood": "scared"
  }
}
```

### No Responses
```json
{
  "encryptedPayload": "0x...",
  "metadata": {
    "type": "audio",
    "audioDuration": 60000
  }
}
```

---

## Validation Rules (Updated)

| Field | Required? | Type | Notes |
|-------|-----------|------|-------|
| `encryptedPayload` | ✅ YES | string/hex | Max 50MB |
| `responses` | ❌ NO | string[] | Each ≤1000 chars, any count |
| `metadata` | ❌ NO | object | Any fields (location, mood, type, etc) |

---

## Frontend Impact

Your frontend (`salama-ui`) now has a **simpler integration**:

### Before (Had to do 5 questions)
1. Map text/audio to 5 fixed answers
2. Lose information that doesn't fit the schema
3. Complex mapReportToResponses() function

### After (Flexible)
1. Send whatever data you have
2. No information loss
3. Simple pass-through format

---

## Example: Frontend to Backend Flow

```
Frontend Report (salama-ui)
├─ textContent: "I experienced harassment at work"
├─ audioUri: "file:///..."
├─ audioDuration: 45000
├─ metadata: { mood: "anxious", location: "Work" }
└─ type: "mixed"

         ↓ Encrypt ↓

Backend Format (flexible)
{
  "encryptedPayload": "0x...",
  "responses": [
    "I experienced harassment at work"
  ],
  "metadata": {
    "type": "mixed",
    "audioDuration": 45000,
    "mood": "anxious",
    "location": "Work",
    "createdAt": "2024-01-22T..."
  }
}

         ↓ Submit ↓

Blockchain
├─ IPFS: Encrypted file stored
└─ Smart Contract: Hash + CID recorded
```

---

## Testing

### Old (would fail)
```bash
curl -X POST http://localhost:3001/api/submitReport \
  -d '{
    "encryptedPayload": "0x...",
    "responses": ["Only one response"]  # ❌ FAILS - need 5
  }'
```

### New (works fine)
```bash
curl -X POST http://localhost:3001/api/submitReport \
  -d '{
    "encryptedPayload": "0x...",
    "responses": ["Only one response"]  # ✅ WORKS!
  }'
```

---

## Migration Notes

**If you have existing code expecting 5 questions:**
- Update validation checks
- Update test data
- Update frontend integration code

**Backward compatible?**
- No - code that sends 5 responses still works ✅
- Code expecting exactly 5 returns to work now ✅
- Code sending 1-4 responses now works ✅

---

## Files Modified

1. ✅ `backend/middleware/validation.js`
2. ✅ `backend/controllers/reportController.js`
3. ✅ `API_DOCUMENTATION.md`
4. ✅ `FRONTEND_BACKEND_INTEGRATION.md`

## Files NOT Modified

- ❌ `backend/db/init.sql` - Schema already flexible
- ❌ `backend/services/database.js` - Already handles any response format
- ❌ `backend/services/blockchain.js` - No changes needed
- ❌ `backend/services/ipfs.js` - No changes needed

---

## Next Steps

1. ✅ Remove `mapReportToResponses()` from frontend code
2. ✅ Remove `reportMapper.ts` from frontend
3. ✅ Update frontend submission to send flexible responses
4. ✅ Test with your actual text/audio/metadata format
5. ✅ Deploy backend changes

---

## Questions?

- **How many responses can I send?** Any number (0 to unlimited)
- **Do responses have to be text?** Yes, all responses must be strings
- **Can I send empty responses array?** Yes, just send metadata
- **What about audio files?** Encrypt them in the payload, reference in metadata
- **Do I need to change my database?** No, schema is already flexible

