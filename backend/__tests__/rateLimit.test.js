/**
 * Rate Limiter Middleware Tests
 */

const rateLimit = require('../middleware/rateLimit');

describe('Rate Limiter', () => {
  const mockReq = {
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    path: '/api/auth/login/verify',
    body: {}
  };

  const mockRes = {
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn()
  };

  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the rate limiter store
    rateLimit.store.clear();
  });

  test('should allow request within limit', () => {
    const limiter = rateLimit.limit(3, 60000);

    limiter(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 3);
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 2);
  });

  test('should block request after limit exceeded', () => {
    const limiter = rateLimit.limit(2, 60000);

    // First request
    limiter(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // Second request
    mockNext.mockClear();
    limiter(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // Third request - should be blocked
    mockNext.mockClear();
    mockRes.status.mockClear();
    mockRes.json.mockClear();
    limiter(mockReq, mockRes, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalled();
  });

  test('should include phone in rate limit key', () => {
    const limiter = rateLimit.limit(2, 60000);

    const reqWithPhone = {
      ...mockReq,
      body: { phone: '+254712345678' }
    };

    // First request from phone
    limiter(reqWithPhone, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // Second request from same phone
    mockNext.mockClear();
    limiter(reqWithPhone, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // Third request should be blocked
    mockNext.mockClear();
    mockRes.status.mockClear();
    limiter(reqWithPhone, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(429);
  });

  test('should return retry-after header', () => {
    const limiter = rateLimit.limit(1, 60000);

    // First request
    limiter(mockReq, mockRes, mockNext);

    // Second request - blocked
    mockNext.mockClear();
    mockRes.status.mockClear();
    mockRes.json.mockClear();

    limiter(mockReq, mockRes, mockNext);

    const jsonCall = mockRes.json.mock.calls[0][0];
    expect(jsonCall).toHaveProperty('retryAfter');
    expect(jsonCall.retryAfter).toBeGreaterThan(0);
  });

  test('should reset counter after window expires', (done) => {
    const limiter = rateLimit.limit(1, 100); // 100ms window

    // First request
    limiter(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // Wait for window to expire
    setTimeout(() => {
      mockNext.mockClear();
      limiter(mockReq, mockRes, mockNext);

      // Should be allowed after reset
      expect(mockNext).toHaveBeenCalledTimes(1);
      done();
    }, 150);
  });

  test('should differentiate between different IPs', () => {
    const limiter = rateLimit.limit(1, 60000);

    const req1 = mockReq;
    const req2 = { ...mockReq, ip: '192.168.1.1' };

    limiter(req1, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    mockNext.mockClear();
    limiter(req2, mockRes, mockNext);

    // Should allow because different IP
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
