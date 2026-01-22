# Test Vectors

This file contains the expected hash outputs for our test reports, used to verify the hashing implementation.

## Report 1 (`report1.json`)

**Input:**

```json
{
  "id": "report_1670000000_a",
  "createdAt": "2026-01-13T12:00:00.000Z",
  "type": "text",
  "textSummary": "Felt unsafe near market. No physical injuries.",
  "audioFilename": "",
  "audioDuration": 0,
  "metadata": { "location": "near market", "mood": "anxious" }
}
```

**Canonical Form:**

```json
{
  "audioDuration": 0,
  "audioFilename": "",
  "createdAt": "2026-01-13T12:00:00.000Z",
  "id": "report_1670000000_a",
  "metadata": { "location": "near market", "mood": "anxious" },
  "textSummary": "Felt unsafe near market. No physical injuries.",
  "type": "text"
}
```

**SHA-256:**

```
0a49bf6ae22bceda28d1054c155a152542f8b4b56806f12f94002dd0f4c86232
```

**Keccak256:**

```
0x93b87f75a29975b199f227dfa7e777e522b466146672a95f42ee04b02233da0e
```

---

## Report 2 (`report2.json`)

**Input:**

```json
{
  "id": "report_1670000001_b",
  "createdAt": "2026-01-13T12:05:00.000Z",
  "type": "mixed",
  "textSummary": "Recorded account of incident; audio attached.",
  "audioFilename": "recording_001.m4a",
  "audioDuration": 42000,
  "metadata": { "location": "approx", "mood": "scared" }
}
```

**Canonical Form:**

```json
{
  "audioDuration": 42000,
  "audioFilename": "recording_001.m4a",
  "createdAt": "2026-01-13T12:05:00.000Z",
  "id": "report_1670000001_b",
  "metadata": { "location": "approx", "mood": "scared" },
  "textSummary": "Recorded account of incident; audio attached.",
  "type": "mixed"
}
```

**SHA-256:**

```
a01862d0166d29d0e1d75965af22ce4f03b36bc626746bc67b2820d94d3a4f53
```

**Keccak256:**

```
0x9eb7e2e871caf1a176200123512081930605de25fe6ba8be8a94926a19946613
```

---

## Notes

- These test vectors can be used to verify that the hashing implementation produces consistent results across different platforms and languages.
- When implementing client-side hashing, use these as reference outputs.
