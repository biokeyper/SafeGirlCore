# Canonical Payload Schema

This document defines the simple canonical JSON schema we will use to compute the report fingerprint (`reportHash`). Use this schema and the canonicalization rules exactly on both client and backend.

Schema (fields and types)

- `id`: string — unique frontend-generated id (e.g., `report_1670000000_xxx`)
- `createdAt`: string — ISO 8601 UTC timestamp (e.g., `2026-01-13T12:34:56.789Z`)
- `type`: string — one of `text`, `audio`, `mixed`
- `textSummary`: string — short plain-text summary (optional, empty string if none)
- `audioFilename`: string — filename or empty string
- `audioDuration`: integer — milliseconds (0 if none)
- `metadata`: object — simple key/value map (see rules)

Example canonical JSON (keys must be sorted alphabetically):

{
"audioDuration": 0,
"audioFilename": "",
"createdAt": "2026-01-13T12:34:56.789Z",
"id": "report_1670000000_xxx",
"metadata": {"location":"approx","mood":"scared"},
"textSummary": "Description ...",
"type": "mixed"
}

Canonicalization rules

- Use UTF-8 encoding.
- Sort top-level keys alphabetically (ASCII order).
- For objects (`metadata`), sort keys alphabetically as well.
- No extra whitespace: serialize as compact JSON (no spaces or line breaks) before hashing.
- Use ISO 8601 UTC for timestamps with milliseconds.
- For binary/audio, do NOT include raw bytes; include either `audioFilename` and `audioDuration` or include a separate `audioHash` (base64 or hex) if you want checksum.

Hashing recommendation

- Compute the SHA-256 hash over the canonical compact JSON bytes. Optionally also compute `keccak256` for on-chain compatibility.
- Represent hash outputs as hex lowercase strings.

Test vectors are in `test-reports/`.
