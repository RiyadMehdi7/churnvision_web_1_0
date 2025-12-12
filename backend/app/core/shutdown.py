"""
Graceful shutdown handling for ChurnVision Enterprise.
Ensures in-flight requests complete and resources are properly released.
"""

import asyncio
import logging
import signal
from contextlib import asynccontextmanager
from typing import Callable, Optional, Set

logger = logging.getLogger("churnvision.shutdown")


class GracefulShutdownManager:
    """
    Manages graceful shutdown of the application.

    Features:
    - Tracks in-flight requests
    - Waits for pending operations to complete
    - Releases database connections
    - Stops background tasks
    """

    def __init__(self, timeout: int = 30):
        self._shutdown_requested = False
        self._timeout = timeout
        self._pending_tasks: Set[asyncio.Task] = set()
        self._shutdown_callbacks: list[Callable] = []
        self._request_count = 0
        self._lock = asyncio.Lock()

    @property
    def shutdown_requested(self) -> bool:
        """Check if shutdown has been requested."""
        return self._shutdown_requested

    async def increment_requests(self) -> None:
        """Track a new in-flight request."""
        async with self._lock:
            self._request_count += 1

    async def decrement_requests(self) -> None:
        """Mark a request as complete."""
        async with self._lock:
            self._request_count -= 1

    @property
    def pending_requests(self) -> int:
        """Get the number of pending requests."""
        return self._request_count

    def add_shutdown_callback(self, callback: Callable) -> None:
        """Register a callback to run during shutdown."""
        self._shutdown_callbacks.append(callback)

    def track_task(self, task: asyncio.Task) -> None:
        """Track a background task for graceful shutdown."""
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)

    async def shutdown(self) -> None:
        """
        Perform graceful shutdown.
        Waits for in-flight requests and runs cleanup callbacks.
        """
        if self._shutdown_requested:
            return

        self._shutdown_requested = True
        logger.info("Graceful shutdown initiated...")

        # Wait for in-flight requests with timeout
        start_time = asyncio.get_event_loop().time()
        while self._request_count > 0:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > self._timeout:
                logger.warning(
                    f"Shutdown timeout reached with {self._request_count} pending requests"
                )
                break
            logger.info(f"Waiting for {self._request_count} pending requests...")
            await asyncio.sleep(0.5)

        # Cancel remaining background tasks
        if self._pending_tasks:
            logger.info(f"Cancelling {len(self._pending_tasks)} background tasks...")
            for task in self._pending_tasks:
                task.cancel()

            # Wait for tasks to complete cancellation
            await asyncio.gather(*self._pending_tasks, return_exceptions=True)

        # Run shutdown callbacks
        logger.info(f"Running {len(self._shutdown_callbacks)} shutdown callbacks...")
        for callback in self._shutdown_callbacks:
            try:
                result = callback()
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.error(f"Error in shutdown callback: {e}")

        logger.info("Graceful shutdown complete")


# Global shutdown manager instance
_shutdown_manager: Optional[GracefulShutdownManager] = None


def get_shutdown_manager() -> GracefulShutdownManager:
    """Get the global shutdown manager instance."""
    global _shutdown_manager
    if _shutdown_manager is None:
        _shutdown_manager = GracefulShutdownManager()
    return _shutdown_manager


def setup_signal_handlers(loop: asyncio.AbstractEventLoop) -> None:
    """
    Set up signal handlers for graceful shutdown.
    Handles SIGTERM (Docker/Kubernetes) and SIGINT (Ctrl+C).
    """
    shutdown_manager = get_shutdown_manager()

    def signal_handler(sig: signal.Signals) -> None:
        logger.info(f"Received signal {sig.name}")
        asyncio.create_task(shutdown_manager.shutdown())

    # Register signal handlers
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, lambda s=sig: signal_handler(s))
            logger.debug(f"Registered handler for {sig.name}")
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            signal.signal(sig, lambda s, f, sig=sig: signal_handler(sig))
            logger.debug(f"Registered fallback handler for {sig.name}")


@asynccontextmanager
async def lifespan_manager(app):
    """
    FastAPI lifespan context manager for startup/shutdown.

    Usage:
        app = FastAPI(lifespan=lifespan_manager)
    """
    from app.db.session import engine

    logger.info("Application starting up...")
    shutdown_manager = get_shutdown_manager()

    # Setup signal handlers
    try:
        loop = asyncio.get_running_loop()
        setup_signal_handlers(loop)
    except Exception as e:
        logger.warning(f"Could not setup signal handlers: {e}")

    # Register database cleanup callback
    async def cleanup_database():
        logger.info("Closing database connections...")
        await engine.dispose()
        logger.info("Database connections closed")

    shutdown_manager.add_shutdown_callback(cleanup_database)

    logger.info("Application startup complete")

    try:
        yield
    finally:
        logger.info("Application shutting down...")
        await shutdown_manager.shutdown()


class RequestTrackingMiddleware:
    """
    Middleware that tracks in-flight requests for graceful shutdown.
    """

    def __init__(self, app):
        self.app = app
        self.shutdown_manager = get_shutdown_manager()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Check if shutdown is in progress
        if self.shutdown_manager.shutdown_requested:
            # Return 503 Service Unavailable for new requests during shutdown
            response = {
                "type": "http.response.start",
                "status": 503,
                "headers": [
                    [b"content-type", b"application/json"],
                    [b"connection", b"close"],
                ],
            }
            await send(response)
            await send({
                "type": "http.response.body",
                "body": b'{"error": "Service is shutting down", "retry_after": 5}',
            })
            return

        # Track this request
        await self.shutdown_manager.increment_requests()
        try:
            await self.app(scope, receive, send)
        finally:
            await self.shutdown_manager.decrement_requests()
