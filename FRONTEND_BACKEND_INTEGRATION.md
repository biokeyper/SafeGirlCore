# SafeGirl Frontend-Backend Integration Guide

## Overview

Your frontend (`salama-ui`) already stores reports locally in SQLite. This guide shows how to integrate it with the SafeGirlCore backend to:
1. Encrypt reports before sending
2. Upload to IPFS via backend
3. Record on blockchain
4. Track submission status

---

## Current Frontend Architecture

### Local Storage (SQLite)
**Location:** `services/database.ts` and `services/storage.ts`

**Report Schema:**
```typescript
interface Report {
  id: string;                    // report_1670000000_xxx (auto-generated)
  type: 'text' | 'audio' | 'mixed';
  status: 'draft' | 'saved' | 'submitted' | 'failed';
  createdAt: string;             // ISO timestamp
  updatedAt: string;
  audioUri?: string;             // file:///data/user/0/.../recording.m4a
  audioDuration?: number;        // milliseconds
  textContent?: string;          // User's text description
  metadata?: object;             // Location, mood, etc.
  submittedAt?: string;          // When sent to backend
  submissionId?: string;         // tx hash or backend report ID
  submissionError?: string;      // Error message if failed
}
```

### Current API Functions
```typescript
// From services/storage.ts
saveReport(report: Partial<Report>): Promise<Report>
getAllReports(): Promise<Report[]>
getReportById(id: string): Promise<Report | null>
updateReportStatus(id: string, status, submissionId?, error?): Promise<Report | null>
getReportsByStatus(status): Promise<Report[]>
```

---

## Backend API (SafeGirlCore)

### Endpoints You Have

#### 1. Health Check
```
GET /api/health

Response:
{
  "status": "healthy",
  "backend": { "wallet": "0x...", "contract": "0x..." },
  "services": { "ipfs": "ready", "blockchain": "ready", "database": "connected" }
}
```

#### 2. Submit Report
```
POST /api/submitReport

Request:
{
  "encryptedPayload": "0x...",  // Encrypted report (hex)
  "responses": ["Answer 1", "Answer 2", ...],  // 5 screening questions
  "metadata": { "location": "City", "timestamp": "2024-01-22T14:30:00Z" }
}

Response (200):
{
  "success": true,
  "reportId": "report_1234567890_abc",
  "txHash": "0x1234...",
  "ipfsHash": "QmXYZ...",
  "status": "pending",
  "data": { "reportId", "txHash", "ipfsHash", "blockNumber", "gasUsed", "timestamp" }
}
```

#### 3. Check Status
```
GET /api/reportStatus?reportId=report_1234567890_abc

Response:
{
  "success": true,
  "data": {
    "status": "pending|confirmed|failed",
    "txHash": "0x1234...",
    "ipfsHash": "QmXYZ...",
    "confirmations": 0,
    "confirmedAt": null
  }
}
```

---

## Integration Workflow

### Step 1: Prepare Report Data

In your submission flow (e.g., `app/text-report.tsx`), you already save locally:

```typescript
// Existing code (no changes)
const report = await saveReport({
  type: 'text',
  textContent: userText,
  metadata: { location, mood },
  status: 'saved'  // Saved locally
});
```

### Step 2: Add Submission Button & API Integration

Create a new utility file for backend communication:

```typescript
// services/api.ts (CREATE THIS)
export async function submitReportToBackend(localReport: Report) {
  try {
    // 1. Encrypt the report (client-side)
    const encryptedPayload = await encryptReport({
      textContent: localReport.textContent,
      audioUri: localReport.audioUri,
      metadata: localReport.metadata
    });

    // 2. Prepare responses (flexible - can be text, audio, or both)
    const responses = [];
    if (localReport.textContent) {
      responses.push(localReport.textContent);
    }

    // 3. Send to backend
    const backendResponse = await fetch('http://localhost:3001/api/submitReport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encryptedPayload,
        responses,  // Flexible: text, audio, or both
        metadata: {
          location: localReport.metadata?.location,
          type: localReport.type,  // 'text', 'audio', 'mixed'
          audioDuration: localReport.audioDuration,
          createdAt: localReport.createdAt,
          timestamp: new Date().toISOString()
        }
      })
    });

    const data = await backendResponse.json();

    if (data.success) {
      // 4. Update local report with backend submission info
      await updateReportStatus(
        localReport.id,
        'submitted',
        data.reportId,  // Backend ID
        undefined       // No error
      );

      // 5. Start polling for blockchain confirmation
      startStatusPolling(data.reportId);

      return data;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    // Update local report with error
    await updateReportStatus(
      localReport.id,
      'failed',
      undefined,
      error.message
    );
    throw error;
  }
}
```

### Step 3: Add Encryption

```typescript
// utils/encryption.ts (CREATE THIS)
import * as SecureStore from 'expo-secure-store';
// Or use: import { ChaCha20Poly1305 } from 'tweetnacl';

export async function encryptReport(data: object): Promise<string> {
  // Get or create encryption key
  const key = await getOrCreateEncryptionKey();

  // Encrypt the report
  const plaintext = JSON.stringify(data);
  const encrypted = await encrypt(plaintext, key);

  // Convert to hex for transmission
  return bytesToHex(encrypted);
}

async function getOrCreateEncryptionKey(): Promise<Uint8Array> {
  const stored = await SecureStore.getItemAsync('encryption_key');

  if (stored) {
    return hexToBytes(stored);
  }

  // Generate new key (ChaCha20 needs 32-byte key)
  const newKey = crypto.getRandomValues(new Uint8Array(32));
  await SecureStore.setItemAsync('encryption_key', bytesToHex(newKey));
  return newKey;
}
```

### Step 4: Add Status Polling

```typescript
// services/statusPoller.ts (CREATE THIS)
export function startStatusPolling(reportId: string, interval = 30000) {
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/reportStatus?reportId=${reportId}`
      );
      const data = await response.json();

      if (data.success && data.data) {
        const { status, confirmations, confirmedAt } = data.data;

        // Update local status
        if (status === 'confirmed') {
          await updateReportStatus(reportId, 'submitted');  // Mark as confirmed
          clearInterval(pollInterval);  // Stop polling
          showNotification('✓ Your report is now on the blockchain!');
        } else if (status === 'failed') {
          await updateReportStatus(
            reportId,
            'failed',
            undefined,
            'Failed to record on blockchain'
          );
          clearInterval(pollInterval);
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, interval);
}
```

### Step 5: Update UI Components

**In your text report screen:**

```typescript
// app/text-report.tsx (MODIFY)
import { submitReportToBackend } from '@/services/api';

export default function TextReportScreen() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Save locally first
      const localReport = await saveReport({
        type: 'text',
        textContent: text,
        metadata: { location, mood },
        status: 'saved'
      });

      // 2. Submit to backend
      const result = await submitReportToBackend(localReport);

      // Show success
      Alert.alert('Success', `Report submitted! ID: ${result.reportId}`);
      navigation.goBack();

    } catch (err) {
      setError(err.message);
      Alert.alert('Error', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View>
      {/* Your existing form */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        <Text>{isSubmitting ? 'Submitting...' : 'Submit Report'}</Text>
      </TouchableOpacity>

      {error && <Text style={{color: 'red'}}>{error}</Text>}
    </View>
  );
}
```

---

## Data Mapping: Frontend to Backend

Your frontend has **flexible report data** that maps directly to backend:

```typescript
// Report data structure (no mapping needed)
{
  encryptedPayload: "0x...",  // Entire report encrypted
  responses: [
    localReport.textContent  // User's text (if any)
  ],
  metadata: {
    location: localReport.metadata?.location,
    type: localReport.type,  // 'text', 'audio', 'mixed'
    mood: localReport.metadata?.mood,
    audioDuration: localReport.audioDuration,
    createdAt: localReport.createdAt
  }
}
```

**Backend accepts:**
- Any number of responses (0 to many)
- Any metadata fields
- Text only, audio only, or mixed reports
- No fixed schema required

---

## Installation: New Dependencies

Add these to `salama-ui/package.json`:

```json
{
  "dependencies": {
    "tweetnacl": "^1.0.3",           // Encryption
    "expo-secure-store": "^13.0.0",  // Secure key storage
    "axios": "^1.6.0"                // Better HTTP client (optional)
  }
}
```

Then:
```bash
cd /home/mirembe/Desktop/Projects/salama-ui
npm install tweetnacl expo-secure-store axios
```

---

## Configuration

Create a config file:

```typescript
// config/api.ts (CREATE THIS)
export const API_CONFIG = {
  // Use environment variable
  BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001',

  // Polling interval for blockchain confirmation
  STATUS_POLL_INTERVAL: 30000,  // 30 seconds

  // Encryption method
  ENCRYPTION_METHOD: 'chacha20-poly1305',

  // Max retries for failed submissions
  MAX_RETRIES: 3
};
```

Create `.env.local` in `salama-ui`:
```
EXPO_PUBLIC_API_URL=http://localhost:3001
```

---

## Complete Integration Flow Diagram

```
User fills form
    ↓
saveReport() → SQLite (local save, status='saved')
    ↓
User taps "Submit"
    ↓
encryptReport() → encrypted payload
    ↓
POST /api/submitReport (backend)
    ↓
Backend:
  ├─ Stores to IPFS
  ├─ Records on blockchain
  └─ Returns: reportId, txHash, ipfsHash
    ↓
updateReportStatus() → SQLite (status='submitted', submissionId=reportId)
    ↓
startStatusPolling() → Check status every 30 seconds
    ↓
GET /api/reportStatus (backend checks blockchain)
    ↓
When confirmations >= 12:
  ├─ Update local status
  ├─ Show success notification
  └─ Stop polling
```

---

## Error Handling

```typescript
// services/api.ts
export async function submitReportToBackend(localReport: Report) {
  try {
    const response = await fetch(/* ... */);
    const data = await response.json();

    // Handle different error types
    if (data.error) {
      switch (data.code) {
        case 'VALIDATION_ERROR':
          // User input problem
          throw new Error(`Invalid response: ${data.message}`);
        case 'IPFS_ERROR':
          // Temporary failure
          throw new Error(`Upload failed. Please try again. ${data.message}`);
        case 'BLOCKCHAIN_ERROR':
          // Contract/chain issue
          throw new Error(`Failed to record on blockchain. ${data.message}`);
        case 'DB_SYNC_FAILED':
          // Contact support
          throw new Error(`Database error. Please contact support.`);
        default:
          throw new Error(data.message || 'Unknown error');
      }
    }

    return data;
  } catch (error) {
    // Log for debugging
    console.error('Submission error:', error);

    // Update local status
    await updateReportStatus(
      localReport.id,
      'failed',
      undefined,
      error.message
    );

    throw error;
  }
}
```

---

## Testing the Integration

### 1. Start Backend
```bash
cd /home/mirembe/Desktop/Projects/SafeGirlCore
npm run dev
# Backend runs on http://localhost:3001
```

### 2. Verify Backend Health
```bash
curl http://localhost:3001/api/health
# Should return: { "status": "healthy", ... }
```

### 3. Test Frontend Submission
```bash
# In salama-ui directory
npm start
# Use Expo Go app to test on device/emulator
```

### 4. Test Complete Flow
1. Open app
2. Create a text report
3. Tap "Submit" (new button you'll add)
4. Check logs for encryption & API call
5. Verify backend receives request
6. Check database for submission status
7. Verify blockchain confirmation after ~1-2 minutes

---

## Security Checklist

- [ ] Encryption key stored in secure storage (not AsyncStorage)
- [ ] API requests use HTTPS in production
- [ ] No plaintext passwords/keys in code
- [ ] Encrypt before uploading to IPFS
- [ ] Validate responses from backend
- [ ] Handle errors gracefully (no crash)
- [ ] Clear sensitive data on logout
- [ ] Test with real backend before production

---

## Production Deployment

### Frontend Changes
1. Update `API_CONFIG.BASE_URL` to production backend URL (HTTPS)
2. Ensure encryption keys are properly stored
3. Enable error tracking (Sentry, LogRocket)
4. Add analytics

### Build & Deploy
```bash
npm run build  # or eas build for native
eas submit     # Submit to App Store/Play Store
```

---

## Troubleshooting

### "Failed to connect to backend"
- Check backend is running: `curl http://localhost:3001/api/health`
- Check API URL in config
- Check network connectivity

### "Encryption key not found"
- First run initializes key, check Expo Secure Store access
- Test key generation separately

### "Backend reports not found"
- reportId might be misspelled
- Report might not be saved to database yet
- Check backend logs: `npm run logs` or check container output

### "Blockchain confirmation timeout"
- Polygon Amoy might be slow
- Check transaction hash in block explorer
- Increase polling timeout if needed

---

## Files to Create/Modify

**Create:**
- `services/api.ts` - Backend API communication
- `utils/encryption.ts` - Encryption utilities
- `services/statusPoller.ts` - Blockchain status polling
- `config/api.ts` - API configuration
- `.env.local` - Environment variables

**Modify:**
- `app/text-report.tsx` - Add submit button & backend call
- `app/(tabs)/record.tsx` - Add submit for audio reports
- `package.json` - Add encryption dependencies
- `types/report.ts` - May need minor adjustments

---

## Next Steps

1. **Install dependencies**
   ```bash
   cd salama-ui
   npm install tweetnacl expo-secure-store axios
   ```

2. **Create API service files** (services/api.ts, utils/encryption.ts, etc.)

3. **Update UI components** to add submit buttons

4. **Test with local backend** (http://localhost:3001)

5. **Fix any integration issues**

6. **Deploy when ready**

---

## Support

For questions about:
- **Backend API**: Check `SafeGirlCore/FRONTEND_IMPLEMENTATION_PLAN.md`
- **Database**: See `SafeGirlCore/backend/db/init.sql`
- **Encryption**: See `SafeGirlCore/ENCRYPTION_IMPLEMENTATION.md`
- **Smart Contract**: See `SafeGirlCore/contracts/SafeGirlContract.sol`

