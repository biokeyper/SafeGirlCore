// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract SafeGirl {
    struct Report {
        string ipfsHash;         // Encrypted report stored on IPFS
        uint256 timestamp;       // Block timestamp when report was submitted
        bool exists;             // Whether report exists for this user
    }

    struct Consent {
        address viewer;
        uint256 grantedAt;
        bool active;
    }

    mapping(address => Report) private reports;
    mapping(address => Consent[]) private consentLogs;

    event ReportSubmitted(address indexed reporter, uint256 timestamp, string ipfsHash);
    event ConsentGranted(address indexed reporter, address indexed viewer, uint256 timestamp);
    event ConsentRevoked(address indexed reporter, address indexed viewer, uint256 timestamp);

    /// @notice Submit an encrypted report hash
    function submitReport(string calldata _ipfsHash) external {
        reports[msg.sender] = Report({
            ipfsHash: _ipfsHash,
            timestamp: block.timestamp,
            exists: true
        });

        emit ReportSubmitted(msg.sender, block.timestamp, _ipfsHash);
    }

    /// @notice Grant access to a trusted viewer (e.g., lawyer, NGO)
    function grantAccess(address _viewer) external {
        require(reports[msg.sender].exists, "No report submitted");

        consentLogs[msg.sender].push(Consent({
            viewer: _viewer,
            grantedAt: block.timestamp,
            active: true
        }));

        emit ConsentGranted(msg.sender, _viewer, block.timestamp);
    }

    /// @notice Revoke access previously granted
    function revokeAccess(address _viewer) external {
        require(reports[msg.sender].exists, "No report submitted");

        Consent[] storage logs = consentLogs[msg.sender];
        bool found = false;

        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].viewer == _viewer && logs[i].active) {
                logs[i].active = false;
                found = true;
                emit ConsentRevoked(msg.sender, _viewer, block.timestamp);
                break;
            }
        }

        require(found, "No active access found to revoke");
    }

    /// @notice Get list of all consent grants for auditing
    function getConsentLog(address _owner) external view returns (Consent[] memory) {
        return consentLogs[_owner];
    }

    /// @notice Get your own report metadata (not the content)
    function getMyReport() external view returns (Report memory) {
        require(reports[msg.sender].exists, "No report submitted");
        return reports[msg.sender];
    }
}
