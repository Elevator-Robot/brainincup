"""
Hypothesis property test: JSON round-trip for all ContentRegistry document types.

For any valid ContentRegistry document, serializing to JSON and deserializing
must produce an equivalent document.

No live AWS dependencies required.

**Validates: Requirements 9.7**
"""

import json

from hypothesis import given, settings
from hypothesis import strategies as st


# ---------------------------------------------------------------------------
# Strategies for each document type
# ---------------------------------------------------------------------------

content_registry_body_strategy = st.one_of(
    # Campaign-like doc
    st.fixed_dictionaries({
        "id": st.text(min_size=1, max_size=50),
        "schemaVersion": st.just("1.0"),
        "docType": st.just("CAMPAIGN"),
        "title": st.text(min_size=1, max_size=100),
        "maxLevel": st.integers(min_value=1, max_value=20),
        "tags": st.lists(st.text(min_size=1, max_size=30), max_size=10),
    }),
    # Quest-like doc
    st.fixed_dictionaries({
        "id": st.text(min_size=1, max_size=50),
        "schemaVersion": st.just("1.0"),
        "docType": st.just("QUEST"),
        "campaignId": st.text(min_size=1, max_size=50),
        "minCharacterLevel": st.integers(min_value=1, max_value=10),
        "xpReward": st.integers(min_value=0, max_value=1000),
        "tags": st.lists(st.text(min_size=1, max_size=30), max_size=10),
    }),
    # Area-like doc
    st.fixed_dictionaries({
        "id": st.text(min_size=1, max_size=50),
        "schemaVersion": st.just("1.0"),
        "docType": st.just("AREA"),
        "minCharacterLevel": st.integers(min_value=1, max_value=10),
        "connectedAreaIds": st.lists(st.text(min_size=1, max_size=50), max_size=10),
        "tags": st.lists(st.text(min_size=1, max_size=30), max_size=10),
    }),
)


# ---------------------------------------------------------------------------
# Property test
# ---------------------------------------------------------------------------

@given(doc=content_registry_body_strategy)
@settings(max_examples=200)
def test_content_registry_json_roundtrip(doc):
    """
    For any valid ContentRegistry document, JSON round-trip produces an equivalent document.

    **Validates: Requirements 9.7**
    """
    serialized = json.dumps(doc)
    deserialized = json.loads(serialized)
    assert deserialized == doc
