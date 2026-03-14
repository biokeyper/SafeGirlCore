/**
 * SafeGirlCore — Report Hashing Utility
 *
 * This module provides functions to canonicalize and hash report payloads
 * according to the canonical-payload-schema.md specification.
 */

const crypto = require("crypto");

/**
 * Canonicalize a report object into a compact JSON string with sorted keys.
 * @param {Object} report - The report object to canonicalize
 * @returns {string} - Canonical JSON string (compact, sorted keys)
 */
function canonicalizeReport(report) {
  // Ensure all required fields are present
  const canonical = {
    audioDuration: report.audioDuration || 0,
    audioFilename: report.audioFilename || "",
    createdAt: report.createdAt,
    id: report.id,
    metadata: {},
    textSummary: report.textSummary || "",
    type: report.type,
  };

  // Sort metadata keys alphabetically
  if (report.metadata && typeof report.metadata === "object") {
    const sortedMetadata = {};
    Object.keys(report.metadata)
      .sort()
      .forEach((key) => {
        sortedMetadata[key] = report.metadata[key];
      });
    canonical.metadata = sortedMetadata;
  }

  // Return compact JSON (no whitespace)
  return JSON.stringify(canonical);
}

/**
 * Compute SHA-256 hash of a canonical report.
 * @param {string} canonicalJson - The canonical JSON string
 * @returns {string} - Hex string of the SHA-256 hash (lowercase)
 */
function sha256Hash(canonicalJson) {
  return crypto
    .createHash("sha256")
    .update(canonicalJson, "utf8")
    .digest("hex");
}

/**
 * Compute keccak256 hash of a canonical report (for on-chain compatibility).
 * Note: Prefers ethers.js (installed) and falls back to keccak256 package if present.
 * @param {string} canonicalJson - The canonical JSON string
 * @returns {string} - Hex string of the keccak256 hash (with 0x prefix)
 */
function keccak256Hash(canonicalJson) {
  try {
    // Try using ethers.js if available
    const { keccak256, toUtf8Bytes } = require("ethers");
    return keccak256(toUtf8Bytes(canonicalJson));
  } catch (e) {
    // Fallback to keccak package
    try {
      const keccakFn = require("keccak256");
      return "0x" + keccakFn(canonicalJson).toString("hex");
    } catch (e2) {
      throw new Error(
        "keccak256 requires ethers.js or keccak256 package. Install with: npm install ethers",
      );
    }
  }
}

/**
 * Complete workflow: canonicalize and hash a report.
 * @param {Object} report - The report object
 * @param {string} algorithm - 'sha256' (default) or 'keccak256'
 * @returns {Object} - Object with canonical, sha256, and optionally keccak256 hashes
 */
function hashReport(report, algorithm = "sha256") {
  const canonical = canonicalizeReport(report);
  const sha256 = sha256Hash(canonical);

  const result = {
    canonical,
    sha256,
  };

  if (algorithm === "keccak256" || algorithm === "both") {
    try {
      result.keccak256 = keccak256Hash(canonical);
    } catch (e) {
      result.keccak256Error = e.message;
    }
  }

  return result;
}

module.exports = {
  canonicalizeReport,
  sha256Hash,
  keccak256Hash,
  hashReport,
};

// CLI usage when run directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node hashReport.js <report-file.json> [algorithm]");
    console.log("  algorithm: sha256 (default), keccak256, or both");
    console.log("\nExample:");
    console.log("  node hashReport.js report.json");
    console.log("  node hashReport.js report.json both");
    process.exit(1);
  }

  const filePath = args[0];
  const algorithm = args[1] || "sha256";

  try {
    const fs = require("fs");
    const reportData = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const result = hashReport(reportData, algorithm);

    console.log("\n=== Report Hash Results ===");
    console.log("File:", filePath);
    console.log("\nCanonical JSON:");
    console.log(result.canonical);
    console.log("\nSHA-256 hash:");
    console.log(result.sha256);

    if (result.keccak256) {
      console.log("\nKeccak256 hash:");
      console.log(result.keccak256);
    }

    if (result.keccak256Error) {
      console.log("\nKeccak256 note:", result.keccak256Error);
    }

    console.log("\n");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}
