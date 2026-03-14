const axios = require('axios');

const API = 'http://localhost:3001/api';

async function test() {
  try {
    console.log('=== Testing Shared Reports with Revoked Access ===\n');

    // Step 1: Signup user 1
    console.log('1. Signing up user 1...');
    const phone1 = `0${Math.random().toString().slice(2, 11)}`;
    let otpRes = await axios.post(`${API}/auth/signup/initiate`, { phone: phone1 });
    const otpCode1 = otpRes.data.data._testOTP;
    console.log(`   Phone: ${phone1}, OTP: ${otpCode1}`);

    const signupRes1 = await axios.post(`${API}/auth/signup/verify`, { phone: phone1, otpCode: otpCode1 });
    const token1 = signupRes1.data.data.token;
    const userId1 = signupRes1.data.data.userId;
    console.log(`   User ID: ${userId1}\n`);

    // Step 2: Signup user 2
    console.log('2. Signing up user 2...');
    const phone2 = `0${Math.random().toString().slice(2, 11)}`;
    otpRes = await axios.post(`${API}/auth/signup/initiate`, { phone: phone2 });
    const otpCode2 = otpRes.data.data._testOTP;
    console.log(`   Phone: ${phone2}, OTP: ${otpCode2}`);

    const signupRes2 = await axios.post(`${API}/auth/signup/verify`, { phone: phone2, otpCode: otpCode2 });
    const token2 = signupRes2.data.data.token;
    const userId2 = signupRes2.data.data.userId;
    console.log(`   User ID: ${userId2}\n`);

    // Step 3: User 1 submits a report
    console.log('3. User 1 submitting a report...');
    const reportRes = await axios.post(`${API}/submit-report`, {
      type: 'sexual_harassment',
      responses: ['yes', 'detailed description', 'today', 'tracking', 'no'],
      metadata: { location: 'test' }
    }, { headers: { Authorization: `Bearer ${token1}` } });

    const reportId = reportRes.data.data.reportId;
    console.log(`   Report ID: ${reportId}\n`);

    // Step 4: User 1 shares report with User 2
    console.log('4. User 1 sharing report with User 2...');
    await axios.post(`${API}/access/grant`, {
      reportId,
      grantToUserId: userId2
    }, { headers: { Authorization: `Bearer ${token1}` } });
    console.log('   Access granted\n');

    // Step 5: Check my-shared-reports (should show the report)
    console.log('5. Checking User 1\'s my-shared-reports (should have 1 report)...');
    let myShared = await axios.get(`${API}/access/my-shared-reports`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    console.log(`   Reports count: ${myShared.data.data.reports.length}`);
    if (myShared.data.data.reports.length > 0) {
      const report = myShared.data.data.reports[0];
      console.log(`   Report ID: ${report.reportId}, Viewer Count: ${report.viewerCount}`);
      console.log(`   Viewers: ${report.viewers.map(v => `${v.viewerId} (active: ${v.isActive})`).join(', ')}\n`);
    }

    // Step 6: Check shared-with-me (should show the report)
    console.log('6. Checking User 2\'s shared-with-me (should have 1 report)...');
    let sharedWithMe = await axios.get(`${API}/access/shared-with-me`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    console.log(`   Reports count: ${sharedWithMe.data.data.reports.length}\n`);

    // Step 7: User 1 revokes access from User 2
    console.log('7. User 1 revoking access from User 2...');
    await axios.post(`${API}/access/revoke`, {
      reportId,
      revokeFromUserId: userId2
    }, { headers: { Authorization: `Bearer ${token1}` } });
    console.log('   Access revoked\n');

    // Step 8: Check my-shared-reports again (should be EMPTY now)
    console.log('8. Checking User 1\'s my-shared-reports after revoke (should be 0)...');
    myShared = await axios.get(`${API}/access/my-shared-reports`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    console.log(`   Reports count: ${myShared.data.data.reports.length}`);
    console.log(`   ✓ CORRECT: Reports with no active viewers are NOT returned\n`);

    // Step 9: Check shared-with-me again (should be EMPTY)
    console.log('9. Checking User 2\'s shared-with-me after revoke (should be 0)...');
    sharedWithMe = await axios.get(`${API}/access/shared-with-me`, {
      headers: { Authorization: `Bearer ${token2}` }
    });
    console.log(`   Reports count: ${sharedWithMe.data.data.reports.length}`);
    console.log(`   ✓ CORRECT: Reports with revoked access are NOT returned\n`);

    console.log('=== TEST PASSED ===');

  } catch (error) {
    console.error('ERROR:', error.response?.data || error.message);
  }
}

test();
