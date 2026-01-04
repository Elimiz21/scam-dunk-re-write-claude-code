#!/bin/bash

# ScamDunk US Stock Evaluation Runner
# Usage: ./run-evaluation.sh [--limit=N]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        ScamDunk US Stock Evaluation Suite                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Fetch stock list if needed
if [ ! -f "$SCRIPT_DIR/data/us-stocks.json" ]; then
    echo "Step 1: Fetching US stock list..."
    npx ts-node --transpile-only "$SCRIPT_DIR/scripts/fetch-us-stocks.ts"
    echo ""
else
    STOCK_COUNT=$(cat "$SCRIPT_DIR/data/us-stocks.json" | grep -c '"symbol"')
    echo "Step 1: Stock list already exists ($STOCK_COUNT stocks)"
fi

echo ""
echo "Step 2: Running evaluation..."
npx ts-node --transpile-only "$SCRIPT_DIR/scripts/evaluate-stocks.ts" "$@"

echo ""
echo "Done! Check the following directories for results:"
echo "  - $SCRIPT_DIR/results/"
echo "  - $SCRIPT_DIR/reports/"
