#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

echo "🖼️  Brain in Cup Image Optimization"
echo "===================================="
echo ""

# Check if required tools are installed
if ! command -v cwebp &> /dev/null; then
  echo "❌ Error: cwebp not found. Install with: brew install webp"
  exit 1
fi

if ! command -v pngquant &> /dev/null; then
  echo "❌ Error: pngquant not found. Install with: brew install pngquant"
  exit 1
fi

if ! command -v magick &> /dev/null && ! command -v convert &> /dev/null; then
  echo "❌ Error: ImageMagick not found. Install with: brew install imagemagick"
  exit 1
fi

# Use magick if available, otherwise use convert
MAGICK_CMD="magick"
if ! command -v magick &> /dev/null; then
  MAGICK_CMD="convert"
fi

IMAGES_DIR="${PROJECT_ROOT}/public/images/avatars"

if [ ! -d "$IMAGES_DIR" ]; then
  echo "❌ Error: public/images/avatars directory not found"
  exit 1
fi

# Create directories for responsive images
mkdir -p "$IMAGES_DIR/thumbnails"
mkdir -p "$IMAGES_DIR/medium"

echo "📁 Optimizing PNGs with pngquant..."
cd "$IMAGES_DIR"
pngquant --quality=65-80 --force --ext .png *.png 2>/dev/null || true
echo "✅ PNG optimization complete"
echo ""

echo "🔄 Converting to WebP format..."
for file in *.png; do
  if [ -f "$file" ]; then
    cwebp -q 85 "$file" -o "${file%.png}.webp" -quiet 2>/dev/null || true
  fi
done
echo "✅ WebP conversion complete"
echo ""

echo "📐 Creating thumbnail versions (100px)..."
for file in *.png; do
  if [ -f "$file" ]; then
    $MAGICK_CMD "$file" -resize 100x100 "thumbnails/${file%.png}.webp" 2>/dev/null || true
  fi
done
echo "✅ Thumbnails created"
echo ""

echo "📐 Creating medium versions (200px)..."
for file in *.png; do
  if [ -f "$file" ]; then
    $MAGICK_CMD "$file" -resize 200x200 "medium/${file%.png}.webp" 2>/dev/null || true
  fi
done
echo "✅ Medium versions created"
echo ""

# Count files
PNG_COUNT=$(ls -1 *.png 2>/dev/null | wc -l | tr -d ' ')
WEBP_COUNT=$(ls -1 *.webp 2>/dev/null | wc -l | tr -d ' ')
THUMB_COUNT=$(ls -1 thumbnails/*.webp 2>/dev/null | wc -l | tr -d ' ')
MEDIUM_COUNT=$(ls -1 medium/*.webp 2>/dev/null | wc -l | tr -d ' ')

echo "📊 Optimization Summary:"
echo "   PNG files: $PNG_COUNT"
echo "   WebP files: $WEBP_COUNT"
echo "   Thumbnails: $THUMB_COUNT"
echo "   Medium sizes: $MEDIUM_COUNT"
echo ""

# Calculate size savings
ORIGINAL_SIZE=$(du -sh . 2>/dev/null | cut -f1)
echo "💾 Total size after optimization: $ORIGINAL_SIZE"
echo ""

echo "🎉 Image optimization complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'npm run deploy:sandbox' to create/update CDN infrastructure"
echo "  2. Run 'npm run deploy:images' to sync optimized images to CDN"
