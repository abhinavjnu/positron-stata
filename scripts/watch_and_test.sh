#!/usr/bin/env bash
set -eo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

git fetch origin review-fixes --quiet

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/review-fixes)

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
    echo "NO_NEW_COMMITS: up to date at $LOCAL_HASH"
    exit 0
fi

echo "=========================================="
echo "NEW COMMITS DETECTED: $LOCAL_HASH -> $REMOTE_HASH"
echo "=========================================="
git log "$LOCAL_HASH..$REMOTE_HASH" --oneline
echo "------------------------------------------"

git pull --ff-only origin review-fixes

echo "Running Python test suite (including Stata 19 MP)..."
python3 -m unittest discover tests

echo "Running TypeScript discovery tests..."
node --experimental-strip-types --test tests/discovery.test.ts

echo "Rebuilding VSIX package..."
python3 package_vsix.py

echo "=========================================="
echo "SUCCESS: All tests passed on $REMOTE_HASH"
echo "=========================================="
