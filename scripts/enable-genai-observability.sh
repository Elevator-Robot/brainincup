#!/usr/bin/env bash
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-brain}"
REGION="${AWS_REGION:-us-east-1}"
POLICY_NAME="${GENAI_OBS_POLICY_NAME:-TransactionSearchXRayAccess}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
PARTITION="$(aws sts get-caller-identity --query Arn --output text | cut -d: -f2)"

echo "== Enabling CloudWatch Transaction Search prerequisites =="
echo "AWS_PROFILE=${AWS_PROFILE} REGION=${REGION} ACCOUNT_ID=${ACCOUNT_ID}"

POLICY_DOCUMENT="$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TransactionSearchXRayAccess",
      "Effect": "Allow",
      "Principal": {
        "Service": "xray.amazonaws.com"
      },
      "Action": "logs:PutLogEvents",
      "Resource": [
        "arn:${PARTITION}:logs:${REGION}:${ACCOUNT_ID}:log-group:aws/spans:*",
        "arn:${PARTITION}:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/application-signals/data:*"
      ],
      "Condition": {
        "ArnLike": {
          "aws:SourceArn": "arn:${PARTITION}:xray:${REGION}:${ACCOUNT_ID}:*"
        },
        "StringEquals": {
          "aws:SourceAccount": "${ACCOUNT_ID}"
        }
      }
    }
  ]
}
JSON
)"

aws logs put-resource-policy \
  --policy-name "${POLICY_NAME}" \
  --policy-document "${POLICY_DOCUMENT}" >/dev/null

aws xray update-trace-segment-destination --destination CloudWatchLogs >/dev/null

if [ -n "${GENAI_OBS_INDEX_PERCENT:-}" ]; then
  aws xray update-indexing-rule \
    --name "Default" \
    --rule "{\"Probabilistic\":{\"DesiredSamplingPercentage\":${GENAI_OBS_INDEX_PERCENT}}}" >/dev/null
  echo "Applied X-Ray indexing percentage: ${GENAI_OBS_INDEX_PERCENT}%"
else
  echo "GENAI_OBS_INDEX_PERCENT not set; left X-Ray indexing rule unchanged."
fi

echo "✅ GenAI Observability account prerequisites configured."
echo "Next: redeploy runtime image and run npm run sandbox:local"
