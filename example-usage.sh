#!/bin/bash

# Example usage script for Telecom Cart API
# Make sure the API is running (npm run dev or npm start) before running this script

BASE_URL="http://localhost:3000/api/v1/cart"

echo "=== Telecom Cart API Example Usage ==="
echo ""

# 1. Create a cart
echo "1. Creating a new cart..."
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL")
SESSION_ID=$(echo $CREATE_RESPONSE | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)
echo "Created cart with session ID: $SESSION_ID"
echo "Response: $CREATE_RESPONSE"
echo ""

# 2. Add a 5G plan
echo "2. Adding 5G Unlimited Plan to cart..."
curl -s -X POST "$BASE_URL/$SESSION_ID/items" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_mobile_plan_5g",
    "name": "5G Unlimited Plan",
    "price": 75.00,
    "quantity": 1
  }' | python3 -m json.tool
echo ""

# 3. Add an iPhone
echo "3. Adding iPhone 15 Pro to cart..."
curl -s -X POST "$BASE_URL/$SESSION_ID/items" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_iphone_15",
    "name": "iPhone 15 Pro",
    "price": 1299.00,
    "quantity": 1
  }' | python3 -m json.tool
echo ""

# 4. Add phone cases
echo "4. Adding Phone Cases (quantity: 2) to cart..."
ADD_CASE_RESPONSE=$(curl -s -X POST "$BASE_URL/$SESSION_ID/items" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod_case",
    "name": "Phone Case",
    "price": 49.00,
    "quantity": 2
  }')
echo "$ADD_CASE_RESPONSE" | python3 -m json.tool
echo ""

# 5. Get cart
echo "5. Getting current cart state..."
curl -s "$BASE_URL/$SESSION_ID" | python3 -m json.tool
echo ""

# 6. Update case quantity
CASE_ITEM_ID=$(echo $ADD_CASE_RESPONSE | grep -o '"id":"item_[^"]*' | tail -1 | cut -d'"' -f4)
echo "6. Updating Phone Case quantity to 1..."
curl -s -X PUT "$BASE_URL/$SESSION_ID/items/$CASE_ITEM_ID" \
  -H "Content-Type: application/json" \
  -d '{ "quantity": 1 }' | python3 -m json.tool
echo ""

# 7. Final cart state
echo "7. Final cart state:"
curl -s "$BASE_URL/$SESSION_ID" | python3 -m json.tool
echo ""

echo "=== Example Complete ==="
