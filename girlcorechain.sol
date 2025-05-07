// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract SafeGirl is Ownable {
    using Counters for Counters.Counter;
    
    struct Report {
        string ipfsHash;
        uint256 timestamp;
        bool exists;
        string[] responses;
        Counters.Counter version;
    }

    struct Consent {
        address viewer;
        uint256 grantedAt;
        uint256 expiresAt;
        bool active;
    }

    struct EmergencyContact {
        address contactAddress;
        string contactType; // "NGO", "Lawyer", "Family", etc.
    }

    string[] public questions;
    mapping(address => Report) private reports;
    mapping(address => mapping(address => Consent)) private activeConsents;
    mapping(address => Consent[]) private consentLogs;
    mapping(address => EmergencyContact) private userEmergencyContacts;
    
    Counters.Counter private reportCount;
    uint256 public consentExpiryDuration = 30 days;
    bool public emergencyMode = false;

    event ReportSubmitted(address indexed reporter, uint256 timestamp, string ipfsHash, uint256 version);
    event ReportUpdated(address indexed reporter, uint256 timestamp, string newIpfsHash, uint256 version);
    event ConsentGranted(address indexed reporter, address indexed viewer, uint256 expiresAt);
    event ConsentRevoked(address indexed reporter, address indexed viewer);
    event PanicAlert(address indexed sender, uint256 timestamp, string message);
    event EmergencyContactSet(address indexed user, address contact, string contactType);
    event EmergencyModeActivated(string reason);

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

    function submitReport(string calldata _ipfsHash, string[] calldata _responses) external {
        require(bytes(_ipfsHash).length > 0, "IPFS hash cannot be empty");
        require(_responses.length == questions.length, "All questions must be answered");

        Report storage report = reports[msg.sender];
        report.ipfsHash = _ipfsHash;
        report.timestamp = block.timestamp;
        report.exists = true;
        report.responses = _responses;
        report.version.increment();

        reportCount.increment();
        emit ReportSubmitted(msg.sender, block.timestamp, _ipfsHash, report.version.current());
    }

    function updateReport(string calldata _newIpfsHash, string[] calldata _newResponses) external {
        require(reports[msg.sender].exists, "No report exists to update");
        require(bytes(_newIpfsHash).length > 0, "IPFS hash cannot be empty");
        require(_newResponses.length == questions.length, "All questions must be answered");

        Report storage report = reports[msg.sender];
        report.ipfsHash = _newIpfsHash;
        report.timestamp = block.timestamp;
        report.responses = _newResponses;
        report.version.increment();

        emit ReportUpdated(msg.sender, block.timestamp, _newIpfsHash, report.version.current());
    }

    // ========== CONSENT MANAGEMENT ==========

    function grantAccess(address _viewer, uint256 _customExpiry) external {
        require(reports[msg.sender].exists, "No report submitted");
        require(_viewer != address(0), "Invalid viewer address");
        require(_viewer != msg.sender, "Cannot grant access to self");
        
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

    function revokeAccess(address _viewer) external {
        require(activeConsents[msg.sender][_viewer].active, "No active access found");
        
        activeConsents[msg.sender][_viewer].active = false;
        emit ConsentRevoked(msg.sender, _viewer);
    }

    function batchRevokeAccess(address[] calldata _viewers) external {
        for (uint i = 0; i < _viewers.length; i++) {
            if (activeConsents[msg.sender][_viewers[i]].active) {
                activeConsents[msg.sender][_viewers[i]].active = false;
                emit ConsentRevoked(msg.sender, _viewers[i]);
            }
        }
    }

    // ========== EMERGENCY FEATURES ==========

    function panic(string calldata _locationData) external {
        require(bytes(_locationData).length > 0, "Location data required");
        
        address contact = userEmergencyContacts[msg.sender].contactAddress != address(0) ?
            userEmergencyContacts[msg.sender].contactAddress :
            owner();
            
        emit PanicAlert(msg.sender, block.timestamp, 
            string(abi.encodePacked("Emergency! Location: ", _locationData)));
    }

    function setEmergencyContact(address _contact, string calldata _contactType) external {
        require(_contact != address(0), "Invalid contact address");
        require(bytes(_contactType).length > 0, "Contact type required");
        
        userEmergencyContacts[msg.sender] = EmergencyContact({
            contactAddress: _contact,
            contactType: _contactType
        });
        
        emit EmergencyContactSet(msg.sender, _contact, _contactType);
    }

    function activateEmergencyMode(string calldata _reason) external onlyOwner {
        emergencyMode = true;
        emit EmergencyModeActivated(_reason);
    }

    // ========== ADMIN FUNCTIONS ==========

    function setConsentExpiryDuration(uint256 _newDuration) external onlyOwner {
        consentExpiryDuration = _newDuration;
    }

    function addQuestion(string calldata _newQuestion) external onlyOwner {
        questions.push(_newQuestion);
    }

    // ========== VIEW FUNCTIONS ==========

    function getReportVersion(address _user) external view returns (uint256) {
        require(reports[_user].exists, "No report exists");
        return reports[_user].version.current();
    }

    function getActiveConsents(address _user) external view returns (Consent[] memory) {
        Consent[] memory result = new Consent[](questions.length);
        uint counter = 0;
        
        for (uint i = 0; i < consentLogs[_user].length; i++) {
            if (consentLogs[_user][i].active && consentLogs[_user][i].expiresAt > block.timestamp) {
                result[counter] = consentLogs[_user][i];
                counter++;
            }
        }
        
        // Resize array to actual length
        assembly {
            mstore(result, counter)
        }
        
        return result;
    }

    function getTotalReports() external view returns (uint256) {
        return reportCount.current();
    }
}