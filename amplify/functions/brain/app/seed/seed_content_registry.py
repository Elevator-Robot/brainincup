#!/usr/bin/env python3
"""
Seed script for the ContentRegistry DynamoDB table.

Reads all seed JSON files from the seed directory and writes each document
to the ContentRegistry table via boto3 put_item (idempotent).

Usage:
    CONTENT_REGISTRY_TABLE_NAME=MyTable python seed_content_registry.py

Environment variables:
    CONTENT_REGISTRY_TABLE_NAME  DynamoDB table name (required)
    AWS_REGION                   AWS region (default: us-east-1)
"""

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

SEED_DIR = Path(__file__).parent

SEED_FILES = [
    "campaign_001.json",
    "quests.json",
    "scenarios.json",
    "areas.json",
    "surprise_events.json",
]


def load_seed_file(path: Path) -> list[dict[str, Any]]:
    """Load a seed JSON file and return a list of documents."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    raise ValueError(f"Unexpected JSON structure in {path}: expected dict or list")


def build_registry_item(doc: dict[str, Any]) -> dict[str, Any]:
    """
    Wrap a content document in a ContentRegistry record.

    Each item written has:
      id, docType, schemaVersion, campaignId, tags, body (JSON string),
      createdAt, updatedAt
    """
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": str(uuid.uuid4()),
        "docType": doc["docType"],
        "schemaVersion": doc.get("schemaVersion", "1.0"),
        "campaignId": doc.get("campaignId", "campaign_001"),
        "tags": doc.get("tags", []),
        "body": json.dumps(doc, ensure_ascii=False),
        "createdAt": now,
        "updatedAt": now,
    }


def collect_documents() -> list[dict[str, Any]]:
    """Load all seed files and return a flat list of documents."""
    all_docs: list[dict[str, Any]] = []
    for filename in SEED_FILES:
        path = SEED_DIR / filename
        if not path.exists():
            print(f"Warning: seed file not found, skipping: {path}")
            continue
        try:
            docs = load_seed_file(path)
            print(f"Loaded {len(docs)} document(s) from {filename}")
            all_docs.extend(docs)
        except (json.JSONDecodeError, ValueError) as exc:
            print(f"Error loading {filename}: {exc}")
            sys.exit(1)
    return all_docs


def main() -> None:
    table_name = os.environ.get("CONTENT_REGISTRY_TABLE_NAME")
    if not table_name:
        print("Error: CONTENT_REGISTRY_TABLE_NAME environment variable is required.")
        sys.exit(1)

    region = os.environ.get("AWS_REGION", "us-east-1")

    documents = collect_documents()
    if not documents:
        print("No documents found. Nothing to seed.")
        sys.exit(0)

    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(table_name)

    success_count = 0
    error_count = 0

    for doc in documents:
        doc_id = doc.get("id", "<unknown>")
        doc_type = doc.get("docType", "<unknown>")
        try:
            item = build_registry_item(doc)
            table.put_item(Item=item)
            success_count += 1
        except (BotoCoreError, ClientError) as exc:
            print(f"Error writing id={doc_id} docType={doc_type}: {exc}")
            error_count += 1
        except (KeyError, ValueError, TypeError) as exc:
            print(f"Error building item for id={doc_id}: {exc}")
            error_count += 1

    print(f"Seeded {success_count} documents to {table_name}")
    if error_count > 0:
        print(f"Errors: {error_count}")
        sys.exit(1)


if __name__ == "__main__":
    main()
