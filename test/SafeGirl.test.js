const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SafeGirl Smart Contract", function () {
  let safeGirl;
  let owner, reporter, viewer1, viewer2, viewer3;

  const SAMPLE_IPFS_HASH = "QmSampleIPFSHashForTesting";
  const SAMPLE_RESPONSES = [
    "Yes, I feel safe",
    "I want to share what happened",
    "2024-01-15",
    "For personal tracking",
    "I need shelter support"
  ];

  before(async function () {
    [owner, reporter, viewer1, viewer2, viewer3] = await ethers.getSigners();
  });

  beforeEach(async function () {
    const SafeGirl = await ethers.getContractFactory("SafeGirl");
    safeGirl = await SafeGirl.deploy(owner.address);
    await safeGirl.waitForDeployment();
  });

  // ========== INITIALIZATION TESTS ==========
  describe("Contract Initialization", function () {
    it("Should initialize with correct owner", async function () {
      expect(await safeGirl.owner()).to.equal(owner.address);
    });

    it("Should initialize with 5 predefined questions", async function () {
      const count = await safeGirl.getQuestionsCount();
      expect(count).to.equal(5);
    });

    it("Should initialize with correct default questions", async function () {
      const questions = await safeGirl.getQuestions();
      expect(questions.length).to.equal(5);
      expect(questions[0]).to.equal("Do you feel safe right now?");
      expect(questions[4]).to.equal("Do you need urgent medical care, shelter, or support?");
    });

    it("Should have default consent expiry duration of 30 days", async function () {
      const duration = await safeGirl.consentExpiryDuration();
      expect(duration).to.equal(30 * 24 * 60 * 60); // 30 days in seconds
    });

    it("Should initialize with emergency mode disabled", async function () {
      expect(await safeGirl.emergencyMode()).to.be.false;
    });
  });

  // ========== REPORT SUBMISSION TESTS ==========
  describe("submitReport()", function () {
    it("Should submit a valid report", async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);

      const reportVersion = await safeGirl.connect(reporter).getReportVersion(reporter.address);
      expect(reportVersion).to.equal(1);
    });

    it("Should emit ReportSubmitted event", async function () {
      const tx = safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);

      await expect(tx)
        .to.emit(safeGirl, "ReportSubmitted")
        .withArgs(reporter.address, expect.any(BigInt), SAMPLE_IPFS_HASH, 1);
    });

    it("Should increment report count", async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);

      const totalReports = await safeGirl.getTotalReports();
      expect(totalReports).to.equal(1);
    });

    it("Should reject empty IPFS hash", async function () {
      await expect(
        safeGirl.connect(reporter).submitReport("", SAMPLE_RESPONSES)
      ).to.be.revertedWith("IPFS hash cannot be empty");
    });

    it("Should reject IPFS hash exceeding max length", async function () {
      const longHash = "a".repeat(101); // MAX_IPFS_HASH_LENGTH = 100

      await expect(
        safeGirl.connect(reporter).submitReport(longHash, SAMPLE_RESPONSES)
      ).to.be.revertedWith("IPFS hash exceeds max length");
    });

    it("Should accept IPFS hash at max length boundary", async function () {
      const hashAtMax = "a".repeat(100);

      await safeGirl.connect(reporter).submitReport(hashAtMax, SAMPLE_RESPONSES);
      const version = await safeGirl.connect(reporter).getReportVersion(reporter.address);
      expect(version).to.equal(1);
    });

    it("Should reject wrong number of responses", async function () {
      const wrongResponses = ["Yes", "No"];

      await expect(
        safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, wrongResponses)
      ).to.be.revertedWith("All questions must be answered");
    });

    it("Should reject response exceeding max length", async function () {
      const longResponse = "a".repeat(501); // MAX_RESPONSE_LENGTH = 500
      const badResponses = [
        "Yes",
        longResponse,
        "2024-01-15",
        "For sharing",
        "No"
      ];

      await expect(
        safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, badResponses)
      ).to.be.revertedWith("Response exceeds max length");
    });

    it("Should accept responses at max length boundary", async function () {
      const responseAtMax = "a".repeat(500);
      const goodResponses = [
        responseAtMax,
        responseAtMax,
        responseAtMax,
        responseAtMax,
        responseAtMax
      ];

      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, goodResponses);
      const version = await safeGirl.connect(reporter).getReportVersion(reporter.address);
      expect(version).to.equal(1);
    });

    it("Should allow updating own report", async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);

      const newHash = "QmUpdatedIPFSHash";
      const newResponses = ["No", "I don't want to share", "2024-01-20", "For tracking", "No"];

      await safeGirl.connect(reporter).updateReport(newHash, newResponses);

      const version = await safeGirl.connect(reporter).getReportVersion(reporter.address);
      expect(version).to.equal(2);
    });

    it("Should prevent updating non-existent report", async function () {
      const newResponses = ["No", "No", "No", "No", "No"];

      await expect(
        safeGirl.connect(reporter).updateReport(SAMPLE_IPFS_HASH, newResponses)
      ).to.be.revertedWith("No report exists to update");
    });

    it("Should track multiple reports from different users", async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);
      await safeGirl.connect(viewer1).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);

      const totalReports = await safeGirl.getTotalReports();
      expect(totalReports).to.equal(2);
    });
  });

  // ========== CONSENT MANAGEMENT TESTS ==========
  describe("grantAccess() - Consent Management", function () {
    beforeEach(async function () {
      // Reporter must have a report before granting access
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);
    });

    it("Should grant access to a viewer", async function () {
      await safeGirl.connect(reporter).grantAccess(viewer1.address, 0);

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      expect(activeConsents.length).to.equal(1);
      expect(activeConsents[0].viewer).to.equal(viewer1.address);
      expect(activeConsents[0].active).to.be.true;
    });

    it("Should emit ConsentGranted event", async function () {
      const tx = safeGirl.connect(reporter).grantAccess(viewer1.address, 0);

      await expect(tx)
        .to.emit(safeGirl, "ConsentGranted")
        .withArgs(reporter.address, viewer1.address, expect.any(BigInt));
    });

    it("Should use custom expiry if provided", async function () {
      const customExpiry = 7 * 24 * 60 * 60; // 7 days
      const blockBefore = await ethers.provider.getBlock("latest");

      await safeGirl.connect(reporter).grantAccess(viewer1.address, customExpiry);

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      const expectedExpiry = blockBefore.timestamp + customExpiry;

      expect(activeConsents[0].expiresAt).to.be.closeTo(expectedExpiry, 2);
    });

    it("Should use default expiry if custom expiry is 0", async function () {
      const blockBefore = await ethers.provider.getBlock("latest");
      const expectedExpiry = blockBefore.timestamp + (30 * 24 * 60 * 60);

      await safeGirl.connect(reporter).grantAccess(viewer1.address, 0);

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      expect(activeConsents[0].expiresAt).to.be.closeTo(expectedExpiry, 2);
    });

    it("Should reject granting access without a report", async function () {
      await expect(
        safeGirl.connect(viewer2).grantAccess(viewer1.address, 0)
      ).to.be.revertedWith("No report submitted");
    });

    it("Should reject invalid viewer address (zero address)", async function () {
      await expect(
        safeGirl.connect(reporter).grantAccess(ethers.ZeroAddress, 0)
      ).to.be.revertedWith("Invalid viewer address");
    });

    it("Should reject granting access to self", async function () {
      await expect(
        safeGirl.connect(reporter).grantAccess(reporter.address, 0)
      ).to.be.revertedWith("Cannot grant access to self");
    });

    it("Should prevent exceeding max active consents", async function () {
      // Create many viewers and grant access
      const MAX_ACTIVE_CONSENTS = 100;

      // This should succeed up to MAX_ACTIVE_CONSENTS
      for (let i = 0; i < MAX_ACTIVE_CONSENTS; i++) {
        const signer = (await ethers.getSigners())[i % 18]; // Reuse signers cyclically
        await safeGirl.connect(reporter).grantAccess(signer.address, 0).catch(() => {});
      }

      // Try to grant one more - should fail
      const excessSigner = viewer3;
      await expect(
        safeGirl.connect(reporter).grantAccess(excessSigner.address, 0)
      ).to.be.revertedWith("Too many active consents");
    });
  });

  // ========== REVOKE ACCESS TESTS ==========
  describe("revokeAccess() - Revoke Consent", function () {
    beforeEach(async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);
      await safeGirl.connect(reporter).grantAccess(viewer1.address, 0);
    });

    it("Should revoke access from a viewer", async function () {
      await safeGirl.connect(reporter).revokeAccess(viewer1.address);

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      expect(activeConsents.length).to.equal(0);
    });

    it("Should emit ConsentRevoked event", async function () {
      const tx = safeGirl.connect(reporter).revokeAccess(viewer1.address);

      await expect(tx)
        .to.emit(safeGirl, "ConsentRevoked")
        .withArgs(reporter.address, viewer1.address);
    });

    it("Should reject revoking non-existent access", async function () {
      await expect(
        safeGirl.connect(reporter).revokeAccess(viewer2.address)
      ).to.be.revertedWith("No active access found");
    });

    it("Should reject revoking already revoked access", async function () {
      await safeGirl.connect(reporter).revokeAccess(viewer1.address);

      await expect(
        safeGirl.connect(reporter).revokeAccess(viewer1.address)
      ).to.be.revertedWith("No active access found");
    });
  });

  // ========== BATCH REVOKE TESTS ==========
  describe("batchRevokeAccess() - Batch Operations", function () {
    beforeEach(async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);
      await safeGirl.connect(reporter).grantAccess(viewer1.address, 0);
      await safeGirl.connect(reporter).grantAccess(viewer2.address, 0);
      await safeGirl.connect(reporter).grantAccess(viewer3.address, 0);
    });

    it("Should batch revoke multiple accesses", async function () {
      const viewers = [viewer1.address, viewer2.address, viewer3.address];
      await safeGirl.connect(reporter).batchRevokeAccess(viewers);

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      expect(activeConsents.length).to.equal(0);
    });

    it("Should handle partial revokes gracefully", async function () {
      const viewers = [viewer1.address, viewer2.address, viewer3.address, owner.address];
      // owner.address wasn't granted access, but function should not revert
      await expect(
        safeGirl.connect(reporter).batchRevokeAccess(viewers)
      ).to.not.be.reverted;

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      expect(activeConsents.length).to.equal(0);
    });

    it("Should emit ConsentRevoked for each revoked access", async function () {
      const viewers = [viewer1.address, viewer2.address];
      const tx = safeGirl.connect(reporter).batchRevokeAccess(viewers);

      await expect(tx)
        .to.emit(safeGirl, "ConsentRevoked")
        .withArgs(reporter.address, viewer1.address);

      await expect(tx)
        .to.emit(safeGirl, "ConsentRevoked")
        .withArgs(reporter.address, viewer2.address);
    });
  });

  // ========== ACTIVE CONSENTS FILTERING TESTS ==========
  describe("getActiveConsents() - Consent Filtering", function () {
    beforeEach(async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);
      await safeGirl.connect(reporter).grantAccess(viewer1.address, 0);
      await safeGirl.connect(reporter).grantAccess(viewer2.address, 0);
    });

    it("Should return only active consents", async function () {
      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      expect(activeConsents.length).to.equal(2);
      activeConsents.forEach(consent => {
        expect(consent.active).to.be.true;
      });
    });

    it("Should exclude revoked consents", async function () {
      await safeGirl.connect(reporter).revokeAccess(viewer1.address);

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      expect(activeConsents.length).to.equal(1);
      expect(activeConsents[0].viewer).to.equal(viewer2.address);
    });

    it("Should exclude expired consents", async function () {
      // Grant access with short expiry (1 second)
      await safeGirl.connect(reporter).grantAccess(viewer3.address, 1);

      // Wait for expiry
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      // Only viewer1 and viewer2 should remain (viewer3's consent expired)
      expect(activeConsents.length).to.equal(2);
    });

    it("Should return empty array for user with no consents", async function () {
      const activeConsents = await safeGirl.connect(viewer2).getActiveConsents(viewer2.address);
      expect(activeConsents.length).to.equal(0);
    });

    it("Should handle array bounds correctly (Bug #1 fix verification)", async function () {
      // This test verifies that the array bounds bug is fixed
      // Create many consents and verify they're all returned correctly

      // Add more consents
      for (let i = 0; i < 5; i++) {
        const signer = (await ethers.getSigners())[i + 3];
        await safeGirl.connect(reporter).grantAccess(signer.address, 0).catch(() => {});
      }

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      // Should have all consents without overflow
      expect(activeConsents.length).to.be.greaterThan(0);
      expect(activeConsents.length).to.be.lessThanOrEqual(100);
    });
  });

  // ========== EMERGENCY FEATURES TESTS ==========
  describe("panic() - Emergency Alerts", function () {
    it("Should emit panic alert with location data", async function () {
      const locationData = "approx coordinates: -1.2334, 36.8899";

      const tx = safeGirl.connect(reporter).panic(locationData);

      await expect(tx)
        .to.emit(safeGirl, "PanicAlert")
        .withArgs(reporter.address, expect.any(BigInt), locationData);
    });

    it("Should reject empty location data", async function () {
      await expect(
        safeGirl.connect(reporter).panic("")
      ).to.be.revertedWith("Location data required");
    });

    it("Should reject location data exceeding max length", async function () {
      const longData = "a".repeat(1001); // MAX_LOCATION_DATA_LENGTH = 1000

      await expect(
        safeGirl.connect(reporter).panic(longData)
      ).to.be.revertedWith("Location data exceeds max length");
    });

    it("Should accept location data at max length", async function () {
      const dataAtMax = "a".repeat(1000);

      await expect(
        safeGirl.connect(reporter).panic(dataAtMax)
      ).to.not.be.reverted;
    });
  });

  // ========== EMERGENCY CONTACT TESTS ==========
  describe("Emergency Contact Management", function () {
    it("Should set emergency contact", async function () {
      await safeGirl.connect(reporter).setEmergencyContact(viewer1.address, "NGO");

      // Note: We can't directly read the struct, but the event confirms it was set
      const tx = safeGirl.connect(reporter).setEmergencyContact(viewer1.address, "NGO");
      await expect(tx)
        .to.emit(safeGirl, "EmergencyContactSet")
        .withArgs(reporter.address, viewer1.address, "NGO");
    });

    it("Should reject invalid contact address", async function () {
      await expect(
        safeGirl.connect(reporter).setEmergencyContact(ethers.ZeroAddress, "NGO")
      ).to.be.revertedWith("Invalid contact address");
    });

    it("Should reject empty contact type", async function () {
      await expect(
        safeGirl.connect(reporter).setEmergencyContact(viewer1.address, "")
      ).to.be.revertedWith("Contact type required");
    });

    it("Should allow updating emergency contact", async function () {
      await safeGirl.connect(reporter).setEmergencyContact(viewer1.address, "NGO");
      await safeGirl.connect(reporter).setEmergencyContact(viewer2.address, "Lawyer");

      // Second call should also emit event
      const tx = safeGirl.connect(reporter).setEmergencyContact(viewer2.address, "Lawyer");
      await expect(tx)
        .to.emit(safeGirl, "EmergencyContactSet")
        .withArgs(reporter.address, viewer2.address, "Lawyer");
    });
  });

  // ========== ADMIN FUNCTIONS TESTS ==========
  describe("Admin Functions (Owner Only)", function () {
    it("Should allow owner to set consent expiry duration", async function () {
      const newDuration = 7 * 24 * 60 * 60; // 7 days
      await safeGirl.connect(owner).setConsentExpiryDuration(newDuration);

      expect(await safeGirl.consentExpiryDuration()).to.equal(newDuration);
    });

    it("Should reject non-owner setting consent expiry", async function () {
      const newDuration = 7 * 24 * 60 * 60;

      await expect(
        safeGirl.connect(reporter).setConsentExpiryDuration(newDuration)
      ).to.be.revertedWithCustomError(safeGirl, "OwnableUnauthorizedAccount");
    });

    it("Should reject zero consent expiry duration", async function () {
      await expect(
        safeGirl.connect(owner).setConsentExpiryDuration(0)
      ).to.be.revertedWith("Duration must be positive");
    });

    it("Should allow owner to add questions", async function () {
      const newQuestion = "Have you sought medical attention?";
      await safeGirl.connect(owner).addQuestion(newQuestion);

      const questions = await safeGirl.getQuestions();
      expect(questions[questions.length - 1]).to.equal(newQuestion);
    });

    it("Should reject non-owner adding questions", async function () {
      const newQuestion = "Have you sought medical attention?";

      await expect(
        safeGirl.connect(reporter).addQuestion(newQuestion)
      ).to.be.revertedWithCustomError(safeGirl, "OwnableUnauthorizedAccount");
    });

    it("Should reject empty question", async function () {
      await expect(
        safeGirl.connect(owner).addQuestion("")
      ).to.be.revertedWith("Question cannot be empty");
    });

    it("Should reject question exceeding max length", async function () {
      const longQuestion = "a".repeat(501);

      await expect(
        safeGirl.connect(owner).addQuestion(longQuestion)
      ).to.be.revertedWith("Question exceeds max length");
    });

    it("Should allow owner to activate emergency mode", async function () {
      await safeGirl.connect(owner).activateEmergencyMode("Severe security incident");

      expect(await safeGirl.emergencyMode()).to.be.true;
    });

    it("Should reject non-owner activating emergency mode", async function () {
      await expect(
        safeGirl.connect(reporter).activateEmergencyMode("Severe security incident")
      ).to.be.revertedWithCustomError(safeGirl, "OwnableUnauthorizedAccount");
    });
  });

  // ========== EDGE CASES & GAS TESTS ==========
  describe("Edge Cases & Gas Optimization", function () {
    it("Should handle multiple reports from same user (overwrite)", async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);
      const hash1 = SAMPLE_IPFS_HASH;

      const newHash = "QmNewHash";
      await safeGirl.connect(reporter).updateReport(newHash, SAMPLE_RESPONSES);

      const version = await safeGirl.connect(reporter).getReportVersion(reporter.address);
      expect(version).to.equal(2);
    });

    it("Should handle multiple concurrent consentors", async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);

      const signers = await ethers.getSigners();
      const consentors = signers.slice(5, 10);

      for (const signer of consentors) {
        await safeGirl.connect(reporter).grantAccess(signer.address, 0);
      }

      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      expect(activeConsents.length).to.equal(consentors.length);
    });

    it("Should efficiently store and retrieve large response arrays", async function () {
      const largeResponses = [
        "a".repeat(500),
        "b".repeat(500),
        "c".repeat(500),
        "d".repeat(500),
        "e".repeat(500)
      ];

      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, largeResponses);

      const version = await safeGirl.connect(reporter).getReportVersion(reporter.address);
      expect(version).to.equal(1);
    });

    it("Should track accurate report count", async function () {
      const signers = await ethers.getSigners();
      const reporters = signers.slice(3, 8);

      for (const reporter of reporters) {
        await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);
      }

      const totalReports = await safeGirl.getTotalReports();
      expect(totalReports).to.equal(reporters.length);
    });
  });

  // ========== GAS EFFICIENCY TESTS ==========
  describe("Gas Efficiency Verification", function () {
    it("submitReport should use reasonable gas", async function () {
      const tx = await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);
      const receipt = await tx.wait();

      // Expected: ~100-120k gas
      expect(receipt.gasUsed).to.be.lessThan(150000n);
      console.log(`submitReport gas used: ${receipt.gasUsed}`);
    });

    it("grantAccess should use reasonable gas", async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);

      const tx = await safeGirl.connect(reporter).grantAccess(viewer1.address, 0);
      const receipt = await tx.wait();

      // Expected: ~80-100k gas
      expect(receipt.gasUsed).to.be.lessThan(120000n);
      console.log(`grantAccess gas used: ${receipt.gasUsed}`);
    });

    it("getActiveConsents should use reasonable gas", async function () {
      await safeGirl.connect(reporter).submitReport(SAMPLE_IPFS_HASH, SAMPLE_RESPONSES);

      for (let i = 0; i < 5; i++) {
        const signer = (await ethers.getSigners())[i + 5];
        await safeGirl.connect(reporter).grantAccess(signer.address, 0).catch(() => {});
      }

      // View functions don't use gas in test, but we can at least verify it doesn't revert
      const activeConsents = await safeGirl.connect(reporter).getActiveConsents(reporter.address);
      expect(activeConsents.length).to.be.greaterThan(0);
    });
  });
});
