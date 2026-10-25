import logging
import sys
import warnings

from django.core.management.base import BaseCommand


def _write_warning_to_stderr(message, category, filename, lineno, file=None, line=None):
    sys.stderr.write(warnings.formatwarning(message, category, filename, lineno, line))


class Command(BaseCommand):
    help = 'Serve the SaxoDash MCP tools over stdio.'

    def handle(self, *args, **options):
        warnings.showwarning = _write_warning_to_stderr
        for handler in logging.getLogger().handlers:
            if isinstance(handler, logging.StreamHandler) and handler.stream is sys.stdout:
                handler.setStream(sys.stderr)

        from mcp_server.server import build_server

        build_server().run(transport='stdio')
