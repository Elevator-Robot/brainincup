"""
Property-based tests for get_valid_retention_days using Hypothesis.

This module mirrors the TypeScript `getValidRetentionDays` logic from
`amplify/backend.ts` as a pure Python helper and validates its correctness
properties.

Properties verified:
  - Property 2: Any integer not in the valid set raises ValueError
  - Property 3: Any value in the valid set is returned unchanged
  - Default: None input returns 30

**Validates: Requirements 8.1, 8.3**
"""

import sys
import os

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Python mirror of getValidRetentionDays from amplify/backend.ts
# ---------------------------------------------------------------------------

VALID_RETENTION_DAYS = {
    1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731,
    1096, 1827, 2192, 2557, 2922, 3288, 3653,
}


def get_valid_retention_days(value):
    if value is None:
        return 30
    parsed = int(value)
    if parsed not in VALID_RETENTION_DAYS:
        valid_values = ', '.join(str(v) for v in sorted(VALID_RETENTION_DAYS))
        raise ValueError(
            f"Invalid OBSERVABILITY_LOG_RETENTION_DAYS value: {value}. "
            f"Must be one of: {valid_values}"
        )
    return parsed


# ---------------------------------------------------------------------------
# Unit test: None returns default of 30
# ---------------------------------------------------------------------------

def test_none_returns_default_30():
    """get_valid_retention_days(None) returns the default value 30."""
    assert get_valid_retention_days(None) == 30


# ---------------------------------------------------------------------------
# Property 2: Invalid retention value always throws
# **Validates: Requirements 8.1, 8.3**
# ---------------------------------------------------------------------------

@settings(max_examples=100)
@given(st.integers().filter(lambda x: x not in VALID_RETENTION_DAYS))
def test_invalid_retention_value_always_raises(value):
    """
    Property 2: Any integer not in the valid CloudWatch retention set raises ValueError.

    **Validates: Requirements 8.1, 8.3**
    """
    with pytest.raises(ValueError, match="Invalid OBSERVABILITY_LOG_RETENTION_DAYS value"):
        get_valid_retention_days(value)


# ---------------------------------------------------------------------------
# Property 3: Valid retention value is preserved
# **Validates: Requirements 8.1, 8.3**
# ---------------------------------------------------------------------------

@settings(max_examples=100)
@given(st.sampled_from(sorted(VALID_RETENTION_DAYS)))
def test_valid_retention_value_is_preserved(value):
    """
    Property 3: Any value in the valid set is returned unchanged.

    **Validates: Requirements 8.1, 8.3**
    """
    result = get_valid_retention_days(value)
    assert result == value, (
        f"Expected get_valid_retention_days({value}) == {value}, got {result}"
    )


# ---------------------------------------------------------------------------
# Python mirror of buildObservabilityConfig from amplify/backend.ts
# ---------------------------------------------------------------------------

def build_observability_config(get_config):
    """Python mirror of buildObservabilityConfig from amplify/backend.ts."""
    invocation_logging_enabled = get_config('OBSERVABILITY_INVOCATION_LOGGING_ENABLED') != 'false'
    agentcore_enabled = get_config('OBSERVABILITY_AGENTCORE_ENABLED') != 'false'
    log_retention_days = get_valid_retention_days(get_config('OBSERVABILITY_LOG_RETENTION_DAYS'))
    s3_bucket_name = get_config('BEDROCK_INVOCATION_LOG_S3_BUCKET')
    alarm_sns_arn = get_config('OBSERVABILITY_ALARM_SNS_ARN')
    return {
        'invocationLoggingEnabled': invocation_logging_enabled,
        'agentcoreEnabled': agentcore_enabled,
        'logRetentionDays': log_retention_days,
        's3BucketName': s3_bucket_name,
        'alarmSnsArn': alarm_sns_arn,
    }


# ---------------------------------------------------------------------------
# Unit tests for build_observability_config
# **Validates: Requirements 7.1, 7.2, 7.4**
# ---------------------------------------------------------------------------

def _make_get_config(env: dict):
    """Helper: returns a get_config function backed by the given dict."""
    return lambda key: env.get(key)


def test_all_keys_absent_returns_defaults():
    """All keys absent → all defaults applied."""
    config = build_observability_config(_make_get_config({}))
    assert config['invocationLoggingEnabled'] is True
    assert config['agentcoreEnabled'] is True
    assert config['logRetentionDays'] == 30
    assert config['s3BucketName'] is None
    assert config['alarmSnsArn'] is None


def test_invocation_logging_disabled():
    """OBSERVABILITY_INVOCATION_LOGGING_ENABLED=false → invocationLoggingEnabled=False."""
    config = build_observability_config(
        _make_get_config({'OBSERVABILITY_INVOCATION_LOGGING_ENABLED': 'false'})
    )
    assert config['invocationLoggingEnabled'] is False


def test_agentcore_disabled():
    """OBSERVABILITY_AGENTCORE_ENABLED=false → agentcoreEnabled=False."""
    config = build_observability_config(
        _make_get_config({'OBSERVABILITY_AGENTCORE_ENABLED': 'false'})
    )
    assert config['agentcoreEnabled'] is False


def test_s3_bucket_name_populated():
    """BEDROCK_INVOCATION_LOG_S3_BUCKET set → s3BucketName populated."""
    config = build_observability_config(
        _make_get_config({'BEDROCK_INVOCATION_LOG_S3_BUCKET': 'my-bucket'})
    )
    assert config['s3BucketName'] == 'my-bucket'


def test_alarm_sns_arn_populated():
    """OBSERVABILITY_ALARM_SNS_ARN set → alarmSnsArn populated."""
    arn = 'arn:aws:sns:us-east-1:123:my-topic'
    config = build_observability_config(
        _make_get_config({'OBSERVABILITY_ALARM_SNS_ARN': arn})
    )
    assert config['alarmSnsArn'] == arn
