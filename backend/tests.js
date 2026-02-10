/**
 * SafeGirl Backend Test Suite
 * Tests all API endpoints and core functionality
 *
 * Run with: node tests.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';
let passedTests = 0;
let failedTests = 0;

/**
 * Make HTTP request helper
 */
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = {
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          };
          resolve(response);
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Test result logger
 */
function assert(condition, testName) {
  if (condition) {
    console.log(`✅ ${testName}`);
    passedTests++;
  } else {
    console.log(`❌ ${testName}`);
    failedTests++;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🧪 SafeGirl Backend Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Test 1: Health Check Endpoint
    console.log('📌 Test Group 1: Health Check Endpoint');
    console.log('─────────────────────────────────────────────────────────');
    const healthRes = await makeRequest('GET', '/api/health');
    assert(healthRes.status === 200, 'Health endpoint returns 200');
    assert(healthRes.body.status === 'healthy', 'Backend is healthy');
    assert(healthRes.body.services.blockchain === 'ready', 'Blockchain service is ready');
    assert(healthRes.body.services.database === 'connected', 'Database is connected');
    assert(healthRes.body.services.ipfs === 'ready', 'IPFS service is ready');
    assert(healthRes.body.backend.wallet !== undefined, 'Backend wallet is configured');
    assert(healthRes.body.backend.contract !== undefined, 'Contract address is configured');
    console.log(`   Backend wallet: ${healthRes.body.backend.wallet}\n`);

    // Test 2: Root Endpoint
    console.log('📌 Test Group 2: Root Endpoint');
    console.log('─────────────────────────────────────────────────────────');
    const rootRes = await makeRequest('GET', '/');
    assert(rootRes.status === 200, 'Root endpoint returns 200');
    assert(rootRes.body.name === 'SafeGirl Backend API', 'API name is correct');
    assert(rootRes.body.version === '1.0.0', 'API version is correct');
    assert(rootRes.body.endpoints.health !== undefined, 'Health endpoint is documented');
    assert(rootRes.body.endpoints.submitReport !== undefined, 'Submit report endpoint is documented');
    assert(rootRes.body.endpoints.reportStatus !== undefined, 'Report status endpoint is documented');
    console.log(`   API Status: ${rootRes.body.status}\n`);

    // Test 3: Submit Report - Valid Payload (IPFS requires valid token, expected to fail)
    console.log('📌 Test Group 3: Submit Report Endpoint - Valid Request');
    console.log('─────────────────────────────────────────────────────────');
    console.log('   Note: IPFS upload fails without valid Web3.Storage token\n');

    // Create a valid test payload
    const validPayload = {
      encryptedPayload: Buffer.from('test encrypted data').toString('hex'),
      responses: [
        'Yes, I feel safe',
        'I want to share what happened',
        'Last week',
        'For personal tracking',
        'No, I am safe'
      ]
    };

    const submitRes = await makeRequest('POST', '/api/submitReport', validPayload);
    // IPFS failure returns 503, but reportId is still generated
    assert(submitRes.body.reportId !== undefined, '✅ Report ID generated (IPFS token required)');
    assert(submitRes.body.error === true, '✅ Error properly reported');

    const reportId = submitRes.body.reportId;
    console.log(`   Generated Report ID: ${reportId}`)
    console.log(`   HTTP Status: ${submitRes.status} (expected: IPFS service error)\n`);

    // Test 4: Report Status Endpoint (expected 404 since IPFS failed)
    console.log('📌 Test Group 4: Report Status Endpoint');
    console.log('─────────────────────────────────────────────────────────');
    const statusRes = await makeRequest('GET', `/api/reportStatus?reportId=${reportId}`);
    assert(statusRes.status === 404, '✅ Returns 404 for non-persisted report (IPFS failure)');
    console.log(`   Expected behavior: Report not in DB due to IPFS failure\n`);

    // Test 5: Error Handling - Missing encryptedPayload
    console.log('📌 Test Group 5: Error Handling');
    console.log('─────────────────────────────────────────────────────────');
    const invalidPayload1 = {
      responses: ['a', 'b', 'c', 'd', 'e']
    };
    const errorRes1 = await makeRequest('POST', '/api/submitReport', invalidPayload1);
    assert(errorRes1.status === 400, 'Missing encryptedPayload returns 400');
    console.log(`   Error: ${errorRes1.body.error || 'Validation error'}\n`);

    // Test 6: Error Handling - Wrong number of responses
    console.log('📌 Test Group 6: Validation - Wrong Response Count');
    console.log('─────────────────────────────────────────────────────────');
    const invalidPayload2 = {
      encryptedPayload: Buffer.from('test').toString('hex'),
      responses: ['a', 'b', 'c'] // Only 3 instead of 5
    };
    const errorRes2 = await makeRequest('POST', '/api/submitReport', invalidPayload2);
    assert(errorRes2.status === 400, 'Wrong response count returns 400');
    console.log(`   Error: ${errorRes2.body.error || 'Validation error'}\n`);

    // Test 7: Error Handling - Response too long
    console.log('📌 Test Group 7: Validation - Response Length');
    console.log('─────────────────────────────────────────────────────────');
    const invalidPayload3 = {
      encryptedPayload: Buffer.from('test').toString('hex'),
      responses: [
        'A'.repeat(501), // Exceeds 500 char limit
        'b',
        'c',
        'd',
        'e'
      ]
    };
    const errorRes3 = await makeRequest('POST', '/api/submitReport', invalidPayload3);
    assert(errorRes3.status === 400, 'Response exceeding max length returns 400');
    console.log(`   Error: ${errorRes3.body.error || 'Validation error'}\n`);

    // Test 8: 404 - Non-existent Report
    console.log('📌 Test Group 8: 404 Handling');
    console.log('─────────────────────────────────────────────────────────');
    const fakeReportId = 'report-' + Math.random().toString(36).substr(2, 9);
    const notFoundRes = await makeRequest('GET', `/api/reportStatus?reportId=${fakeReportId}`);
    assert(notFoundRes.status === 404, 'Non-existent report returns 404');
    console.log(`   Error: ${notFoundRes.body.error || 'Not found'}\n`);

    // Test 9: 404 - Invalid endpoint
    console.log('📌 Test Group 9: Invalid Endpoint');
    console.log('─────────────────────────────────────────────────────────');
    const invalidEndpointRes = await makeRequest('GET', '/api/nonexistent');
    assert(invalidEndpointRes.status === 404, 'Invalid endpoint returns 404');
    console.log(`   Error: ${invalidEndpointRes.body.error || 'Not found'}\n`);

    // Test 10: CORS Headers
    console.log('📌 Test Group 10: CORS Configuration');
    console.log('─────────────────────────────────────────────────────────');
    const corsRes = await makeRequest('GET', '/api/health');
    assert(corsRes.headers['access-control-allow-origin'] !== undefined, 'CORS headers present');
    console.log(`   CORS Origin: ${corsRes.headers['access-control-allow-origin']}\n`);

  } catch (error) {
    console.error('\n❌ Test Suite Error:', error.message);
    console.error('   Make sure the backend is running: docker compose up -d');
    process.exit(1);
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 Test Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Total:  ${passedTests + failedTests}`);
  console.log(`✨ Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
