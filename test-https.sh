#!/bin/bash

# HTTPS/TLS Verification Script
# Tests that HTTPS is properly configured on Render

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STAGING_URL="https://safegirl-staging-backend.onrender.com"
PRODUCTION_URL="${1:-}"  # Pass as argument

echo "🔒 HTTPS/TLS Verification Script"
echo "=================================="
echo ""

# Function to test HTTPS
test_https() {
    local url=$1
    local name=$2

    echo "Testing: $name"
    echo "URL: $url"
    echo ""

    # Test HTTPS connection
    echo -n "1️⃣  HTTPS connection... "
    if curl -s -I "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
        return 1
    fi

    # Test HTTP redirect to HTTPS
    echo -n "2️⃣  HTTP → HTTPS redirect... "
    local http_url="${url/https:/http:}"
    local redirect_status=$(curl -s -o /dev/null -w "%{http_code}" "$http_url" --max-time 5 || echo "000")
    if [[ "$redirect_status" =~ ^(301|302|303|307|308)$ ]]; then
        echo -e "${GREEN}✓ OK ($redirect_status)${NC}"
    else
        echo -e "${YELLOW}⚠ No redirect (HTTP may not be available)${NC}"
    fi

    # Test HSTS header
    echo -n "3️⃣  HSTS header... "
    local hsts=$(curl -s -I "$url" | grep -i "strict-transport-security" || echo "")
    if [[ -n "$hsts" ]]; then
        echo -e "${GREEN}✓ OK${NC}"
        echo "   $hsts"
    else
        echo -e "${RED}✗ MISSING${NC}"
        return 1
    fi

    # Test other security headers
    echo -n "4️⃣  Security headers... "
    local headers=$(curl -s -I "$url" | grep -E "X-Frame-Options|X-Content-Type-Options|Content-Security-Policy" | wc -l)
    if [[ $headers -ge 2 ]]; then
        echo -e "${GREEN}✓ OK ($headers headers)${NC}"
    else
        echo -e "${YELLOW}⚠ Missing some headers ($headers found)${NC}"
    fi

    # Test SSL certificate
    echo -n "5️⃣  SSL certificate... "
    local host=$(echo $url | sed 's|https://||')
    local cert_info=$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")
    if [[ -n "$cert_info" ]]; then
        echo -e "${GREEN}✓ OK${NC}"
        echo "$cert_info" | sed 's/^/   /'
    else
        echo -e "${RED}✗ FAILED${NC}"
        return 1
    fi

    # Test API endpoint
    echo -n "6️⃣  API endpoint (/api/auth/login/initiate)... "
    local api_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url/api/auth/login/initiate" \
        -H "Content-Type: application/json" \
        -d '{"phone": "+256750902921"}' --max-time 5 || echo "000")

    if [[ "$api_status" =~ ^(200|400|401|429)$ ]]; then
        echo -e "${GREEN}✓ OK ($api_status)${NC}"
    else
        echo -e "${RED}✗ FAILED ($api_status)${NC}"
        return 1
    fi

    echo ""
    return 0
}

# Test staging
echo -e "${YELLOW}STAGING ENVIRONMENT${NC}"
echo "===================="
if test_https "$STAGING_URL" "SafeGirl Staging Backend"; then
    echo -e "${GREEN}✅ All staging tests passed!${NC}"
else
    echo -e "${RED}❌ Some staging tests failed${NC}"
    exit 1
fi

# Test production if provided
if [[ -n "$PRODUCTION_URL" ]]; then
    echo ""
    echo -e "${YELLOW}PRODUCTION ENVIRONMENT${NC}"
    echo "====================="
    if test_https "$PRODUCTION_URL" "SafeGirl Production Backend"; then
        echo -e "${GREEN}✅ All production tests passed!${NC}"
    else
        echo -e "${RED}❌ Some production tests failed${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}🎉 HTTPS/TLS verification complete!${NC}"
