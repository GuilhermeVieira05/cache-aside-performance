#!/bin/bash

################################################################################
# Shadow Test Script: Rails vs NestJS Backend Comparison
#
# Purpose: Call every API route on both backends and compare responses
# Usage: ./scripts/shadow-test.sh
################################################################################

RAILS_URL="http://localhost:3000"
NODE_URL="http://localhost:3002"

PASS=0
FAIL=0

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

################################################################################
# Helper Functions
################################################################################

# Extract HTTP status code from curl response (last 3 digits)
get_status_code() {
  local response="$1"
  echo "$response" | tail -n 1
}

# Extract JSON body from response (after blank line separating headers from body, minus last status line)
get_body() {
  local response="$1"
  echo "$response" | sed '$d' | awk '/^\r?$/{found=1; next} found{print}' | tr -d '\r'
}

# Extract header value from response
get_header() {
  local response="$1"
  local header_name="$2"
  echo "$response" | grep -i "^${header_name}:" | cut -d' ' -f2- || echo ""
}

# Check if JSON response is an array
is_json_array() {
  local json="$1"
  echo "$json" | jq -e 'type == "array"' > /dev/null 2>&1
  return $?
}

# Check if JSON response is an object
is_json_object() {
  local json="$1"
  echo "$json" | jq -e 'type == "object"' > /dev/null 2>&1
  return $?
}

# Check if JSON object has a key
has_json_key() {
  local json="$1"
  local key="$2"
  echo "$json" | jq -e ".${key} != null" > /dev/null 2>&1
  return $?
}

# Call backend endpoint and return headers+body with status on last line
call_endpoint() {
  local url="$1"
  local method="$2"
  local body="$3"

  if [ -z "$body" ]; then
    curl -si -w "\n%{http_code}" \
      -X "$method" \
      "$url"
  else
    curl -si -w "\n%{http_code}" \
      -X "$method" \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$url"
  fi
}

# Main test runner (supports different bodies per backend via rails_body/node_body params)
run_test() {
  local test_name="$1"
  local method="$2"
  local path="$3"
  local body="$4"           # optional JSON body (sent to both; overridden by rails_body/node_body if set)
  local expected_status="$5"
  local check_xcache="$6"   # "true" or "" (blank)
  local check_keys="$7"     # comma-separated keys to check
  local rails_body_override="$8"  # optional separate body for Rails
  local node_body_override="$9"   # optional separate body for NestJS

  local rails_endpoint="${RAILS_URL}${path}"
  local node_endpoint="${NODE_URL}${path}"

  local effective_rails_body="${rails_body_override:-$body}"
  local effective_node_body="${node_body_override:-$body}"

  # Call both backends
  local rails_response=$(call_endpoint "$rails_endpoint" "$method" "$effective_rails_body")
  local node_response=$(call_endpoint "$node_endpoint" "$method" "$effective_node_body")

  # Extract components
  local rails_status=$(get_status_code "$rails_response")
  local node_status=$(get_status_code "$node_response")
  local rails_body=$(get_body "$rails_response")
  local node_body=$(get_body "$node_response")
  local rails_xcache=$(get_header "$rails_response" "X-Cache")
  local node_xcache=$(get_header "$node_response" "X-Cache")

  # Track test result
  local test_passed=true
  local failure_reason=""

  # Check status code
  if [ "$rails_status" != "$expected_status" ]; then
    test_passed=false
    failure_reason="${failure_reason}Rails status $rails_status (expected $expected_status); "
  fi

  if [ "$node_status" != "$expected_status" ]; then
    test_passed=false
    failure_reason="${failure_reason}NestJS status $node_status (expected $expected_status); "
  fi

  if [ "$rails_status" != "$node_status" ]; then
    test_passed=false
    failure_reason="${failure_reason}Status mismatch: Rails=$rails_status, NestJS=$node_status; "
  fi

  # Check X-Cache header if required (only for successful responses)
  if [ "$check_xcache" = "true" ] && [ "$rails_status" = "200" ]; then
    if [ -z "$rails_xcache" ]; then
      test_passed=false
      failure_reason="${failure_reason}Rails missing X-Cache header; "
    fi
    if [ -z "$node_xcache" ]; then
      test_passed=false
      failure_reason="${failure_reason}NestJS missing X-Cache header; "
    fi
  fi

  # Check response body keys if specified
  if [ -n "$check_keys" ] && [ "$rails_status" = "200" ]; then
    IFS=',' read -ra keys_array <<< "$check_keys"
    for key in "${keys_array[@]}"; do
      key=$(echo "$key" | xargs) # trim whitespace

      if ! has_json_key "$rails_body" "$key"; then
        test_passed=false
        failure_reason="${failure_reason}Rails missing key '$key'; "
      fi

      if ! has_json_key "$node_body" "$key"; then
        test_passed=false
        failure_reason="${failure_reason}NestJS missing key '$key'; "
      fi
    done
  fi

  # Print result
  if [ "$test_passed" = true ]; then
    echo -e "${GREEN}[PASS]${NC} $test_name"
    ((PASS++))
  else
    echo -e "${RED}[FAIL]${NC} $test_name"
    echo -e "        ${RED}→ ${failure_reason}${NC}"
    ((FAIL++))
  fi
}

################################################################################
# Test Suite
################################################################################

echo "================================"
echo "Shadow Test: Rails vs NestJS"
echo "================================"
echo ""

# --- CUSTOMERS TESTS ---
echo "${YELLOW}=== CUSTOMERS ===${NC}"
run_test "GET /customers (list)" "GET" "/customers" "" "200" "true"
run_test "GET /customers/101 (show)" "GET" "/customers/101" "" "200" "true" "id,name,email"
run_test "GET /customers/999999 (not found)" "GET" "/customers/999999" "" "404"

# Create a customer with unique email
UNIQUE_TS=$(date +%s)
echo "${YELLOW}Creating test customer...${NC}"
rails_setup_body="{\"customer\":{\"name\":\"Test User\",\"email\":\"shadow_setup_${UNIQUE_TS}@example.com\"}}"
create_response=$(call_endpoint "${RAILS_URL}/customers" "POST" "$rails_setup_body")
create_status=$(get_status_code "$create_response")
create_body=$(get_body "$create_response")

if [ "$create_status" = "201" ]; then
  new_customer_id=$(echo "$create_body" | jq -r '.id' 2>/dev/null)
  if [ -n "$new_customer_id" ] && [ "$new_customer_id" != "null" ]; then
    echo "Created customer ID (setup): $new_customer_id"

    # POST: use different emails since both backends share the same DB
    rails_create_body="{\"customer\":{\"name\":\"Test User\",\"email\":\"shadow_rails_${UNIQUE_TS}@example.com\"}}"
    node_create_body="{\"customer\":{\"name\":\"Test User\",\"email\":\"shadow_node_${UNIQUE_TS}@example.com\"}}"
    run_test "POST /customers (create)" "POST" "/customers" "" "201" "" "" "$rails_create_body" "$node_create_body"

    # PUT: use the setup ID (exists on shared DB, both backends can update it)
    run_test "PUT /customers/$new_customer_id (update)" "PUT" "/customers/$new_customer_id" "{\"customer\":{\"name\":\"Updated User\"}}" "200"

    # DELETE: create separate records for each backend to avoid race condition on shared DB
    rails_del_id=$new_customer_id
    node_del_body="{\"customer\":{\"name\":\"Del User\",\"email\":\"shadow_del_node_${UNIQUE_TS}@example.com\"}}"
    node_del_resp=$(call_endpoint "${NODE_URL}/customers" "POST" "$node_del_body")
    node_del_id=$(get_body "$node_del_resp" | jq -r '.id' 2>/dev/null)

    rails_del_status=$(get_status_code "$(call_endpoint "${RAILS_URL}/customers/$rails_del_id" "DELETE" "")")
    if [ -n "$node_del_id" ] && [ "$node_del_id" != "null" ]; then
      node_del_status=$(get_status_code "$(call_endpoint "${NODE_URL}/customers/$node_del_id" "DELETE" "")")
    else
      node_del_status="500"
    fi

    if [ "$rails_del_status" = "204" ] && [ "$node_del_status" = "204" ]; then
      echo -e "${GREEN}[PASS]${NC} DELETE /customers/:id (delete)"
      ((PASS++))
    else
      echo -e "${RED}[FAIL]${NC} DELETE /customers/:id (delete)"
      echo -e "        ${RED}→ Rails=$rails_del_status, NestJS=$node_del_status (expected 204)${NC}"
      ((FAIL++))
    fi
  else
    echo "${RED}Warning: Could not extract new customer ID, skipping update/delete tests${NC}"
  fi
else
  echo "${YELLOW}Warning: Customer creation failed (status $create_status), skipping update/delete tests${NC}"
fi

echo ""

# --- PRODUCTS TESTS ---
echo "${YELLOW}=== PRODUCTS ===${NC}"
run_test "GET /products (list)" "GET" "/products" "" "200" "true"
run_test "GET /products/31 (show)" "GET" "/products/31" "" "200" "true" "id,name,price"
run_test "GET /products/999999 (not found)" "GET" "/products/999999" "" "404"

echo ""

# --- ORDERS TESTS ---
echo "${YELLOW}=== ORDERS ===${NC}"
run_test "GET /orders (list)" "GET" "/orders" "" "200" "true"
run_test "GET /orders/301 (show)" "GET" "/orders/301" "" "200" "true" "id,customer_id,status,order_items"
run_test "GET /orders/999999 (not found)" "GET" "/orders/999999" "" "404"

# Create an order using seeded customer_id=101 and product_id=31
echo "${YELLOW}Creating test order...${NC}"
new_order_body='{"customer_id":"101","order_items_attributes":[{"product_id":"31","quantity":1}]}'
order_create_response=$(call_endpoint "${RAILS_URL}/orders" "POST" "$new_order_body")
order_create_status=$(get_status_code "$order_create_response")

if [ "$order_create_status" = "201" ]; then
  run_test "POST /orders (create)" "POST" "/orders" "$new_order_body" "201" "" ""
else
  echo "${YELLOW}Warning: Order creation failed (status $order_create_status), skipping POST test${NC}"
fi

echo ""

# --- STATS TESTS ---
echo "${YELLOW}=== STATS & CACHE ===${NC}"
run_test "GET /stats (show)" "GET" "/stats" "" "200" "" "hits,misses,hit_rate"
run_test "GET /cache/status" "GET" "/cache/status" "" "200" "" "enabled"
run_test "POST /cache/toggle" "POST" "/cache/toggle" "" "200" "" "enabled"

echo ""

################################################################################
# Summary
################################################################################

TOTAL=$((PASS + FAIL))

echo "================================"
echo "Shadow Test Results"
echo "================================"
echo "Passed: ${GREEN}${PASS}${NC}/${TOTAL}"
echo "Failed: ${RED}${FAIL}${NC}/${TOTAL}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ ${FAIL} test(s) failed${NC}"
  exit 1
fi
