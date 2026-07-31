"""HTTP server run under the Lambda Web Adapter (LWA).

The Python managed runtime cannot stream Lambda responses, so the Lambda runs
this server via LWA (AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap, handler=run.sh).
LWA proxies Lambda Function URL requests to this process:

- POST /        -> AG-UI Server-Sent Event streaming endpoint
- POST /events  -> non-HTTP event triggers (DynamoDB stream batches)

The Function URL invoke mode must be RESPONSE_STREAM and the LWA invoke mode
must be response_stream for SSE frames to reach the client as they are produced.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

for _layer_path in (
    "/opt/python",
    "/opt/python/lib/python3.12/site-packages",
    "/var/runtime",
):
    if os.path.isdir(_layer_path):
        sys.path.insert(0, _layer_path)

from experiences.agui import run_error, sse_event  # noqa: E402
from experiences.base import ExperienceContext  # noqa: E402
from experiences.handler import (  # noqa: E402
    _get_experience_for_conversation,
    _iter_sse,
    dynamodb,
    dynamodb_client,
    process_stream_records,
)
from experiences.registry import ExperienceRegistry  # noqa: E402

PORT = int(os.environ.get("PORT", "8080"))


class _BrainHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "BrainInCup/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[web_server] {fmt % args}", flush=True)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        self._send_json(200, {"status": "ok"})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            body = {}
        if not isinstance(body, dict):
            body = {}

        if self.path.rstrip("/") == "/events":
            self._handle_events(body)
        else:
            self._handle_stream(body)

    def _send_json(self, status: int, payload: Any) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _handle_events(self, body: dict) -> None:
        self._send_json(200, process_stream_records(body))

    def _handle_stream(self, body: dict) -> None:
        conversation_id = body.get("conversationId")
        message_id = body.get("messageId")
        owner = body.get("owner")
        user_input = body.get("content")
        if not (conversation_id and message_id and owner and user_input):
            self._send_json(
                400,
                {"error": "conversationId, messageId, owner, and content are required"},
            )
            return

        try:
            experience_id = _get_experience_for_conversation(conversation_id)
            instance = ExperienceRegistry.create_instance(
                experience_id,
                dynamodb_resource=dynamodb,
                dynamodb_client=dynamodb_client,
            )
        except ValueError as err:
            self._send_json(500, {"error": str(err)})
            return

        ctx = ExperienceContext(
            conversation_id=conversation_id,
            user_input=user_input,
            message_id=message_id,
            owner=owner,
            experience=experience_id,
        )

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        try:
            for frame in _iter_sse(instance, ctx):
                self._write_chunk(frame.encode("utf-8"))
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:  # noqa: BLE001 - keep the stream open on errors
            print(f"[web_server] stream error: {exc}", flush=True)
            self._write_chunk(sse_event(run_error(str(exc))).encode("utf-8"))
        finally:
            try:
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _write_chunk(self, chunk: bytes) -> None:
        if not chunk:
            return
        self.wfile.write(f"{len(chunk):X}\r\n".encode("ascii") + chunk + b"\r\n")
        self.wfile.flush()


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), _BrainHandler)
    print(f"[web_server] listening on {PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
