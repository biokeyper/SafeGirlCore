// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SafeGirl is Ownable {
    // ========== CONSTANTS ==========
    uint256 public constant MAX_IPFS_HASH_LENGTH = 100;      // ~46 chars for CIDv1
    uint256 public constant MAX_RESPONSE_LENGTH = 500;       // Per response string
    uint256 public constant MAX_LOCATION_DATA_LENGTH = 1000; // Panic location data
    uint256 public constant MAX_ACTIVE_CONSENTS = 100;       // Prevent unbounded loops

    // ========== DATA STRUCTURES ==========
    struct Report {
        string ipfsHash;
        uint256 timestamp;
        bool exists;
        string[] responses;
        uint256 version;
    }

    struct Consent {
        address viewer;
        uint256 grantedAt;
        uint256 expiresAt;
        bool active;
    }

    struct EmergencyContact {
        address contactAddress;
        string contactType;
    }

    // ========== STATE VARIABLES ==========
    string[] public questions;
    mapping(address => Report) private reports;
    mapping(address => mapping(address => Consent)) private activeConsents;
    mapping(address => Consent[]) private consentLogs;
    mapping(address => EmergencyContact) private userEmergencyContacts;

    uint256 private reportCount;
    uint256 public consentExpiryDuration = 30 days;
    bool public emergencyMode = false;

    // ========== EVENTS ==========
    event ReportSubmitted(address indexed reporter, uint256 timestamp, string ipfsHash, uint256 version);
    event ReportUpdated(address indexed reporter, uint256 timestamp, string newIpfsHash, uint256 version);
    event ConsentGranted(address indexed reporter, address indexed viewer, uint256 expiresAt);
    event ConsentRevoked(address indexed reporter, address indexed viewer);
    event PanicAlert(address indexed sender, uint256 timestamp, string locationData);
    event EmergencyContactSet(address indexed user, address contact, string contactType);
    event EmergencyModeActivated(string reason);

    // ========== CONSTRUCTOR ==========
    constructor(address initialOwner) Ownable(initialOwner) {
        initializeQuestions();
    }

    function initializeQuestions() private {
        questions.push("Do you feel safe right now?");
        questions.push("Would you like to share what happened?");
        questions.push("When did the incident happen?");
        questions.push("Do you want to record this for personal tracking, or to share it later?");
        questions.push("Do you need urgent medical care, shelter, or support?");
    }

    // ========== CORE FUNCTIONALITIES ==========

    /// @notice Submit a new encrypted report with responses to predefined questions
    /// @param _ipfsHash The IPFS hash of the encrypted report
    /// @param _responses Array of responses to predefined questions
    function submitReport(string calldata _ipfsHash, string[] calldata _responses) external {
        // Validate IPFS hash
        require(bytes(_ipfsHash).length > 0, "IPFS hash cannot be empty");
        require(bytes(_ipfsHash).length <= MAX_IPFS_HASH_LENGTH, "IPFS hash exceeds max length");

        // Validate responses count and length
        require(_responses.length == questions.length, "All questions must be answered");

        for (uint256 i = 0; i < _responses.length; i++) {
            require(bytes(_responses[i]).length <= MAX_RESPONSE_LENGTH, "Response exceeds max length");
        }

        Report storage report = reports[msg.sender];
        report.ipfsHash = _ipfsHash;
        report.timestamp = block.timestamp;
        report.exists = true;
        report.responses = _responses;
        report.version++;

        reportCount++;
        emit ReportSubmitted(msg.sender, block.timestamp, _ipfsHash, report.version);
    }

    /// @notice Update an existing report with new data
    /// @param _newIpfsHash The new IPFS hash
    /// @param _newResponses Updated responses to questions
    function updateReport(string calldata _newIpfsHash, string[] calldata _newResponses) external {
        require(reports[msg.sender].exists, "No report exists to update");
        require(bytes(_newIpfsHash).length > 0, "IPFS hash cannot be empty");
        require(bytes(_newIpfsHash).length <= MAX_IPFS_HASH_LENGTH, "IPFS hash exceeds max length");
        require(_newResponses.length == questions.length, "All questions must be answered");

        for (uint256 i = 0; i < _newResponses.length; i++) {
            require(bytes(_newResponses[i]).length <= MAX_RESPONSE_LENGTH, "Response exceeds max length");
        }

        Report storage report = reports[msg.sender];
        report.ipfsHash = _newIpfsHash;
        report.timestamp = block.timestamp;
        report.responses = _newResponses;
        report.version++;

        emit ReportUpdated(msg.sender, block.timestamp, _newIpfsHash, report.version);
    }

    // ========== CONSENT MANAGEMENT ==========

    /// @notice Grant access to a viewer with optional custom expiry
    /// @param _viewer Address to grant access to
    /// @param _customExpiry Custom expiry duration in seconds (0 = use default)
    function grantAccess(address _viewer, uint256 _customExpiry) external {
        require(reports[msg.sender].exists, "No report submitted");
        require(_viewer != address(0), "Invalid viewer address");
        require(_viewer != msg.sender, "Cannot grant access to self");

        // Check that we don't exceed max active consents to prevent DoS
        uint256 activeCount = _countActiveConsents(msg.sender);
        require(activeCount < MAX_ACTIVE_CONSENTS, "Too many active consents");

        uint256 expiryTime = _customExpiry > 0 ?
            block.timestamp + _customExpiry :
            block.timestamp + consentExpiryDuration;

        Consent memory newConsent = Consent({
            viewer: _viewer,
            grantedAt: block.timestamp,
            expiresAt: expiryTime,
            active: true
        });

        activeConsents[msg.sender][_viewer] = newConsent;
        consentLogs[msg.sender].push(newConsent);

        emit ConsentGranted(msg.sender, _viewer, expiryTime);
    }

    /// @notice Revoke access for a specific viewer
    /// @param _viewer Address to revoke access from
    function revokeAccess(address _viewer) external {
        require(activeConsents[msg.sender][_viewer].active, "No active access found");

        activeConsents[msg.sender][_viewer].active = false;
        emit ConsentRevoked(msg.sender, _viewer);
    }

    /// @notice Batch revoke access for multiple viewers
    /// @param _viewers Array of addresses to revoke access from
    function batchRevokeAccess(address[] calldata _viewers) external {
        for (uint256 i = 0; i < _viewers.length; i++) {
            if (activeConsents[msg.sender][_viewers[i]].active) {
                activeConsents[msg.sender][_viewers[i]].active = false;
                emit ConsentRevoked(msg.sender, _viewers[i]);
            }
        }
    }

    // ========== EMERGENCY FEATURES ==========

    /// @notice Send a panic alert with location data
    /// @param _locationData Location information (encrypted or obfuscated)
    function panic(string calldata _locationData) external {
        require(bytes(_locationData).length > 0, "Location data required");
        require(bytes(_locationData).length <= MAX_LOCATION_DATA_LENGTH, "Location data exceeds max length");

        emit PanicAlert(msg.sender, block.timestamp, _locationData);
    }

    /// @notice Set an emergency contact for panic alerts
    /// @param _contact Address of the emergency contact
    /// @param _contactType Type of contact (e.g., "NGO", "Lawyer", "Family")
    function setEmergencyContact(address _contact, string calldata _contactType) external {
        require(_contact != address(0), "Invalid contact address");
        require(bytes(_contactType).length > 0, "Contact type required");

        userEmergencyContacts[msg.sender] = EmergencyContact({
            contactAddress: _contact,
            contactType: _contactType
        });

        emit EmergencyContactSet(msg.sender, _contact, _contactType);
    }

    /// @notice Activate emergency mode (owner only)
    /// @param _reason Reason for activating emergency mode
    function activateEmergencyMode(string calldata _reason) external onlyOwner {
        emergencyMode = true;
        emit EmergencyModeActivated(_reason);
    }

    // ========== ADMIN FUNCTIONS ==========

    /// @notice Set the default consent expiry duration (owner only)
    /// @param _newDuration New duration in seconds
    function setConsentExpiryDuration(uint256 _newDuration) external onlyOwner {
        require(_newDuration > 0, "Duration must be positive");
        consentExpiryDuration = _newDuration;
    }

    /// @notice Add a new predefined question (owner only)
    /// @param _newQuestion The question text
    function addQuestion(string calldata _newQuestion) external onlyOwner {
        require(bytes(_newQuestion).length > 0, "Question cannot be empty");
        require(bytes(_newQuestion).length <= MAX_RESPONSE_LENGTH, "Question exceeds max length");
        questions.push(_newQuestion);
    }

    // ========== VIEW FUNCTIONS ==========

    /// @notice Get the current version of a user's report
    /// @param _user Address of the report owner
    /// @return Version number of the report
    function getReportVersion(address _user) external view returns (uint256) {
        require(reports[_user].exists, "No report exists");
        return reports[_user].version;
    }

    /// @notice Get all active and non-expired consents for a user
    /// @param _user Address to query consents for
    /// @return Array of active Consent structs
    function getActiveConsents(address _user) external view returns (Consent[] memory) {
        // First, count active consents to allocate correct array size
        uint256 count = _countActiveConsents(_user);

        // Allocate array with correct size (no buffer overflow)
        Consent[] memory result = new Consent[](count);
        uint256 index = 0;

        // Fill array with active consents
        for (uint256 i = 0; i < consentLogs[_user].length; i++) {
            if (consentLogs[_user][i].active && consentLogs[_user][i].expiresAt > block.timestamp) {
                result[index] = consentLogs[_user][i];
                index++;
            }
        }

        return result;
    }

    /// @notice Get the total number of reports submitted
    /// @return Total count of reports
    function getTotalReports() external view returns (uint256) {
        return reportCount;
    }

    /// @notice Get the number of questions in the survey
    /// @return Length of questions array
    function getQuestionsCount() external view returns (uint256) {
        return questions.length;
    }

    /// @notice Get all predefined questions
    /// @return Array of question strings
    function getQuestions() external view returns (string[] memory) {
        return questions;
    }

    // ========== INTERNAL HELPER FUNCTIONS ==========

    /// @notice Count active non-expired consents for a user (prevents unbounded loop)
    /// @param _user Address to count consents for
    /// @return Number of active consents
    function _countActiveConsents(address _user) internal view returns (uint256) {
        uint256 count = 0;
        uint256 logLength = consentLogs[_user].length;

        // Cap iteration to prevent gas exhaustion
        uint256 iterationLimit = logLength > MAX_ACTIVE_CONSENTS ? MAX_ACTIVE_CONSENTS : logLength;

        for (uint256 i = 0; i < iterationLimit; i++) {
            if (consentLogs[_user][i].active && consentLogs[_user][i].expiresAt > block.timestamp) {
                count++;
            }
        }

        return count;
    }
}
