"""
StataHelpHandler: Implements the 'positron.help' comm for Stata.
Handles help topic requests and renders formatted help content in Positron's Help tab
via an embedded localhost HTTP server.
"""

import html
import http.server
import logging
import threading
import urllib.parse
from typing import Optional

from . import _positron_loader
from positron.positron_comm import PositronComm
from positron.help_comm import (
    HelpBackendMessageContent,
    ShowHelpTopicRequest,
    HelpFrontendEvent,
    ShowHelpParams,
    ShowHelpKind,
)

logger = logging.getLogger(__name__)


def _render_help_html(topic: str, content: str) -> str:
    escaped_topic = html.escape(topic)
    escaped_content = html.escape(content)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stata Help: {escaped_topic}</title>
    <style>
        :root {{
            --bg-color: #1e1e1e;
            --text-color: #d4d4d4;
            --pre-bg: #252526;
            --border-color: #3c3c3c;
            --header-color: #569cd6;
            --badge-bg: #2d2d2d;
            --sub-color: #858585;
            --code-font: "JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, Monaco, Consolas, "Courier New", monospace;
        }}
        @media (prefers-color-scheme: light) {{
            :root {{
                --bg-color: #ffffff;
                --text-color: #24292e;
                --pre-bg: #f6f8fa;
                --border-color: #e1e4e8;
                --header-color: #0366d6;
                --badge-bg: #e1e4e8;
                --sub-color: #6a737d;
            }}
        }}
        body {{
            margin: 0;
            padding: 16px 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            line-height: 1.5;
        }}
        .header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 10px;
            margin-bottom: 16px;
        }}
        .header h1 {{
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--header-color);
        }}
        .header h1 code {{
            font-family: var(--code-font);
            font-size: 16px;
        }}
        .header .badge {{
            font-size: 11px;
            font-weight: 500;
            color: var(--sub-color);
            background: var(--badge-bg);
            border: 1px solid var(--border-color);
            padding: 3px 9px;
            border-radius: 12px;
            letter-spacing: 0.3px;
        }}
        pre {{
            font-family: var(--code-font);
            font-size: 12.5px;
            line-height: 1.45;
            background: var(--pre-bg);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 14px 16px;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-word;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Stata Help: <code>{escaped_topic}</code></h1>
        <span class="badge">Stata 19 MP</span>
    </div>
    <pre>{escaped_content}</pre>
    <script>
        if (window.parent) {{
            window.parent.postMessage({{ id: "positron-help-complete" }}, "*");
        }}
    </script>
</body>
</html>"""


class _HelpHTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, server_address, handler_cls, help_handler):
        self.help_handler = help_handler
        super().__init__(server_address, handler_cls)


class _HelpHTTPRequestHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        topic = params.get("topic", [""])[0]
        if not topic and parsed.path.startswith("/help/"):
            topic = parsed.path[len("/help/"):]

        if not topic:
            topic = "help"

        try:
            res = self.server.help_handler.kernel.engine.execute(f"help {topic}")
            content = res.stdout or res.error or f"No Stata help found for topic: {topic}"
        except Exception as e:
            content = f"Error retrieving help for '{topic}': {e}"

        html_body = _render_help_html(topic, content).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html_body)))
        self.end_headers()
        self.wfile.write(html_body)

    def log_message(self, format, *args):
        # Silence access logs to keep stderr clean
        pass


class StataHelpHandler:
    def __init__(self, kernel):
        self.kernel = kernel
        self._comm: Optional[PositronComm] = None
        self._server: Optional[_HelpHTTPServer] = None
        self._port: int = 0
        self._start_server()

    def _start_server(self):
        try:
            self._server = _HelpHTTPServer(("127.0.0.1", 0), _HelpHTTPRequestHandler, self)
            self._port = self._server.server_port
            thread = threading.Thread(target=self._server.serve_forever, daemon=True)
            thread.start()
            logger.info("Stata Help HTTP server listening on http://127.0.0.1:%d", self._port)
        except Exception as e:
            logger.exception("Failed to start Stata Help HTTP server: %s", e)

    def on_comm_open(self, base_comm, _msg):
        self._comm = PositronComm(base_comm)
        self._comm.on_msg(self.handle_msg, HelpBackendMessageContent)
        logger.info("positron.help comm opened successfully")

    def handle_msg(self, msg, _raw_msg):
        request = msg.content.data
        if isinstance(request, ShowHelpTopicRequest):
            topic = request.params.topic
            if self._comm is not None:
                self._comm.send_result(data=True)
            self.show_help(topic)
        else:
            logger.warning("Unhandled help request: %s", request)

    def show_help(self, topic: str):
        if not topic:
            return
        if self._comm is None:
            logger.warning("positron.help comm is not open; cannot send show_help event")
            return
        try:
            url = f"http://127.0.0.1:{self._port}/help?topic={urllib.parse.quote(topic)}"
            event = ShowHelpParams(
                content=url,
                kind=ShowHelpKind.Url,
                focus=True,
            )
            self._comm.send_event(name=HelpFrontendEvent.ShowHelp.value, payload=event.dict())
        except Exception as e:
            logger.exception("Error displaying Stata help for %s: %s", topic, e)

    def shutdown(self):
        if self._server:
            try:
                self._server.shutdown()
            except Exception:
                pass
