#!/bin/bash

################################################################################
# Smoke Test: NestJS Backend
#
# Purpose: Verify all API routes respond correctly
# Usage: ./scripts/smoke-test.sh [BASE_URL]
################################################################################

BASE_URL="${1:-http://localhost:3000}"

PASS=0
FAIL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

################################################################################
# Helpers
################################################################################

call() {
  local method="$1" url="$2" body="$3"
  if [ -z "$body" ]; then
    curl -si -w "\n%{http_code}" -X "$method" "$url"
  else
    curl -si -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$body" "$url"
  fi
}

status_of()  { echo "$1" | tail -n 1; }
body_of()    { echo "$1" | sed '$d' | awk '/^\r?$/{found=1;next} found{print}' | tr -d '\r'; }
header_of()  { echo "$1" | grep -i "^${2}:" | cut -d' ' -f2- | tr -d '\r'; }

check() {
  local name="$1" resp="$2" expected_status="$3" check_xcache="$4" check_keys="$5"
  local status body xcache passed=true reason=""

  status=$(status_of "$resp")
  body=$(body_of "$resp")
  xcache=$(header_of "$resp" "X-Cache")

  [ "$status" != "$expected_status" ] && passed=false && reason+="status $status (expected $expected_status); "

  if [ "$check_xcache" = "true" ] && [ "$status" = "200" ] && [ -z "$xcache" ]; then
    passed=false; reason+="missing X-Cache header; "
  fi

  if [ -n "$check_keys" ] && [ "$status" = "200" ]; then
    IFS=',' read -ra keys <<< "$check_keys"
    for k in "${keys[@]}"; do
      k=$(echo "$k" | xargs)
      echo "$body" | jq -e ".${k} != null" > /dev/null 2>&1 || { passed=false; reason+="missing key '$k'; "; }
    done
  fi

  if [ "$passed" = true ]; then
    echo -e "${GREEN}[PASS]${NC} $name"
    ((PASS++))
  else
    echo -e "${RED}[FAIL]${NC} $name"
    echo -e "        ${RED}→ $reason${NC}"
    ((FAIL++))
  fi
}

################################################################################
# Discover seed IDs dynamically
################################################################################

echo -e "${YELLOW}Fetching seed IDs...${NC}"
CUSTOMERS_RESP=$(curl -s "$BASE_URL/customers")
PRODUCTS_RESP=$(curl -s "$BASE_URL/products")
ORDERS_RESP=$(curl -s "$BASE_URL/orders")

CUSTOMER_ID=$(echo "$CUSTOMERS_RESP" | jq -r '.[0].id // empty')
PRODUCT_ID=$(echo "$PRODUCTS_RESP"   | jq -r '.[0].id // empty')
ORDER_ID=$(echo "$ORDERS_RESP"       | jq -r '.[0].id // empty')

if [ -z "$CUSTOMER_ID" ] || [ -z "$PRODUCT_ID" ] || [ -z "$ORDER_ID" ]; then
  echo -e "${RED}Could not fetch seed IDs — is the DB seeded? Run: make seed${NC}"
  exit 1
fi

echo "  Customer ID: $CUSTOMER_ID | Product ID: $PRODUCT_ID | Order ID: $ORDER_ID"
echo ""

UNIQUE_TS=$(date +%s)

################################################################################
# Test Suite
################################################################################

echo "================================"
echo "Smoke Test: NestJS"
echo "================================"
echo ""

# --- CUSTOMERS ---
echo -e "${YELLOW}=== CUSTOMERS ===${NC}"
check "GET /customers (list)"              "$(call GET "$BASE_URL/customers")"             "200" "true"
check "GET /customers/:id (show)"          "$(call GET "$BASE_URL/customers/$CUSTOMER_ID")" "200" "true" "id,name,email"
check "GET /customers/999999 (not found)"  "$(call GET "$BASE_URL/customers/999999")"       "404"

# POST
TS_RESP=$(call POST "$BASE_URL/customers" "{\"customer\":{\"name\":\"Smoke User\",\"email\":\"smoke_${UNIQUE_TS}@test.com\"}}")
check "POST /customers (create)" "$TS_RESP" "201"
NEW_ID=$(body_of "$TS_RESP" | jq -r '.id // empty')

if [ -n "$NEW_ID" ]; then
  check "PUT /customers/:id (update)" \
    "$(call PUT "$BASE_URL/customers/$NEW_ID" "{\"customer\":{\"name\":\"Updated\"}}")" "200"
  check "DELETE /customers/:id (delete)" \
    "$(call DELETE "$BASE_URL/customers/$NEW_ID")" "204"
fi
echo ""

# --- PRODUCTS ---
echo -e "${YELLOW}=== PRODUCTS ===${NC}"
check "GET /products (list)"              "$(call GET "$BASE_URL/products")"              "200" "true"
check "GET /products/:id (show)"          "$(call GET "$BASE_URL/products/$PRODUCT_ID")"  "200" "true" "id,name,price"
check "GET /products/999999 (not found)"  "$(call GET "$BASE_URL/products/999999")"        "404"
echo ""

# --- ORDERS ---
echo -e "${YELLOW}=== ORDERS ===${NC}"
check "GET /orders (list)"              "$(call GET "$BASE_URL/orders")"             "200" "true"
check "GET /orders/:id (show)"          "$(call GET "$BASE_URL/orders/$ORDER_ID")"   "200" "true" "id,customer_id,status,order_items"
check "GET /orders/999999 (not found)"  "$(call GET "$BASE_URL/orders/999999")"      "404"

ORDER_BODY="{\"customer_id\":\"$CUSTOMER_ID\",\"order_items_attributes\":[{\"product_id\":\"$PRODUCT_ID\",\"quantity\":1}]}"
check "POST /orders (create)" "$(call POST "$BASE_URL/orders" "$ORDER_BODY")" "201"
echo ""

# --- STATS & CACHE ---
echo -e "${YELLOW}=== STATS & CACHE ===${NC}"
check "GET /stats"         "$(call GET  "$BASE_URL/stats")"        "200" "" "hits,misses,hit_rate"
check "GET /cache/status"  "$(call GET  "$BASE_URL/cache/status")" "200" "" "enabled"
check "POST /cache/toggle" "$(call POST "$BASE_URL/cache/toggle")" "200" "" "enabled"
echo ""

################################################################################
# Summary
################################################################################

TOTAL=$((PASS + FAIL))
echo "================================"
echo "Results: ${PASS}/${TOTAL} passed"
echo "================================"

[ $FAIL -eq 0 ] && echo -e "${GREEN}✓ All tests passed!${NC}" && exit 0
echo -e "${RED}✗ ${FAIL} test(s) failed${NC}" && exit 1
