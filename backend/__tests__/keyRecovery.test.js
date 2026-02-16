/**
 * Key Recovery Controller Tests
 */

const keyRecoveryController = require('../controllers/keyRecoveryController');

describe('Key Recovery Controller', () => {
  describe('PIN encryption/decryption', () => {
    const testKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
    const testPin = '1234';

    test('should encrypt key with PIN', () => {
      const result = keyRecoveryController.encryptKeyWithPin(testKey, testPin);

      expect(result).toHaveProperty('encryptedKey');
      expect(result).toHaveProperty('keyIv');
      expect(result).toHaveProperty('keyAuthTag');

      // Encrypted should be different from original
      expect(result.encryptedKey).not.toBe(testKey);
    });

    test('should decrypt key with same PIN', () => {
      const encrypted = keyRecoveryController.encryptKeyWithPin(testKey, testPin);

      const decrypted = keyRecoveryController.decryptKeyWithPin(
        encrypted.encryptedKey,
        encrypted.keyIv,
        encrypted.keyAuthTag,
        testPin
      );

      expect(decrypted).toBe(testKey);
    });

    test('should fail decryption with wrong PIN', () => {
      const encrypted = keyRecoveryController.encryptKeyWithPin(testKey, testPin);

      expect(() => {
        keyRecoveryController.decryptKeyWithPin(
          encrypted.encryptedKey,
          encrypted.keyIv,
          encrypted.keyAuthTag,
          '5678' // Wrong PIN
        );
      }).toThrow();
    });

    test('should fail with corrupted ciphertext', () => {
      const encrypted = keyRecoveryController.encryptKeyWithPin(testKey, testPin);

      // Corrupt the ciphertext
      const corruptedCiphertext = 'ffffffffffffffffffffffffffffffff';

      expect(() => {
        keyRecoveryController.decryptKeyWithPin(
          corruptedCiphertext,
          encrypted.keyIv,
          encrypted.keyAuthTag,
          testPin
        );
      }).toThrow();
    });

    test('should fail with wrong auth tag', () => {
      const encrypted = keyRecoveryController.encryptKeyWithPin(testKey, testPin);

      const wrongTag = 'ffffffffffffffffffffffffffffffff';

      expect(() => {
        keyRecoveryController.decryptKeyWithPin(
          encrypted.encryptedKey,
          encrypted.keyIv,
          wrongTag,
          testPin
        );
      }).toThrow();
    });
  });

  describe('backupKeyWithPin endpoint', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {
        user: { userId: 'user_123' },
        body: {}
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();

      // Mock database service
      jest.spyOn(require('../services/database'), 'saveKeyBackup')
        .mockResolvedValue({
          id: 1,
          userId: 'user_123',
          backupCreatedAt: new Date()
        });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should reject missing authentication', async () => {
      mockReq.user = null;
      mockReq.body = { pin: '1234', encryptionKey: 'abc123' };

      await keyRecoveryController.backupKeyWithPin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    test('should reject missing PIN', async () => {
      mockReq.body = { encryptionKey: 'abc123' };

      await keyRecoveryController.backupKeyWithPin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('should reject invalid PIN format', async () => {
      mockReq.body = {
        pin: '123', // Only 3 digits, needs 4-6
        encryptionKey: 'abc123'
      };

      await keyRecoveryController.backupKeyWithPin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('should reject non-numeric PIN', async () => {
      mockReq.body = {
        pin: 'abcd',
        encryptionKey: 'abc123'
      };

      await keyRecoveryController.backupKeyWithPin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('should accept valid 4-digit PIN', async () => {
      mockReq.body = {
        pin: '1234',
        encryptionKey: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
      };

      await keyRecoveryController.backupKeyWithPin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalled();
    });

    test('should accept valid 6-digit PIN', async () => {
      mockReq.body = {
        pin: '123456',
        encryptionKey: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
      };

      await keyRecoveryController.backupKeyWithPin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  describe('PIN validation', () => {
    test('should require 4-6 digit PIN', () => {
      const validPins = ['1234', '12345', '123456'];
      const invalidPins = ['123', '1234567', 'abcd', '12ab'];

      validPins.forEach(pin => {
        expect(/^\d{4,6}$/.test(pin)).toBe(true);
      });

      invalidPins.forEach(pin => {
        expect(/^\d{4,6}$/.test(pin)).toBe(false);
      });
    });
  });
});
