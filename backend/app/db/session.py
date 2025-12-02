from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings

# Production-ready connection pooling configuration
# - pool_size: Number of persistent connections to maintain
# - max_overflow: Additional connections allowed beyond pool_size under load
# - pool_pre_ping: Verify connections are alive before use (prevents stale connections)
# - pool_recycle: Recycle connections after 1 hour to prevent DB-side timeouts
# - pool_timeout: Wait up to 30s for a connection before raising an error
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.SQLALCHEMY_ECHO or settings.DEBUG,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_timeout=30,
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def check_db_connection() -> bool:
    """
    Verify database connectivity. Used by health checks.
    Returns True if connection is successful, False otherwise.
    """
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
