/**
 * Validation Middleware Tests
 */

const {
  validateSubmitReport,
  isValidPhone,
  isValidEmail,
  isValidAddress
} = require('../middleware/validation');

describe('Validation Functions', () => {
  describe('isValidPhone', () => {
    test('should validate Kenyan phone numbers', () => {
      expect(isValidPhone('+254712345678')).toBe(true);
      expect(isValidPhone('0712345678')).toBe(true);
      expect(isValidPhone('254712345678')).toBe(true);
    });

    test('should reject invalid phone numbers', () => {
      expect(isValidPhone('123')).toBe(false); // Too short
      expect(isValidPhone('abc')).toBe(false); // Non-numeric
      expect(isValidPhone('12345678901234567')).toBe(false); // Too long
    });

    test('should accept 10-15 digit phones', () => {
      expect(isValidPhone('1234567890')).toBe(true); // 10 digits
      expect(isValidPhone('123456789012345')).toBe(true); // 15 digits
      expect(isValidPhone('12345678901234567')).toBe(false); // 16 digits
    });
  });

  describe('isValidEmail', () => {
    test('should validate correct emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.email@domain.co.uk')).toBe(true);
      expect(isValidEmail('a@b.c')).toBe(true);
    });

    test('should reject invalid emails', () => {
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user @example.com')).toBe(false);
    });

    test('should enforce max length of 255', () => {
      const longEmail = 'a'.repeat(250) + '@test.com';
      expect(isValidEmail(longEmail)).toBe(false);
    });
  });

  describe('isValidAddress', () => {
    test('should validate Ethereum addresses', () => {
      expect(isValidAddress('0x' + 'a'.repeat(40))).toBe(true);
      expect(isValidAddress('0x' + 'A'.repeat(40))).toBe(true);
      expect(isValidAddress('0x' + 'aAbBcCdD'.repeat(5))).toBe(true);
    });

    test('should reject invalid addresses', () => {
      expect(isValidAddress('0x' + 'a'.repeat(39))).toBe(false); // 39 chars
      expect(isValidAddress('0x' + 'a'.repeat(41))).toBe(false); // 41 chars
      expect(isValidAddress('x' + 'a'.repeat(40))).toBe(false); // Missing 0
      expect(isValidAddress('0x' + 'z'.repeat(40))).toBe(false); // Invalid hex
    });
  });
});

describe('validateSubmitReport Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      body: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  test('should pass valid report submission', () => {
    mockReq.body = {
      payload: { text: 'test', audio: 'base64' },
      responses: ['answer1', 'answer2', 'answer3', 'answer4', 'answer5'],
      metadata: { location: 'Nairobi' }
    };

    validateSubmitReport(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  test('should reject missing payload', () => {
    mockReq.body = {
      responses: ['answer1'],
      metadata: {}
    };

    validateSubmitReport(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should reject non-object payload', () => {
    mockReq.body = {
      payload: 'not an object',
      responses: ['answer1']
    };

    validateSubmitReport(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('should reject responses exceeding 1000 chars', () => {
    mockReq.body = {
      payload: { text: 'test' },
      responses: ['a'.repeat(1001)]
    };

    validateSubmitReport(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('should reject non-string responses', () => {
    mockReq.body = {
      payload: { text: 'test' },
      responses: [123, 'valid', null]
    };

    validateSubmitReport(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('should accept optional metadata', () => {
    mockReq.body = {
      payload: { text: 'test' },
      responses: ['answer1']
      // metadata is optional
    };

    validateSubmitReport(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  test('should reject non-object metadata', () => {
    mockReq.body = {
      payload: { text: 'test' },
      responses: ['answer1'],
      metadata: 'not an object'
    };

    validateSubmitReport(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
  });
});
