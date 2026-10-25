"""Player-facing narrator annotations, never private model reasoning.

The model streams ordinary prose first, followed by a bounded metadata trailer.
Only the prose is emitted as speech/text; annotations use the shared response
metadata contract. No additional inference call or gameplay mutation is needed.
"""
import json

OPEN = "<NARRATOR_NOTES>"
CLOSE = "</NARRATOR_NOTES>"
MAX_NOTES_CHARS = 8000

NOTES_INSTRUCTIONS = """
NARRATOR VOICE:
Use original, intimate second-person narration: tactile sensory details, measured
pauses, understated wit when appropriate, and quiet unease rather than purple
prose. Let the player infer. Do not imitate or quote a particular game or actor.
Never prescribe the player's emotions or decisions. Preserve all locked facts.

OUTPUT CONTRACT:
Stream the public narration normally. After it, on a new line, append exactly:
<NARRATOR_NOTES>{"sensations":["one observable detail"],
"thoughts":["one brief, player-facing interpretation, phrased as uncertain"],
"memories":"an established story detail already known to the player, or empty",
"self_reflection":"a short thematic narrator aside, or empty"}</NARRATOR_NOTES>
These are authored story annotations for a player-visible expandable panel,
NOT your chain of thought, internal analysis, plans, hidden rolls, NPC secrets,
unrevealed clues, or information the player has not discovered. Do not invent
past events to fill a field. Use at most two short sensations and thoughts.
Use empty strings/lists where there is no grounded detail. No Markdown fences.
Only the public narration belongs before the marker. Do not mention this format.
"""


def clean_notes(value) -> dict:
    if not isinstance(value, dict):
        return {}
    result = {}
    for key in ("sensations", "thoughts"):
        items = value.get(key)
        if isinstance(items, list):
            result[key] = [item.strip()[:280] for item in items[:2] if isinstance(item, str) and item.strip()]
    for key in ("memories", "self_reflection"):
        item = value.get(key)
        if isinstance(item, str):
            result[key] = item.strip()[:600]
    return result


class NarratorStream:
    def __init__(self):
        self.pending = ""
        self.private = False
        self.trailer = ""
        self.overflow = False

    def _append_trailer(self, value: str):
        if len(self.trailer) + len(value) > MAX_NOTES_CHARS:
            self.overflow = True
            return
        if not self.overflow:
            self.trailer += value

    def feed(self, value: str) -> str:
        if self.private:
            self._append_trailer(value)
            return ""
        self.pending += value
        position = self.pending.find(OPEN)
        if position >= 0:
            public = self.pending[:position]
            self.private = True
            self._append_trailer(self.pending[position + len(OPEN):])
            self.pending = ""
            return public
        # Hold only a possible marker prefix, even when it straddles tokens.
        held = 0
        for length in range(1, min(len(OPEN), len(self.pending) + 1)):
            if self.pending.endswith(OPEN[:length]):
                held = length
        public = self.pending[:-held] if held else self.pending
        self.pending = self.pending[-held:] if held else ""
        return public

    def finish_public(self) -> str:
        # A dangling marker prefix is an incomplete trailer, not public speech.
        public = self.pending if not OPEN.startswith(self.pending) else ""
        self.pending = ""
        return public

    def notes(self) -> dict:
        if not self.private or self.overflow or CLOSE not in self.trailer:
            return {}
        body, _, remaining = self.trailer.partition(CLOSE)
        if remaining.strip():
            return {}
        try:
            return clean_notes(json.loads(body))
        except (ValueError, TypeError):
            return {}
