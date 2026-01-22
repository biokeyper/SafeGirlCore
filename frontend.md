# Integration Notes — Salama Msichana UI ↔ SafeGirl Core Backend

## Purpose
This document explains how the Salama Msichana frontend stores reports locally and what the backend / smart contract integration should provide so both teams are aligned. It covers data model, local storage, submission flow, privacy constraints, recommended IPFS/chain workflow, a suggested smart-contract interface, and next steps.

---

## Where frontend stores reports (summary)

- Local DB: SQLite via `initDatabase()` and queries in `services/database.ts`.
- Storage wrapper: `saveReport`, `getAllReports`, `updateReportStatus` exported from `services/storage.ts`.
- UI entry points:
  - Text reports: `app/text-report.tsx` calls `saveReport(...)`.
  - Audio reports: `app/(tabs)/record.tsx` auto-saves recorded audio via `saveReport(...)`.
- No web3/IPFS libs are currently installed in the app (`package.json` has no `ethers`, `web3`, `ipfs-http-client`, `web3.storage`, etc.).

## Frontend data model (key fields)

- `type`: `text | audio | mixed`
- `id`: string (frontend-generated id when creating a new report)
- `status`: `'draft' | 'saved' | 'submitted' | 'failed'`
- `createdAt`, `updatedAt`: ISO timestamps
- `audioUri`: local file URI (if any)
- `audioDuration`: milliseconds (if any)
- `textContent`: string (if any)
- `metadata`: object (optional additional data)
- `submittedAt`: ISO timestamp set after successful backend submission
- `submissionId`: id/tx hash or backend submission identifier
- `submissionError`: text (if submission failed)

Example JSON the frontend will send to backend (after local save or when user opts to submit):

```json
{
  "id": "report_1670000000_xxx",
  "type": "mixed",
  "createdAt": "2026-01-13T12:34:56.789Z",
  "textContent": "Description ...",
  "audioUri": "file:///data/user/0/.../recording.m4a",
  "audioDuration": 42000,
  "metadata": {"location": "approx", "mood": "scared"}
}
```

## Privacy & threat model (must-read)

- Do NOT store raw PII or sensitive content on-chain or public IPFS without encryption.
- Preferred approach: encrypt all sensitive content on the client before uploading to IPFS (symmetric key derived from user secret / password or managed via backend per-policy). Only store the encrypted blob (CID) and a short non-sensitive metadata summary on-chain or in backend DB.
- The frontend expects an immutable timestamping mechanism (on-chain or verifiable signed timestamp) and a CID reference for long-term storage.

## Suggested high-level submission flow

1. Frontend prepares submission bundle:
   - Option A (recommended): Encrypt report payload (text + audio) locally → upload encrypted blob to IPFS → get CID.
   - Option B (less-preferred): Upload plaintext to a trusted backend which stores on IPFS (must be GDPR/PII compliant).
2. Frontend or backend records the CID and a short immutable hash on-chain:
   - Compute a SHA-256 of the encrypted payload (or payload metadata) and store that hash (and CID) on-chain or via a trusted timestamp service.
3. Backend (or on-chain tx) returns `submissionId` (tx hash or backend record id) and `submittedAt`.
4. Frontend calls `updateReportStatus(id, 'submitted', submissionId)` to persist submission details locally.

Notes:
- For UX reliability, consider a backend submission endpoint so the app need not hold a private key or pay gas.
- Implement retry logic: if submission fails, backend or frontend should mark `status:'failed'` and store `submissionError`.

## Minimal backend API contract (HTTP)

- POST /api/submitReport
  - Body: submission bundle (encrypted payload or plain CID + metadata)
  - Example responses:
    - 200 OK { "submissionId": "0xabc...", "submittedAt": "..." }
    - 202 Accepted { "submissionId": "queue_123", "submittedAt": null }
    - 4xx/5xx { "error": "..." }
- GET /api/reportStatus?submissionId=...
  - Returns processing/chain confirmation status and chain tx hash if applicable.

If you want the app to upload directly to IPFS, the app must include an IPFS SDK and the backend must be the entity that writes to chain (or accept signed payloads from the app).

## Suggested smart contract interface (on-chain timestamping)

Keep contract minimal and gas-efficient. Only store small hashes/CIDs, not full content.

Recommended Solidity interface:

```solidity
interface ISafeGirlCore {
  // Emits ReportTimestamped when a report hash is stored
  event ReportTimestamped(bytes32 indexed reportHash, string cid, address indexed submitter, uint256 timestamp, bytes32 indexed metaHash);

  // Store a report reference (store the hash + CID; cheap)
  function submitReport(bytes32 reportHash, string calldata cid, bytes32 metaHash) external returns (bytes32);

  // Optional: retrieve stored info by reportHash (or index)
  function getReport(bytes32 reportHash) external view returns (string memory cid, address submitter, uint256 timestamp, bytes32 metaHash);
}
```

- `reportHash` = keccak256(abi.encodePacked(<some canonical payload>)) or SHA-256 of encrypted payload.
- `metaHash` = optional short metadata hash (e.g., truncated), to help indexing without leaking content.
- Emit event `ReportTimestamped` for off-chain indexing and verification.

Security & cost notes:
- Storing strings (CID) costs gas. Consider storing only the 32-byte hash on-chain and relying on events for CID or storing CID on a low-cost chain (or pinning service).
- Consider a centralized relayer/back-end to batch transactions and pay gas, returning `submissionId` to frontend.

## Example integration patterns

Pattern A — Backend-mediated (recommended)
- Frontend encrypts data → uploads encrypted blob to IPFS via backend or app → backend pins CID or stores in DB → backend writes transaction to blockchain (submitReport) with hash and CID → backend returns tx hash to frontend → frontend updates local report status.

Pattern B — App direct to IPFS + backend for on-chain
- App uploads encrypted blob to IPFS (e.g., using `web3.storage`) → gets CID → POST to backend `/api/submitReport` with CID and metadata → backend signs/submits on-chain tx and returns tx hash → frontend records submission.

Pattern C — App submits directly to chain (NOT recommended)
- Requires app to manage private keys or user wallets (UX & security complexity). Avoid unless users have wallets and explicit consent.

## Recommended SDKs & libraries
- IPFS upload: `web3.storage` or `nft.storage` (simple, free/paid pinning), or `ipfs-http-client` for direct IPFS nodes.
- Ethereum client: `ethers` (node/browser), `viem` (modern JS), or backend SDKs (web3.js).
- Encryption: `tweetnacl` / `libsodium` or WebCrypto to symmetrically encrypt payloads client-side before IPFS.
- Backend: Node.js + Express/Fastify or any stack able to run signing operations and interact with IPFS and the chain.

## Important implementation details
- Canonicalization: define exactly what is hashed/stored on-chain to ensure frontend and backend compute the same `reportHash`. Provide a canonical schema and byte-ordering (e.g., JSON with sorted keys, base64 audio hash).
- Size limits: audio files can be large — prefer streaming upload to IPFS and do not store entire audio on-chain.
- Verification: provide a simple verifier script that can fetch CID, decrypt (if permitted), compute the hash, and confirm on-chain record exists.
- Auditability: emit events in the contract so backend and explorers can index them (avoid relying solely on storage reads).

## Next steps (practical)
- Agree canonical payload format to compute `reportHash` (I can draft a canonical JSON schema).
- Decide encryption model (client-side symmetric key, user passphrase, or backend-managed keys).
- Choose IPFS provider (`web3.storage` recommended for speed) and whether the app or backend will upload.
- Decide who pays gas (backend relayer recommended).
- Implement a minimal backend `/api/submitReport` and a small contract `submitReport(bytes32, string, bytes32)` to start tests.
- Provide example test vectors and a verification script.

## Contact & assets
- Frontend key files to reference:
  - Storage layer: `services/database.ts` and `services/storage.ts`
  - UI hooks: `app/text-report.tsx` and `app/(tabs)/record.tsx`
- I can:
  - Draft canonical payload schema and a sample JS function to compute `reportHash`.
  - Scaffold a minimal backend endpoint and an example contract deployment script.
  - Provide a verifier script that checks CID ↔ on-chain hash.

---

If you'd like, I can now:
- Produce the canonical JSON schema and a small JS function to compute the `reportHash`.
- Scaffold the backend `/api/submitReport` endpoint and show example requests.

Which would you like next?
