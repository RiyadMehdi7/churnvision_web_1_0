"""
Shared test fixtures and configuration for ChurnVision backend tests.
"""
import asyncio
import os
from datetime import datetime, timedelta
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Set test environment before importing app modules
os.environ["ENVIRONMENT"] = "development"
os.environ["DEBUG"] = "true"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_settings(monkeypatch):
    """Mock settings for testing."""
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-testing-only-min-32-chars")
    monkeypatch.setenv("LICENSE_SECRET_KEY", "test-license-secret-key")
    monkeypatch.setenv("LICENSE_KEY", "dev-license-key")
    monkeypatch.setenv("POSTGRES_PASSWORD", "testpassword")
    monkeypatch.setenv("POSTGRES_USER", "testuser")
    monkeypatch.setenv("POSTGRES_DB", "testdb")


@pytest.fixture
def mock_db_session():
    """Create a mock async database session."""
    session = AsyncMock(spec=AsyncSession)
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.refresh = AsyncMock()
    session.add = MagicMock()
    session.delete = AsyncMock()
    session.close = AsyncMock()
    return session


@pytest.fixture
def mock_user():
    """Create a mock user for testing."""
    user = MagicMock()
    user.id = 1
    user.email = "test@example.com"
    user.username = "testuser"
    user.hashed_password = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.F/S.Z5.S5.S5.S"  # bcrypt hash
    user.is_active = True
    user.is_superuser = False
    user.tenant_id = "test-tenant"
    user.created_at = datetime.utcnow()
    user.updated_at = datetime.utcnow()
    user.last_login = None
    return user


@pytest.fixture
def mock_superuser(mock_user):
    """Create a mock superuser for testing."""
    mock_user.is_superuser = True
    return mock_user


@pytest.fixture
def mock_inactive_user(mock_user):
    """Create a mock inactive user for testing."""
    mock_user.is_active = False
    return mock_user


@pytest.fixture
def sample_employee_features():
    """Sample employee features for churn prediction testing."""
    return {
        "satisfaction_level": 0.4,
        "last_evaluation": 0.5,
        "number_project": 3,
        "average_monthly_hours": 180,
        "time_spend_company": 3,
        "work_accident": False,
        "promotion_last_5years": False,
        "department": "sales",
        "salary_level": "low",
    }


@pytest.fixture
def sample_high_risk_features():
    """Sample features for a high-risk employee."""
    return {
        "satisfaction_level": 0.1,
        "last_evaluation": 0.3,
        "number_project": 7,
        "average_monthly_hours": 280,
        "time_spend_company": 5,
        "work_accident": False,
        "promotion_last_5years": False,
        "department": "sales",
        "salary_level": "low",
    }


@pytest.fixture
def sample_low_risk_features():
    """Sample features for a low-risk employee."""
    return {
        "satisfaction_level": 0.9,
        "last_evaluation": 0.85,
        "number_project": 4,
        "average_monthly_hours": 160,
        "time_spend_company": 2,
        "work_accident": False,
        "promotion_last_5years": True,
        "department": "IT",
        "salary_level": "high",
    }


@pytest.fixture
def sample_training_data():
    """Sample training data for model training tests."""
    import pandas as pd

    return pd.DataFrame([
        {
            "satisfaction_level": 0.2,
            "last_evaluation": 0.4,
            "number_project": 2,
            "average_monthly_hours": 160,
            "time_spend_company": 3,
            "work_accident": 0,
            "promotion_last_5years": 0,
            "department": "sales",
            "salary_level": "low",
            "left": 1,
        },
        {
            "satisfaction_level": 0.8,
            "last_evaluation": 0.9,
            "number_project": 4,
            "average_monthly_hours": 180,
            "time_spend_company": 2,
            "work_accident": 0,
            "promotion_last_5years": 1,
            "department": "support",
            "salary_level": "medium",
            "left": 0,
        },
        {
            "satisfaction_level": 0.6,
            "last_evaluation": 0.55,
            "number_project": 3,
            "average_monthly_hours": 170,
            "time_spend_company": 4,
            "work_accident": 0,
            "promotion_last_5years": 0,
            "department": "IT",
            "salary_level": "high",
            "left": 0,
        },
        {
            "satisfaction_level": 0.3,
            "last_evaluation": 0.45,
            "number_project": 5,
            "average_monthly_hours": 210,
            "time_spend_company": 6,
            "work_accident": 1,
            "promotion_last_5years": 0,
            "department": "sales",
            "salary_level": "low",
            "left": 1,
        },
        {
            "satisfaction_level": 0.9,
            "last_evaluation": 0.95,
            "number_project": 4,
            "average_monthly_hours": 150,
            "time_spend_company": 3,
            "work_accident": 0,
            "promotion_last_5years": 1,
            "department": "IT",
            "salary_level": "high",
            "left": 0,
        },
        {
            "satisfaction_level": 0.15,
            "last_evaluation": 0.35,
            "number_project": 6,
            "average_monthly_hours": 250,
            "time_spend_company": 4,
            "work_accident": 0,
            "promotion_last_5years": 0,
            "department": "support",
            "salary_level": "low",
            "left": 1,
        },
    ])


@pytest.fixture
def valid_jwt_token():
    """Generate a valid JWT token for testing."""
    from app.core.security import create_access_token
    return create_access_token(subject="1", expires_delta=timedelta(hours=1))


@pytest.fixture
def expired_jwt_token():
    """Generate an expired JWT token for testing."""
    from app.core.security import create_access_token
    return create_access_token(subject="1", expires_delta=timedelta(seconds=-1))


@pytest.fixture
def mock_request():
    """Create a mock FastAPI request object."""
    request = MagicMock()
    request.cookies = {}
    request.client = MagicMock()
    request.client.host = "127.0.0.1"
    request.headers = {}
    request.url = MagicMock()
    request.url.path = "/api/v1/test"
    request.method = "GET"
    return request


@pytest.fixture
def mock_audit_logger():
    """Create a mock audit logger."""
    logger = AsyncMock()
    logger.log = AsyncMock()
    logger.log_prediction = AsyncMock()
    logger.log_model_training = AsyncMock()
    logger.log_data_upload = AsyncMock()
    logger.log_error = AsyncMock()
    return logger


# Test data generators
def generate_test_users(count: int = 5):
    """Generate multiple test users."""
    users = []
    for i in range(count):
        user = MagicMock()
        user.id = i + 1
        user.email = f"user{i+1}@example.com"
        user.username = f"user{i+1}"
        user.is_active = True
        user.is_superuser = i == 0
        user.tenant_id = "test-tenant"
        users.append(user)
    return users


def generate_training_data_large(rows: int = 100):
    """Generate large training dataset for performance tests."""
    import pandas as pd
    import random

    data = []
    departments = ["sales", "support", "IT", "marketing", "hr", "finance"]
    salaries = ["low", "medium", "high"]

    for _ in range(rows):
        left = random.choice([0, 1])
        # Simulate realistic correlations
        if left:
            satisfaction = random.uniform(0.1, 0.5)
            hours = random.randint(180, 280)
        else:
            satisfaction = random.uniform(0.5, 1.0)
            hours = random.randint(140, 200)

        data.append({
            "satisfaction_level": satisfaction,
            "last_evaluation": random.uniform(0.3, 1.0),
            "number_project": random.randint(2, 7),
            "average_monthly_hours": hours,
            "time_spend_company": random.randint(1, 10),
            "work_accident": random.randint(0, 1),
            "promotion_last_5years": random.randint(0, 1),
            "department": random.choice(departments),
            "salary_level": random.choice(salaries),
            "left": left,
        })

    return pd.DataFrame(data)
