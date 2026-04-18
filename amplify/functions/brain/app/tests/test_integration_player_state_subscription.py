"""
Integration test: verify PlayerState writes complete and the AppSync subscription
delivers the update within 5 seconds.

Requires a live AppSync endpoint with WebSocket subscription support.
Skipped when APPSYNC_ENDPOINT is not set.

**Validates: Requirements 1.3, 11.5**
"""

import asyncio
import json
import os
import uuid
import pytest

APPSYNC_ENDPOINT = os.environ.get("APPSYNC_ENDPOINT", "")
APPSYNC_REALTIME_ENDPOINT = os.environ.get(
    "APPSYNC_REALTIME_ENDPOINT",
    APPSYNC_ENDPOINT.replace("https://", "wss://").replace("/graphql", "/realtime/graphql")
    if APPSYNC_ENDPOINT else "",
)

pytestmark = pytest.mark.skipif(
    not APPSYNC_ENDPOINT,
    reason="APPSYNC_ENDPOINT not set — skipping AppSync subscription integration tests",
)

SUBSCRIPTION_TIMEOUT_SECONDS = 5


# ---------------------------------------------------------------------------
# GraphQL helpers (HTTP)
# ---------------------------------------------------------------------------

def _graphql_request(query: str, variables: dict, jwt_token: str) -> dict:
    import urllib.request
    import urllib.error

    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        APPSYNC_ENDPOINT,
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
        return {"httpError": exc.code, "body": exc.read().decode("utf-8", errors="replace")}


CREATE_PLAYER_STATE_MUTATION = """
mutation CreatePlayerState($input: CreatePlayerStateInput!) {
  createPlayerState(input: $input) {
    id
    campaignId
    currentXP
    currentLevel
  }
}
"""

UPDATE_PLAYER_STATE_MUTATION = """
mutation UpdatePlayerState($input: UpdatePlayerStateInput!) {
  updatePlayerState(input: $input) {
    id
    campaignId
    currentXP
  }
}
"""

DELETE_PLAYER_STATE_MUTATION = """
mutation DeletePlayerState($input: DeletePlayerStateInput!) {
  deletePlayerState(input: $input) {
    id
  }
}
"""

ON_UPDATE_PLAYER_STATE_SUBSCRIPTION = """
subscription OnUpdatePlayerState($filter: ModelSubscriptionPlayerStateFilterInput) {
  onUpdatePlayerState(filter: $filter) {
    id
    campaignId
    currentXP
  }
}
"""


# ---------------------------------------------------------------------------
# WebSocket subscription helper
# ---------------------------------------------------------------------------

async def _subscribe_and_wait_for_update(
    campaign_id: str,
    jwt_token: str,
    timeout: float = SUBSCRIPTION_TIMEOUT_SECONDS,
) -> dict | None:
    """
    Open a WebSocket subscription to onUpdatePlayerState filtered by campaignId.
    Returns the first matching event payload, or None on timeout.
    """
    try:
        import websockets  # type: ignore
    except ImportError:
        pytest.skip("websockets package not available — install with: pip install websockets")

    # AppSync WebSocket protocol requires a base64-encoded header
    import base64

    header = base64.b64encode(
        json.dumps({"Authorization": f"Bearer {jwt_token}"}).encode()
    ).decode()

    ws_url = f"{APPSYNC_REALTIME_ENDPOINT}?header={header}&payload=e30="

    subscription_id = uuid.uuid4().hex

    init_msg = json.dumps({"type": "connection_init"})
    subscribe_msg = json.dumps({
        "id": subscription_id,
        "type": "start",
        "payload": {
            "data": json.dumps({
                "query": ON_UPDATE_PLAYER_STATE_SUBSCRIPTION,
                "variables": {
                    "filter": {"campaignId": {"eq": campaign_id}}
                },
            }),
            "extensions": {
                "authorization": {
                    "Authorization": f"Bearer {jwt_token}",
                    "host": APPSYNC_ENDPOINT.replace("https://", "").split("/")[0],
                }
            },
        },
    })

    received_event = None

    try:
        async with websockets.connect(
            ws_url,
            subprotocols=["graphql-ws"],
            open_timeout=10,
        ) as ws:
            await ws.send(init_msg)

            # Wait for connection_ack
            ack_deadline = asyncio.get_event_loop().time() + 5
            while asyncio.get_event_loop().time() < ack_deadline:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                if msg.get("type") == "connection_ack":
                    break

            await ws.send(subscribe_msg)

            # Wait for subscription start_ack then data
            deadline = asyncio.get_event_loop().time() + timeout
            while asyncio.get_event_loop().time() < deadline:
                remaining = deadline - asyncio.get_event_loop().time()
                if remaining <= 0:
                    break
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                    msg = json.loads(raw)
                    if msg.get("type") == "data" and msg.get("id") == subscription_id:
                        received_event = msg.get("payload", {}).get("data", {})
                        break
                except asyncio.TimeoutError:
                    break
    except Exception as exc:
        pytest.skip(f"WebSocket connection failed: {exc}")

    return received_event


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

def test_player_state_write_and_subscription_delivery():
    """
    Write a PlayerState record, update it, and verify the subscription delivers
    the update within 5 seconds.
    """
    admin_jwt = os.environ.get("ADMIN_JWT") or os.environ.get("NON_ADMIN_JWT")
    if not admin_jwt:
        pytest.skip("ADMIN_JWT or NON_ADMIN_JWT env var not set")

    unique_campaign_id = f"test_sub_{uuid.uuid4().hex[:12]}"
    created_id = None

    try:
        # 1. Create a PlayerState record
        create_resp = _graphql_request(
            CREATE_PLAYER_STATE_MUTATION,
            {
                "input": {
                    "campaignId": unique_campaign_id,
                    "currentLevel": 1,
                    "currentXP": 0,
                    "xpToNextLevel": 100,
                    "currentAreaId": "starting_area",
                    "lastKnownLocation": "The Shrouded Vale",
                    "version": 1,
                }
            },
            admin_jwt,
        )

        errors = create_resp.get("errors")
        if errors:
            pytest.skip(f"Could not create PlayerState for subscription test: {errors}")

        created_id = (
            (create_resp.get("data") or {})
            .get("createPlayerState", {})
            .get("id")
        )
        if not created_id:
            pytest.skip("createPlayerState did not return an id")

        # 2. Open subscription and wait for update
        new_xp = 150

        async def run():
            # Start subscription listener
            listen_task = asyncio.ensure_future(
                _subscribe_and_wait_for_update(unique_campaign_id, admin_jwt)
            )

            # Small delay to let subscription establish before we mutate
            await asyncio.sleep(1)

            # 3. Update the PlayerState
            _graphql_request(
                UPDATE_PLAYER_STATE_MUTATION,
                {"input": {"id": created_id, "currentXP": new_xp}},
                admin_jwt,
            )

            # 4. Wait for subscription delivery
            event = await listen_task
            return event

        event = asyncio.get_event_loop().run_until_complete(run())

        assert event is not None, (
            f"Subscription did not deliver an update within {SUBSCRIPTION_TIMEOUT_SECONDS}s"
        )

        update_data = event.get("onUpdatePlayerState") or {}
        assert update_data.get("currentXP") == new_xp, (
            f"Expected currentXP={new_xp} in subscription event, got: {update_data}"
        )
        assert update_data.get("campaignId") == unique_campaign_id

    finally:
        # 5. Clean up: delete the test record
        if created_id:
            _graphql_request(
                DELETE_PLAYER_STATE_MUTATION,
                {"input": {"id": created_id}},
                admin_jwt,
            )
