# SafeGirlCore
The chain end of business

# SafeGirl Smart Contract - Technical Documentation

## Overview

The SafeGirl smart contract is a decentralized, survivor-controlled reporting system designed to provide immutable, encrypted, and auditable storage of sexual and gender-based violence (SGBV) reports. It is built on Solidity (v0.8+) and is suitable for deployment on EVM-compatible blockchains such as Polygon, Binance Smart Chain (BSC), or Ethereum.

---

## Features

* **Predefined Questions**: Survivors are guided through trauma-informed questions to help them document their experience.
* **Encrypted Report Submission**: Survivors submit a tamper-proof IPFS hash of their encrypted report along with responses to predefined questions.
* **Consent Management**: Survivors can grant and revoke access to trusted parties.
* **Immutable Logging**: All submissions and consent changes are logged on-chain for auditability.
* **Minimal On-Chain Data**: Only metadata, encrypted hashes, and responses are stored to ensure privacy.

---

## Smart Contract Structure

### Data Structures

```solidity
struct Report {
    string ipfsHash;
    uint256 timestamp;
    bool exists;
    string[] responses; // Responses to predefined questions
}

struct Consent {
    address viewer;
    uint256 grantedAt;
    bool active;
}
```

### State Variables

```solidity
string[] public questions; // Predefined questions for all use cases
mapping(address => Report) private reports;
mapping(address => Consent[]) private consentLogs;
```

---

## Contract Functions

### `submitReport(string _ipfsHash, string[] _responses)`

Submits a new encrypted report along with responses to predefined questions.

* **Access**: Public (only for sender)
* **Parameters**:

  * `_ipfsHash`: Encrypted IPFS hash of the report content.
  * `_responses`: Array of responses to predefined questions
* **Validation**: The number of responses must match the number of predefined questions
* **Events**: `ReportSubmitted`

### `grantAccess(address _viewer)`

Grants viewing access to a trusted third party.

* **Access**: Public (only for sender)
* **Parameters**:

  * `_viewer`: Wallet address to be granted access.
* **Events**: `ConsentGranted`

### `getQuestions()`
Returns the list of predefined questions.

* **Access**: Public
* **Returns**: Array of strings representing the questions.

### `revokeAccess(address _viewer)`

Revokes previously granted access.

* **Access**: Public (only for sender)
* **Parameters**:

  * `_viewer`: Wallet address to be revoked.
* **Events**: `ConsentRevoked`

### `getConsentLog(address _owner)`

Returns the full consent log for an address.

* **Access**: Public
* **Returns**: Array of `Consent` structs

### `getMyReport()`

Returns the report metadata of the sender.

* **Access**: Public (only for sender)
* **Returns**: `Report` struct

---

## Events

```solidity
event ReportSubmitted(address indexed reporter, uint256 timestamp, string ipfsHash);
event ConsentGranted(address indexed reporter, address indexed viewer, uint256 timestamp);
event ConsentRevoked(address indexed reporter, address indexed viewer, uint256 timestamp);
```

---

## Deployment Considerations

* **Blockchain**: Polygon (Mumbai for testnet), BSC Testnet, Ethereum Goerli
* **Gas Optimization**: Uses `uint256` and simple logic for minimal gas costs.
* **Security**:

  * No use of `delegatecall`
  * No storage of PII
  * Encrypted data handled off-chain

---

## Off-Chain Integration

* **Encryption**: AES-256 encryption using the survivor's public key.
* **Storage**: Encrypted payload uploaded to IPFS; hash stored on-chain.
* **Wallet**: Metamask or WalletConnect for interaction.
* **Frontend**: React/React Native app for user interaction.
* **API Middleware**: Node.js/Express or Python Flask to handle encryption and upload.

---

## Future Extensions

* Zero-knowledge proofs for anonymous verification
* DAO governance for referral partners
* Smart contract upgradeability using proxy patterns
* ...

---

## License

MIT

---

## Authors

* Blockchain Developer: \[BioKeyPer]
* UX/Trauma Design Lead: \[Courtney Price]
* Community Partner: \[Akiiki Labs]

---
