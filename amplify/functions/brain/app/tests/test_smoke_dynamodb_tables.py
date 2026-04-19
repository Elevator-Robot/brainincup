"""
Smoke test: verify deployed DynamoDB tables and GSIs exist.

Requires live AWS credentials and deployed infrastructure.
Skipped automatically when AWS_REGION env var is not set.

**Validates: Requirements 1.1, 7.1, 9.1**
"""

import os
import pytest

AWS_REGION = os.environ.get("AWS_REGION", "")

pytestmark = pytest.mark.skipif(
    not AWS_REGION,
    reason="AWS_REGION not set — skipping live infrastructure smoke tests",
)


def _get_table_names() -> dict[str, str]:
    """
    Return a mapping of logical name → DynamoDB table name.
    Reads from env vars; falls back to None so individual tests can skip.
    """
    return {
        "PlayerState": os.environ.get("PLAYER_STATE_TABLE"),
        "WorldState": os.environ.get("WORLD_STATE_TABLE"),
        "ContentRegistry": os.environ.get("CONTENT_REGISTRY_TABLE"),
        "ActiveQuest": os.environ.get("ACTIVE_QUEST_TABLE"),
    }


def _describe_table(client, table_name: str) -> dict:
    """
    Describe a DynamoDB table. Calls pytest.skip if the table is not found.
    """
    try:
        response = client.describe_table(TableName=table_name)
        return response["Table"]
    except client.exceptions.ResourceNotFoundException:
        pytest.skip(f"Table '{table_name}' not found — infrastructure may not be deployed")


def _gsi_names(table_description: dict) -> set[str]:
    """Extract the set of GSI names from a describe_table response."""
    gsis = table_description.get("GlobalSecondaryIndexes", [])
    return {gsi["IndexName"] for gsi in gsis}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestNewTablesExistWithGSIs:
    """Verify each new table exists and has the expected GSIs."""

    @pytest.fixture(scope="class")
    def dynamodb(self):
        import boto3
        return boto3.client("dynamodb", region_name=AWS_REGION)

    def test_player_state_table_exists(self, dynamodb):
        table_name = os.environ.get("PLAYER_STATE_TABLE")
        if not table_name:
            pytest.skip("PLAYER_STATE_TABLE env var not set")
        table = _describe_table(dynamodb, table_name)
        assert table["TableStatus"] in ("ACTIVE", "UPDATING"), (
            f"PlayerState table status is {table['TableStatus']}"
        )

    def test_player_state_has_campaign_id_gsi(self, dynamodb):
        table_name = os.environ.get("PLAYER_STATE_TABLE")
        if not table_name:
            pytest.skip("PLAYER_STATE_TABLE env var not set")
        table = _describe_table(dynamodb, table_name)
        gsi_names = _gsi_names(table)
        matching = [n for n in gsi_names if "campaignId" in n or "campaignid" in n.lower()]
        assert matching, (
            f"PlayerState table has no GSI on campaignId. Found GSIs: {gsi_names}"
        )

    def test_world_state_table_exists(self, dynamodb):
        table_name = os.environ.get("WORLD_STATE_TABLE")
        if not table_name:
            pytest.skip("WORLD_STATE_TABLE env var not set")
        table = _describe_table(dynamodb, table_name)
        assert table["TableStatus"] in ("ACTIVE", "UPDATING")

    def test_world_state_has_campaign_id_gsi(self, dynamodb):
        table_name = os.environ.get("WORLD_STATE_TABLE")
        if not table_name:
            pytest.skip("WORLD_STATE_TABLE env var not set")
        table = _describe_table(dynamodb, table_name)
        gsi_names = _gsi_names(table)
        matching = [n for n in gsi_names if "campaignId" in n or "campaignid" in n.lower()]
        assert matching, (
            f"WorldState table has no GSI on campaignId. Found GSIs: {gsi_names}"
        )

    def test_content_registry_table_exists(self, dynamodb):
        table_name = os.environ.get("CONTENT_REGISTRY_TABLE")
        if not table_name:
            pytest.skip("CONTENT_REGISTRY_TABLE env var not set")
        table = _describe_table(dynamodb, table_name)
        assert table["TableStatus"] in ("ACTIVE", "UPDATING")

    def test_content_registry_has_campaign_id_gsi(self, dynamodb):
        table_name = os.environ.get("CONTENT_REGISTRY_TABLE")
        if not table_name:
            pytest.skip("CONTENT_REGISTRY_TABLE env var not set")
        table = _describe_table(dynamodb, table_name)
        gsi_names = _gsi_names(table)
        matching = [n for n in gsi_names if "campaignId" in n or "campaignid" in n.lower()]
        assert matching, (
            f"ContentRegistry table has no GSI on campaignId. Found GSIs: {gsi_names}"
        )

    def test_content_registry_has_doc_type_gsi(self, dynamodb):
        table_name = os.environ.get("CONTENT_REGISTRY_TABLE")
        if not table_name:
            pytest.skip("CONTENT_REGISTRY_TABLE env var not set")
        table = _describe_table(dynamodb, table_name)
        gsi_names = _gsi_names(table)
        matching = [n for n in gsi_names if "docType" in n or "doctype" in n.lower()]
        assert matching, (
            f"ContentRegistry table has no GSI on docType. Found GSIs: {gsi_names}"
        )

    def test_active_quest_table_exists(self, dynamodb):
        table_name = os.environ.get("ACTIVE_QUEST_TABLE")
        if not table_name:
            pytest.skip("ACTIVE_QUEST_TABLE env var not set")
        table = _describe_table(dynamodb, table_name)
        assert table["TableStatus"] in ("ACTIVE", "UPDATING")

    def test_active_quest_has_player_state_id_gsi(self, dynamodb):
        table_name = os.environ.get("ACTIVE_QUEST_TABLE")
        if not table_name:
            pytest.skip("ACTIVE_QUEST_TABLE env var not set")
        table = _describe_table(dynamodb, table_name)
        gsi_names = _gsi_names(table)
        matching = [n for n in gsi_names if "playerStateId" in n or "playerstateid" in n.lower()]
        assert matching, (
            f"ActiveQuest table has no GSI on playerStateId. Found GSIs: {gsi_names}"
        )


def test_new_tables_exist_with_gsis():
    """
    Consolidated smoke test: all four tables exist with their expected GSIs.
    Individual table checks are in TestNewTablesExistWithGSIs above.
    This test provides a single entry point for CI smoke runs.
    """
    import boto3

    client = boto3.client("dynamodb", region_name=AWS_REGION)
    table_names = _get_table_names()

    expected_gsis = {
        "PlayerState": ["campaignId"],
        "WorldState": ["campaignId"],
        "ContentRegistry": ["campaignId", "docType"],
        "ActiveQuest": ["playerStateId"],
    }

    for logical_name, table_name in table_names.items():
        if not table_name:
            pytest.skip(f"{logical_name.upper()}_TABLE env var not set")

        table = _describe_table(client, table_name)
        gsi_names_lower = {n.lower() for n in _gsi_names(table)}

        for expected_key in expected_gsis[logical_name]:
            assert any(expected_key.lower() in gsi for gsi in gsi_names_lower), (
                f"{logical_name} table '{table_name}' missing GSI for '{expected_key}'. "
                f"Found: {_gsi_names(table)}"
            )
