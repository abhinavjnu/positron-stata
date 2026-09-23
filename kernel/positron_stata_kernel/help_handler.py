"""
StataHelpHandler: Implements the 'positron.help' comm for Stata.
Handles help topic requests and renders help content in Positron's Help tab.
"""

import logging
import sys
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


class StataHelpHandler:
    def __init__(self, kernel):
        self.kernel = kernel
        self._comm: Optional[PositronComm] = None

    def on_comm_open(self, base_comm, _msg):
        self._comm = PositronComm(base_comm)
        self._comm.on_msg(self.handle_msg, HelpBackendMessageContent)

    def handle_msg(self, msg, _raw_msg):
        request = msg.content.data
        if isinstance(request, ShowHelpTopicRequest):
            topic = request.params.topic
            if self._comm is not None:
                self._comm.send_result(data=True)
            self.show_help(topic)
        else:
            logger.warning(f"Unhandled help request: {request}")

    def show_help(self, topic: str):
        if not topic:
            return
        try:
            res = self.kernel.engine.execute(f"help {topic}")
            content = res.stdout if res.stdout else f"No Stata help found for topic: {topic}"
            markdown = f"## Stata Help: `{topic}`\n\n```stata\n{content}\n```"
            if self._comm is not None:
                event = ShowHelpParams(
                    content=markdown,
                    kind=ShowHelpKind.Markdown,
                    focus=True,
                )
                self._comm.send_event(HelpFrontendEvent.ShowHelp, event.dict())
        except Exception as e:
            logger.exception("Error displaying Stata help for %s: %s", topic, e)
