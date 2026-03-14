#!/bin/bash

API="http://localhost:3001/api"

echo "=== Testing Shared Reports with Revoked Access ==="
echo ""

# Generate random phones
PHONE1="0${RANDOM}${RANDOM}"
PHONE2="0${RANDOM}${RANDOM}"

echo "1. Signing up user 1 with phone: $PHONE1"
OTP_RES1=$(curl -s -X POST "$API/auth/signup/initiate" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE1\"}")
OTP1=$(echo $OTP_RES1 | grep -o '"_testOTP":"[^"]*' | cut -d'"' -f4)
echo "   OTP: $OTP1"

SIGNUP_RES1=$(curl -s -X POST "$API/auth/signup/verify" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE1\",\"otpCode\":\"$OTP1\"}")
TOKEN1=$(echo $SIGNUP_RES1 | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER1=$(echo $SIGNUP_RES1 | grep -o '"userId":"[^"]*' | cut -d'"' -f4)
echo "   User 1 ID: $USER1"
echo ""

echo "2. Signing up user 2 with phone: $PHONE2"
OTP_RES2=$(curl -s -X POST "$API/auth/signup/initiate" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE2\"}")
OTP2=$(echo $OTP_RES2 | grep -o '"_testOTP":"[^"]*' | cut -d'"' -f4)
echo "   OTP: $OTP2"

SIGNUP_RES2=$(curl -s -X POST "$API/auth/signup/verify" -H "Content-Type: application/json" -d "{\"phone\":\"$PHONE2\",\"otpCode\":\"$OTP2\"}")
TOKEN2=$(echo $SIGNUP_RES2 | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER2=$(echo $SIGNUP_RES2 | grep -o '"userId":"[^"]*' | cut -d'"' -f4)
echo "   User 2 ID: $USER2"
echo ""

echo "3. User 1 submitting a report"
REPORT_RES=$(curl -s -X POST "$API/submit-report" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN1" -d '{
  "type":"sexual_harassment",
  "responses":["yes","detailed","today","tracking","no"],
  "metadata":{"location":"test"}
}')
REPORT_ID=$(echo $REPORT_RES | grep -o '"reportId":"[^"]*' | cut -d'"' -f4)
echo "   Report ID: $REPORT_ID"
echo ""

echo "4. User 1 sharing report with User 2"
curl -s -X POST "$API/access/grant" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN1" \
  -d "{\"reportId\":\"$REPORT_ID\",\"grantToUserId\":\"$USER2\"}" > /dev/null
echo "   Access granted"
echo ""

echo "5. Checking User 1's my-shared-reports (should have 1 report)"
SHARED=$(curl -s -X GET "$API/access/my-shared-reports" -H "Authorization: Bearer $TOKEN1")
COUNT=$(echo $SHARED | grep -o '"reportId"' | wc -l)
echo "   Reports count: $COUNT"
echo ""

echo "6. Checking User 2's shared-with-me (should have 1 report)"
SHARED_WITH=$(curl -s -X GET "$API/access/shared-with-me" -H "Authorization: Bearer $TOKEN2")
COUNT=$(echo $SHARED_WITH | grep -o '"reportId"' | wc -l)
echo "   Reports count: $COUNT"
echo ""

echo "7. User 1 revoking access from User 2"
curl -s -X POST "$API/access/revoke" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN1" \
  -d "{\"reportId\":\"$REPORT_ID\",\"revokeFromUserId\":\"$USER2\"}" > /dev/null
echo "   Access revoked"
echo ""

echo "8. Checking User 1's my-shared-reports AFTER revoke (should be 0)"
SHARED=$(curl -s -X GET "$API/access/my-shared-reports" -H "Authorization: Bearer $TOKEN1")
COUNT=$(echo $SHARED | grep -o '"reportId"' | wc -l)
echo "   Reports count: $COUNT"
if [ "$COUNT" == "0" ]; then
  echo "   ✓ CORRECT: Reports with no active viewers are NOT returned"
else
  echo "   ✗ WRONG: Report still appears even with no active viewers"
fi
echo ""

echo "9. Checking User 2's shared-with-me AFTER revoke (should be 0)"
SHARED_WITH=$(curl -s -X GET "$API/access/shared-with-me" -H "Authorization: Bearer $TOKEN2")
COUNT=$(echo $SHARED_WITH | grep -o '"reportId"' | wc -l)
echo "   Reports count: $COUNT"
if [ "$COUNT" == "0" ]; then
  echo "   ✓ CORRECT: Reports with revoked access are NOT returned"
else
  echo "   ✗ WRONG: Report still appears even after revoke"
fi

