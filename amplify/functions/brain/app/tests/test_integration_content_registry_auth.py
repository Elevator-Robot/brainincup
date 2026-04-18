"""
Integration test: verify AppSync authorization rules for ContentRegistry.

Requires a live AppSync endpoint. Skipped when APPSYNC_ENDPOINT is not set.

Tests:
  1. Non-Admin cannot create ContentRegistry (Unauthorized)
  2. Admin can create ContentRegistry (returns id)
  3. Authenticated user can read ContentRegistry (no auth error)

**Validates: Requirements 9.4**
"""

import json
import os
import uuid
import pytest

APPSYNC_ENDPOINT = os.environ.get("APPSYNC_ENDPOINT", "")

pytestmark = pytest.mark.skipif(
    not APPSYNC_ENDPOINT,
    reason="APPSYNC_ENDPOINT not set — skipping AppSync auth integration tests",
)


# ---------------------------------------------------------------------------
# GraphQL helpers
# ---------------------------------------------------------------------------

def _graphql_request(endpoint: str, query: str, variables: dict, jwt_token: str) -> dict:
    """
    Make a GraphQL POST request to AppSync using a JWT bearer token.
    Returns the parsed JSON response body.
    """
    import urllib.request
    import urllib.error

    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {jwt_token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"httpError": exc.code, "body": body}


CREATE_CONTENT_REGISTRY_MUTATION = """
mutation CreateContentRegistry($input: CreateContentRegistryInput!) {
  createContentRegistry(input: $input) {
    id
    docType
    schemaVersion
    campaignId
  }
}
"""

LIST_CONTENT_REGISTRIES_QUERY = """
query ListContentRegistries {
  listContentRegistries {
    items {
      id
      docType
    }
  }
}
"""


def _create_input(unique_suffix: str = "") -> dict:
    return {
        "input": {
            "docType": "CAMPAIGN",
            "schemaVersion": "1.0",
            "campaignId": f"test_campaign_{unique_suffix or uuid.uuid4().hex[:8]}",
            "tags": ["test"],
            "body": json.dumps({
                "id": f"test_{unique_suffix}",
                "schemaVersion": "1.0",
                "docType": "CAMPAIGN",
                "title": "Test Campaign",
                "maxLevel": 5,
                "tags": ["test"],
            }),
        }
    }


def _has_auth_error(response: dict) -> bool:
    """Return True if the response contains an Unauthorized / Not Authorized error."""
    errors = response.get("errors", [])
    for err in errors:
        msg = (err.get("message") or "").lower()
        if "unauthorized" in msg or "not authorized" in msg or "forbidden" in msg:
            return True
    # Also check HTTP-level 401/403
    if response.get("httpError") in (401, 403):
        return True
    return False


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_non_admin_cannot_create_content_registry():
    """
    A non-Admin JWT must receive an Unauthorized error when attempting
    to create a ContentRegistry document.
    """
    non_admin_jwt = os.environ.get("NON_ADMIN_JWT")
    if not non_admin_jwt:
        pytest.skip("NON_ADMIN_JWT env var not set")

    response = _graphql_request(
        APPSYNC_ENDPOINT,
        CREATE_CONTENT_REGISTRY_MUTATION,
        _create_input("non_admin"),
        non_admin_jwt,
    )

    assert _has_auth_error(response), (
        f"Expected Unauthorized error for non-Admin user, but got: {json.dumps(response, indent=2)}"
    )
    # Ensure no data was created
    data = response.get("data") or {}
    assert data.get("createContentRegistry") is None, (
        "Non-Admin user should not have created a ContentRegistry record"
    )


def test_admin_can_create_content_registry():
    """
    An Admin JWT must be able to create a ContentRegistry document
    and receive back an id.
    """
    admin_jwt = os.environ.get("ADMIN_JWT")
    if not admin_jwt:
        pytest.skip("ADMIN_JWT env var not set")

    response = _graphql_request(
        APPSYNC_ENDPOINT,
        CREATE_CONTENT_REGISTRY_MUTATION,
        _create_input("admin"),
        admin_jwt,
    )

    assert not _has_auth_error(response), (
        f"Admin user received unexpected auth error: {json.dumps(response, indent=2)}"
    )

    data = response.get("data") or {}
    created = data.get("createContentRegistry")
    assert created is not None, (
        f"Expected createContentRegistry to return a record, got: {json.dumps(response, indent=2)}"
    )
    assert created.get("id"), (
        f"Expected created record to have an id, got: {created}"
    )


def test_authenticated_user_can_read_content_registry():
    """
    Any authenticated user (including non-Admin) must be able to list
    ContentRegistry documents without an auth error.
    """
    non_admin_jwt = os.environ.get("NON_ADMIN_JWT")
    if not non_admin_jwt:
        pytest.skip("NON_ADMIN_JWT env var not set")

    response = _graphql_request(
        APPSYNC_ENDPOINT,
        LIST_CONTENT_REGISTRIES_QUERY,
        {},
        non_admin_jwt,
    )

    assert not _has_auth_error(response), (
        f"Authenticated user received unexpected auth error on read: "
        f"{json.dumps(response, indent=2)}"
    )

    data = response.get("data") or {}
    assert "listContentRegistries" in data, (
        f"Expected listContentRegistries in response data, got: {data}"
    )
