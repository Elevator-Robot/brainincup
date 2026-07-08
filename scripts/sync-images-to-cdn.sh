#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

export AWS_PROFILE="${AWS_PROFILE:-brain}"
export AWS_PAGER=""
export AWS_REGION="${AWS_REGION:-us-east-1}"

echo "🖼️  Brain in Cup Image CDN Sync"
echo "================================"
echo ""

# Check for amplify_outputs.json
OUTPUTS_FILE="${PROJECT_ROOT}/amplify_outputs.json"
if [ ! -f "$OUTPUTS_FILE" ]; then
  echo "❌ Error: amplify_outputs.json not found"
  echo "   Run 'npm run deploy:sandbox' first to create the infrastructure"
  exit 1
fi

# Extract bucket name from outputs
BUCKET_NAME=$(jq -r '.custom.imageBucketName // empty' "$OUTPUTS_FILE" 2>/dev/null || echo "")
if [ -z "$BUCKET_NAME" ]; then
  echo "❌ Error: imageBucketName not found in amplify_outputs.json"
  echo "   Run 'npm run deploy:sandbox' first to create the image CDN"
  exit 1
fi

echo "📦 Target S3 Bucket: $BUCKET_NAME"
echo ""

# Check if images directory exists
IMAGES_DIR="${PROJECT_ROOT}/public/images"
if [ ! -d "$IMAGES_DIR" ]; then
  echo "❌ Error: public/images directory not found"
  exit 1
fi

# Count files to sync
FILE_COUNT=$(find "$IMAGES_DIR" -type f | wc -l | tr -d ' ')
echo "📁 Found $FILE_COUNT files to sync"
echo ""

# Verify bucket exists
echo "🔍 Verifying S3 bucket..."
if ! aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
  echo "❌ Error: Cannot access bucket '$BUCKET_NAME'"
  echo "   Check your AWS credentials and bucket permissions"
  exit 1
fi
echo "✅ Bucket accessible"
echo ""

# Sync images to S3 with proper cache headers
echo "📤 Syncing images to S3..."

# Sync main avatars directory (excluding thumbnails and medium)
aws s3 sync "$IMAGES_DIR/avatars" "s3://${BUCKET_NAME}/avatars/" \
  --exclude "thumbnails/*" \
  --exclude "medium/*" \
  --cache-control "public, max-age=2592000, immutable" \
  --acl private

# Sync thumbnails with aggressive caching
aws s3 sync "$IMAGES_DIR/avatars/thumbnails" "s3://${BUCKET_NAME}/avatars/thumbnails/" \
  --cache-control "public, max-age=31536000, immutable" \
  --acl private

# Sync medium sizes with aggressive caching
aws s3 sync "$IMAGES_DIR/avatars/medium" "s3://${BUCKET_NAME}/avatars/medium/" \
  --cache-control "public, max-age=31536000, immutable" \
  --acl private

echo ""
echo "✅ Sync complete!"
echo ""

# Get CloudFront distribution ID for invalidation
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Origins.Items[0].DomainName=='${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com'].Id | [0]" \
  --output text 2>/dev/null || echo "")

if [ -n "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
  echo "🔄 Creating CloudFront invalidation for /* ..."
  INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --invalidation-batch "Paths={Quantity=1,Items=[/*]},CallerReference=$(date +%s)" \
    --query 'Invalidation.Id' \
    --output text 2>/dev/null || echo "")

  if [ -n "$INVALIDATION_ID" ]; then
    echo "✅ Invalidation created: $INVALIDATION_ID"
    echo "   (Changes will propagate within 2-5 minutes)"
  else
    echo "⚠️  Could not create invalidation (may not have permissions)"
  fi
else
  echo "ℹ️  Could not find CloudFront distribution for invalidation"
  echo "   (Cache will update naturally within 24 hours)"
fi

echo ""
echo "🎉 Image CDN sync complete!"
