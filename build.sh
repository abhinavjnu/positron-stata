#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESBUILD="/usr/share/positron/resources/app/quarto/bin/tools/x86_64/esbuild"

echo "Building positron-stata extension..."
"$ESBUILD" "$DIR/src/extension.ts" \
  --bundle \
  --outfile="$DIR/dist/extension.js" \
  --external:vscode \
  --external:positron \
  --format=cjs \
  --platform=node

echo "Build complete: $DIR/dist/extension.js"
