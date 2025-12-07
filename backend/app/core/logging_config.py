"""
Centralized structured logging configuration for ChurnVision Enterprise.
Provides JSON-formatted logs for production and human-readable logs for development.
"""

import json
import logging
import sys
import traceback
from datetime import datetime
from typing import Any, Optional
import uuid

from app.core.config import settings


class JSONFormatter(logging.Formatter):
    """
    JSON formatter for structured logging.
    Outputs logs in a format easily parsed by log aggregators (ELK, Loki, CloudWatch).
    """

    def __init__(self, service_name: str = "churnvision-backend"):
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": self.service_name,
            "environment": settings.ENVIRONMENT,
        }

        # Add source location
        log_data["source"] = {
            "file": record.filename,
            "line": record.lineno,
            "function": record.funcName,
        }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": traceback.format_exception(*record.exc_info),
            }

        # Add extra fields passed to the logger
        extra_fields = {}
        for key, value in record.__dict__.items():
            if key not in [
                "name", "msg", "args", "created", "filename", "funcName",
                "levelname", "levelno", "lineno", "module", "msecs",
                "pathname", "process", "processName", "relativeCreated",
                "stack_info", "exc_info", "exc_text", "thread", "threadName",
                "message", "taskName"
            ]:
                extra_fields[key] = value

        if extra_fields:
            log_data["extra"] = extra_fields

        return json.dumps(log_data, default=str)


class ColoredFormatter(logging.Formatter):
    """
    Colored formatter for development console output.
    Makes logs easier to read during development.
    """

    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        timestamp = datetime.fromtimestamp(record.created).strftime("%Y-%m-%d %H:%M:%S")

        # Format the message
        message = f"{color}{timestamp} | {record.levelname:8} | {record.name} | {record.getMessage()}{self.RESET}"

        # Add exception if present
        if record.exc_info:
            message += f"\n{color}{traceback.format_exception(*record.exc_info)[-1].strip()}{self.RESET}"

        return message


class ContextLogger:
    """
    Logger wrapper that adds contextual information to all log messages.
    Useful for adding request IDs, user IDs, etc. to logs.
    """

    def __init__(self, logger: logging.Logger):
        self._logger = logger
        self._context: dict[str, Any] = {}

    def set_context(self, **kwargs) -> None:
        """Set context values that will be included in all subsequent logs."""
        self._context.update(kwargs)

    def clear_context(self) -> None:
        """Clear all context values."""
        self._context.clear()

    def _log_with_context(self, level: int, msg: str, *args, **kwargs) -> None:
        """Log a message with context included as extra data."""
        extra = kwargs.pop("extra", {})
        extra.update(self._context)
        self._logger.log(level, msg, *args, extra=extra, **kwargs)

    def debug(self, msg: str, *args, **kwargs) -> None:
        self._log_with_context(logging.DEBUG, msg, *args, **kwargs)

    def info(self, msg: str, *args, **kwargs) -> None:
        self._log_with_context(logging.INFO, msg, *args, **kwargs)

    def warning(self, msg: str, *args, **kwargs) -> None:
        self._log_with_context(logging.WARNING, msg, *args, **kwargs)

    def error(self, msg: str, *args, **kwargs) -> None:
        self._log_with_context(logging.ERROR, msg, *args, **kwargs)

    def critical(self, msg: str, *args, **kwargs) -> None:
        self._log_with_context(logging.CRITICAL, msg, *args, **kwargs)

    def exception(self, msg: str, *args, **kwargs) -> None:
        kwargs["exc_info"] = True
        self._log_with_context(logging.ERROR, msg, *args, **kwargs)


def setup_logging(
    service_name: str = "churnvision-backend",
    log_level: Optional[str] = None,
    json_logs: Optional[bool] = None,
) -> None:
    """
    Configure application logging.

    Args:
        service_name: Name of the service for log identification
        log_level: Override log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_logs: Override JSON logging (True for production, False for development)
    """
    # Determine settings
    level = log_level or ("DEBUG" if settings.DEBUG else "INFO")
    use_json = json_logs if json_logs is not None else (settings.ENVIRONMENT.lower() == "production")

    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level))

    # Remove existing handlers
    root_logger.handlers.clear()

    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, level))

    # Set formatter based on environment
    if use_json:
        console_handler.setFormatter(JSONFormatter(service_name))
    else:
        console_handler.setFormatter(ColoredFormatter())

    root_logger.addHandler(console_handler)

    # Configure specific loggers
    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("chromadb").setLevel(logging.WARNING)
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)

    # Log configuration
    logger = logging.getLogger("churnvision.logging")
    logger.info(
        f"Logging configured: level={level}, format={'JSON' if use_json else 'colored'}, "
        f"environment={settings.ENVIRONMENT}"
    )


def get_logger(name: str) -> ContextLogger:
    """
    Get a context-aware logger for a module.

    Usage:
        logger = get_logger(__name__)
        logger.set_context(request_id="abc123", user_id=42)
        logger.info("Processing request")  # Includes context automatically
    """
    return ContextLogger(logging.getLogger(name))


# Request ID middleware support
def generate_request_id() -> str:
    """Generate a unique request ID for tracing."""
    return str(uuid.uuid4())[:8]


class RequestLoggingMiddleware:
    """
    Middleware that adds request logging with timing and request IDs.
    """

    def __init__(self, app):
        self.app = app
        self.logger = get_logger("churnvision.http")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = generate_request_id()
        start_time = datetime.utcnow()

        # Add request ID to scope for access in request handlers
        scope["state"] = scope.get("state", {})
        scope["state"]["request_id"] = request_id

        # Track response status
        response_status = 0

        async def send_wrapper(message):
            nonlocal response_status
            if message["type"] == "http.response.start":
                response_status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as e:
            response_status = 500
            raise
        finally:
            # Calculate duration
            duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000

            # Get request details
            method = scope.get("method", "UNKNOWN")
            path = scope.get("path", "/")

            # Skip logging for health checks and metrics
            if path not in ["/health", "/metrics"]:
                log_level = logging.WARNING if response_status >= 400 else logging.INFO
                self.logger._logger.log(
                    log_level,
                    f"{method} {path} {response_status} {duration_ms:.1f}ms",
                    extra={
                        "request_id": request_id,
                        "method": method,
                        "path": path,
                        "status": response_status,
                        "duration_ms": duration_ms,
                    }
                )
