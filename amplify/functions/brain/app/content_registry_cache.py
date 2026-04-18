"""
ContentRegistryCache — in-memory cache for Content Registry documents.

On cold start, load_campaign_registry fetches all documents for a campaign
from DynamoDB (ContentRegistry table via GSI on campaignId). Subsequent
warm invocations call refresh_if_stale, which performs a lightweight scan
of updatedAt values and re-fetches only changed documents.

Schema version validation: documents whose schemaVersion does not match
CURRENT_SCHEMA_VERSION are skipped with a warning log.
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

CURRENT_SCHEMA_VERSION = "1.0"

# Module-level cache keyed by (campaign_id, doc_type) → list of documents
_cache: dict[tuple[str, str], list[dict]] = {}

# Tracks the latest updatedAt seen per (campaign_id, doc_type) key
_cache_timestamps: dict[tuple[str, str], str] = {}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_dynamodb_client(dynamodb_client=None):
    """Return the provided client or create a boto3 DynamoDB client."""
    if dynamodb_client is not None:
        return dynamodb_client
    import boto3
    return boto3.client("dynamodb")


def _unmarshal_item(item: dict) -> dict:
    """Convert a DynamoDB AttributeValue map to a plain Python dict."""
    try:
        from boto3.dynamodb.types import TypeDeserializer
        deserializer = TypeDeserializer()
        return {k: deserializer.deserialize(v) for k, v in item.items()}
    except ImportError:
        return item


def _query_campaign_documents(campaign_id: str, dynamodb_client) -> list[dict]:
    """
    Query all ContentRegistry documents for a campaign via the campaignId GSI.
    Returns a list of plain Python dicts (unmarshalled).
    """
    import os
    table_name = os.environ.get("CONTENT_REGISTRY_TABLE", "ContentRegistry")

    items: list[dict] = []
    kwargs: dict = {
        "TableName": table_name,
        "IndexName": "campaignId-index",
        "KeyConditionExpression": "campaignId = :cid",
        "ExpressionAttributeValues": {":cid": {"S": campaign_id}},
    }

    while True:
        response = dynamodb_client.query(**kwargs)
        for raw_item in response.get("Items", []):
            items.append(_unmarshal_item(raw_item))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key

    return items


def _scan_updated_at(campaign_id: str, dynamodb_client) -> dict[tuple[str, str], str]:
    """
    Lightweight projection query: fetch only (id, docType, updatedAt) for all
    documents in the campaign. Returns a dict keyed by (campaign_id, doc_type)
    mapping to the latest updatedAt string seen for that group.
    """
    import os
    table_name = os.environ.get("CONTENT_REGISTRY_TABLE", "ContentRegistry")

    latest: dict[tuple[str, str], str] = {}
    kwargs: dict = {
        "TableName": table_name,
        "IndexName": "campaignId-index",
        "KeyConditionExpression": "campaignId = :cid",
        "ExpressionAttributeValues": {":cid": {"S": campaign_id}},
        "ProjectionExpression": "id, docType, updatedAt",
    }

    while True:
        response = dynamodb_client.query(**kwargs)
        for raw_item in response.get("Items", []):
            item = _unmarshal_item(raw_item)
            doc_type = item.get("docType", "")
            updated_at = item.get("updatedAt", "")
            key = (campaign_id, doc_type)
            if key not in latest or updated_at > latest[key]:
                latest[key] = updated_at
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key

    return latest


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_campaign_registry(
    campaign_id: str,
    dynamodb_client=None,
) -> dict[str, list[dict]]:
    """
    Fetch all ContentRegistry documents for *campaign_id* from DynamoDB,
    validate schema versions, populate the module-level cache, and return
    a dict keyed by doc_type.

    Documents whose schemaVersion != CURRENT_SCHEMA_VERSION are skipped
    with a warning log entry.
    """
    client = _get_dynamodb_client(dynamodb_client)
    raw_docs = _query_campaign_documents(campaign_id, client)

    result: dict[str, list[dict]] = {}

    for doc in raw_docs:
        doc_schema = doc.get("schemaVersion", "")
        if doc_schema != CURRENT_SCHEMA_VERSION:
            logger.warning(
                "Skipping document %s: schema version mismatch "
                "(expected %s, got %s)",
                doc.get("id", "<unknown>"),
                CURRENT_SCHEMA_VERSION,
                doc_schema,
            )
            continue

        doc_type = doc.get("docType", "")
        result.setdefault(doc_type, []).append(doc)

        key = (campaign_id, doc_type)
        _cache[key] = result[doc_type]

        updated_at = doc.get("updatedAt", "")
        existing_ts = _cache_timestamps.get(key, "")
        if updated_at > existing_ts:
            _cache_timestamps[key] = updated_at

    return result


def refresh_if_stale(
    campaign_id: str,
    dynamodb_client=None,
) -> None:
    """
    Perform a lightweight scan of updatedAt values for the campaign and
    re-fetch only document groups whose updatedAt has changed since the
    last cache population.
    """
    client = _get_dynamodb_client(dynamodb_client)
    latest_timestamps = _scan_updated_at(campaign_id, client)

    stale_doc_types: set[str] = set()

    for (cid, doc_type), latest_ts in latest_timestamps.items():
        if cid != campaign_id:
            continue
        key = (campaign_id, doc_type)
        cached_ts = _cache_timestamps.get(key, "")
        if latest_ts != cached_ts:
            stale_doc_types.add(doc_type)

    if not stale_doc_types:
        return

    raw_docs = _query_campaign_documents(campaign_id, client)

    refreshed: dict[str, list[dict]] = {}

    for doc in raw_docs:
        doc_type = doc.get("docType", "")
        if doc_type not in stale_doc_types:
            continue

        doc_schema = doc.get("schemaVersion", "")
        if doc_schema != CURRENT_SCHEMA_VERSION:
            logger.warning(
                "Skipping document %s during refresh: schema version mismatch "
                "(expected %s, got %s)",
                doc.get("id", "<unknown>"),
                CURRENT_SCHEMA_VERSION,
                doc_schema,
            )
            continue

        refreshed.setdefault(doc_type, []).append(doc)

    for doc_type, docs in refreshed.items():
        key = (campaign_id, doc_type)
        _cache[key] = docs
        new_ts = latest_timestamps.get((campaign_id, doc_type), "")
        _cache_timestamps[key] = new_ts


def get_cached_registry(campaign_id: str) -> dict[str, list[dict]]:
    """
    Return the current in-memory cache for *campaign_id* as a dict keyed
    by doc_type. Returns an empty dict if the registry has not been loaded.
    """
    result: dict[str, list[dict]] = {}
    for (cid, doc_type), docs in _cache.items():
        if cid == campaign_id:
            result[doc_type] = docs
    return result


def clear_cache() -> None:
    """Clear all cached data. Intended for use in tests."""
    _cache.clear()
    _cache_timestamps.clear()
