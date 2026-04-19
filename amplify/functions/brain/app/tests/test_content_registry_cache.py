"""
Unit tests for content_registry_cache module.

Tests use unittest.mock to avoid real DynamoDB calls.

**Validates: Requirements 9.2, 9.3, 11.6**
"""

import sys
import os
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import content_registry_cache as crc


def _make_dynamo_item(
    doc_id: str,
    doc_type: str,
    campaign_id: str,
    schema_version: str = "1.0",
    updated_at: str = "2024-01-01T00:00:00Z",
    title: str = "Test Doc",
) -> dict:
    """Build a DynamoDB AttributeValue map for a ContentRegistry document."""
    return {
        "id": {"S": doc_id},
        "docType": {"S": doc_type},
        "campaignId": {"S": campaign_id},
        "schemaVersion": {"S": schema_version},
        "updatedAt": {"S": updated_at},
        "title": {"S": title},
    }


def _make_mock_client(items: list[dict]) -> MagicMock:
    """Return a mock DynamoDB client whose query() returns *items* in one page."""
    client = MagicMock()
    client.query.return_value = {"Items": items, "Count": len(items)}
    return client


class TestCachePopulatedOnFirstCall(unittest.TestCase):
    """Task 4.3 — test 1: cache is populated after load_campaign_registry."""

    def setUp(self):
        crc.clear_cache()

    def test_cache_populated_on_first_call(self):
        items = [
            _make_dynamo_item("quest_001", "QUEST", "campaign_001"),
            _make_dynamo_item("scenario_001", "SCENARIO", "campaign_001"),
        ]
        mock_client = _make_mock_client(items)

        result = crc.load_campaign_registry("campaign_001", dynamodb_client=mock_client)

        self.assertIn("QUEST", result)
        self.assertIn("SCENARIO", result)
        self.assertEqual(len(result["QUEST"]), 1)
        self.assertEqual(len(result["SCENARIO"]), 1)
        self.assertEqual(result["QUEST"][0]["id"], "quest_001")

        cached = crc.get_cached_registry("campaign_001")
        self.assertIn("QUEST", cached)
        self.assertIn("SCENARIO", cached)

        mock_client.query.assert_called_once()


class TestSecondCallReturnsCachedValue(unittest.TestCase):
    """Task 4.3 — test 2: get_cached_registry returns data without a DynamoDB hit."""

    def setUp(self):
        crc.clear_cache()

    def test_second_call_returns_cached_value(self):
        items = [_make_dynamo_item("area_001", "AREA", "campaign_001")]
        mock_client = _make_mock_client(items)

        crc.load_campaign_registry("campaign_001", dynamodb_client=mock_client)
        first_call_count = mock_client.query.call_count

        cached = crc.get_cached_registry("campaign_001")

        self.assertEqual(mock_client.query.call_count, first_call_count,
                         "get_cached_registry should not call DynamoDB")
        self.assertIn("AREA", cached)
        self.assertEqual(cached["AREA"][0]["id"], "area_001")


class TestStaleDocumentTriggersRefetch(unittest.TestCase):
    """Task 4.3 — test 3: when updatedAt changes, refresh_if_stale re-fetches."""

    def setUp(self):
        crc.clear_cache()

    def test_stale_document_triggers_refetch(self):
        original_item = _make_dynamo_item(
            "quest_001", "QUEST", "campaign_001",
            updated_at="2024-01-01T00:00:00Z",
            title="Original Title",
        )
        updated_item = _make_dynamo_item(
            "quest_001", "QUEST", "campaign_001",
            updated_at="2024-06-01T00:00:00Z",
            title="Updated Title",
        )

        mock_client = MagicMock()

        mock_client.query.return_value = {"Items": [original_item], "Count": 1}
        crc.load_campaign_registry("campaign_001", dynamodb_client=mock_client)

        projection_response = {
            "Items": [
                {
                    "id": {"S": "quest_001"},
                    "docType": {"S": "QUEST"},
                    "updatedAt": {"S": "2024-06-01T00:00:00Z"},
                }
            ],
            "Count": 1,
        }
        full_response = {"Items": [updated_item], "Count": 1}
        mock_client.query.side_effect = [projection_response, full_response]

        crc.refresh_if_stale("campaign_001", dynamodb_client=mock_client)

        cached = crc.get_cached_registry("campaign_001")
        self.assertIn("QUEST", cached)
        self.assertEqual(cached["QUEST"][0]["title"], "Updated Title")


class TestSchemaVersionMismatchSkipsDocument(unittest.TestCase):
    """Task 4.3 — test 4: wrong schemaVersion skips doc and logs a warning."""

    def setUp(self):
        crc.clear_cache()

    def test_schema_version_mismatch_skips_document(self):
        good_item = _make_dynamo_item(
            "quest_001", "QUEST", "campaign_001", schema_version="1.0"
        )
        bad_item = _make_dynamo_item(
            "quest_002", "QUEST", "campaign_001", schema_version="2.0"
        )
        mock_client = _make_mock_client([good_item, bad_item])

        with self.assertLogs("content_registry_cache", level="WARNING") as log_ctx:
            result = crc.load_campaign_registry(
                "campaign_001", dynamodb_client=mock_client
            )

        self.assertIn("QUEST", result)
        self.assertEqual(len(result["QUEST"]), 1)
        self.assertEqual(result["QUEST"][0]["id"], "quest_001")

        warning_messages = [r for r in log_ctx.output if "WARNING" in r]
        self.assertTrue(
            any("quest_002" in msg or "schema version mismatch" in msg.lower()
                for msg in warning_messages),
            f"Expected a schema version warning, got: {log_ctx.output}",
        )


if __name__ == "__main__":
    unittest.main()
