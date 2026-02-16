/**
 * Encryption Service Tests
 */

const encryptionService = require('../services/encryption');

describe('Encryption Service', () => {
  const testPayload = {
    payload: { text: 'test report', audio: 'base64audio' },
    responses: ['answer1', 'answer2', 'answer3', 'answer4', 'answer5'],
    metadata: { location: 'Nairobi' }
  };
  const reportId = 'test_report_123';

  describe('encryptPayload', () => {
    test('should encrypt payload with random key', async () => {
      const result = await encryptionService.encryptPayload(testPayload, reportId);

      expect(result).toHaveProperty('encryptedData');
      expect(result).toHaveProperty('reportKey');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');

      // Encrypted data should be hex
      expect(/^[0-9a-f]*$/.test(result.encryptedData)).toBe(true);
    });

    test('should generate different keys for different payloads', async () => {
      const result1 = await encryptionService.encryptPayload(testPayload, reportId);
      const result2 = await encryptionService.encryptPayload(testPayload, reportId);

      // Keys should be different (random)
      expect(result1.reportKey).not.toBe(result2.reportKey);
      expect(result1.iv).not.toBe(result2.iv);
    });
  });

  describe('decryptPayload', () => {
    test('should decrypt encrypted payload correctly', async () => {
      const encrypted = await encryptionService.encryptPayload(testPayload, reportId);

      const decrypted = await encryptionService.decryptPayload(
        encrypted.encryptedData,
        encrypted.reportKey,
        encrypted.iv,
        encrypted.authTag,
        reportId
      );

      expect(decrypted.payload).toEqual(testPayload.payload);
      expect(decrypted.responses).toEqual(testPayload.responses);
      expect(decrypted.metadata).toEqual(testPayload.metadata);
    });

    test('should fail with wrong auth tag', async () => {
      const encrypted = await encryptionService.encryptPayload(testPayload, reportId);

      // Corrupt the auth tag
      const wrongTag = 'ffffffffffffffffffffffffffffffff';

      await expect(
        encryptionService.decryptPayload(
          encrypted.encryptedData,
          encrypted.reportKey,
          encrypted.iv,
          wrongTag,
          reportId
        )
      ).rejects.toThrow();
    });

    test('should fail with wrong key', async () => {
      const encrypted = await encryptionService.encryptPayload(testPayload, reportId);

      // Wrong key
      const wrongKey = '0000000000000000000000000000000000000000000000000000000000000000';

      await expect(
        encryptionService.decryptPayload(
          encrypted.encryptedData,
          wrongKey,
          encrypted.iv,
          encrypted.authTag,
          reportId
        )
      ).rejects.toThrow();
    });
  });

  describe('encryptKey', () => {
    test('should encrypt key with master key', () => {
      const reportKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

      const result = encryptionService.encryptKey(reportKey, reportId);

      expect(result).toHaveProperty('encryptedKey');
      expect(result).toHaveProperty('keyIv');
      expect(result).toHaveProperty('keyAuthTag');

      // Should be different from original
      expect(result.encryptedKey).not.toBe(reportKey);
    });
  });

  describe('decryptKey', () => {
    test('should decrypt key correctly', () => {
      const reportKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

      const encrypted = encryptionService.encryptKey(reportKey, reportId);
      const decrypted = encryptionService.decryptKey(
        encrypted.encryptedKey,
        encrypted.keyIv,
        encrypted.keyAuthTag,
        reportId
      );

      expect(decrypted).toBe(reportKey);
    });

    test('should fail with wrong auth tag', () => {
      const reportKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

      const encrypted = encryptionService.encryptKey(reportKey, reportId);

      expect(() => {
        encryptionService.decryptKey(
          encrypted.encryptedKey,
          encrypted.keyIv,
          'ffffffffffffffffffffffffffffffff',
          reportId
        );
      }).toThrow();
    });
  });

  describe('PIN hashing', () => {
    test('should hash PIN consistently', () => {
      const pin = '1234';

      const hash1 = encryptionService.hashPin(pin);
      const hash2 = encryptionService.hashPin(pin);

      expect(hash1).toBe(hash2);
    });

    test('should verify PIN correctly', () => {
      const pin = '1234';
      const hash = encryptionService.hashPin(pin);

      expect(encryptionService.verifyPin(pin, hash)).toBe(true);
      expect(encryptionService.verifyPin('5678', hash)).toBe(false);
    });
  });
});
