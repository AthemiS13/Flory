#!/usr/bin/env bash
# Assemble a static `out/` directory from Next.js build output (.next)
# Usage: ./export_to_out.sh
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT_DIR"

if [ ! -d .next ]; then
  echo ".next directory not found. Run 'npm run build' first." >&2
  exit 1
fi

rm -rf out
mkdir -p out

# Copy HTML pages from .next/server/pages
if [ -d .next/server/pages ]; then
  echo "Copying HTML pages..."
  for f in .next/server/pages/*.html; do
    [ -e "$f" ] || continue
    echo "  -> $(basename "$f")"
    cp "$f" out/$(basename "$f")
  done
  # ensure index.html exists at root
  if [ -f .next/server/pages/index.html ]; then
    cp .next/server/pages/index.html out/index.html
  fi
fi

# Copy _next static assets
if [ -d .next/static ]; then
  echo "Copying _next static assets..."
  mkdir -p out/_next
  cp -R .next/static out/_next/static
fi

# Copy any public directory if present (user assets)
if [ -d public ]; then
  echo "Copying public/ -> out/"
  cp -R public/* out/
fi

echo "Export assembled into: $ROOT_DIR/out"
ls -la out | sed -n '1,200p'

echo "Done. Copy contents of 'out/' to your SD card root (preserve directories)."
