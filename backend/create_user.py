import asyncio
import sys
import os

# Add the current directory to sys.path to allow imports
sys.path.append(os.getcwd())

from app.db.session import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from sqlalchemy import select

async def create_user():
    async with AsyncSessionLocal() as db:
        username = "admin"
        email = "admin@example.com"
        password = "Admin123!"
        
        # Check if user exists
        result = await db.execute(select(User).filter((User.username == username) | (User.email == email)))
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            print(f"User {username} or {email} already exists.")
            # Update password just in case
            existing_user.hashed_password = get_password_hash(password)
            existing_user.is_active = True
            await db.commit()
            print(f"Updated password for {username} to '{password}'")
            return

        user = User(
            email=email,
            username=username,
            hashed_password=get_password_hash(password),
            full_name="Admin User",
            is_active=True,
            is_superuser=True
        )
        db.add(user)
        await db.commit()
        print(f"Created user: {username} / {password}")

if __name__ == "__main__":
    asyncio.run(create_user())
