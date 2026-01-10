import argparse
import asyncio
import os
import sys
from getpass import getpass

from sqlalchemy import select

# Add the current directory to sys.path to allow imports
sys.path.append(os.getcwd())

from app.db.session import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User


def _resolve_password(args: argparse.Namespace) -> str:
    password = args.password or os.getenv("CHURNVISION_ADMIN_PASSWORD")
    if password:
        return password
    if sys.stdin.isatty():
        first = getpass("Admin password: ")
        if not first:
            raise ValueError("Password cannot be empty.")
        confirm = getpass("Confirm password: ")
        if first != confirm:
            raise ValueError("Passwords do not match.")
        return first
    raise ValueError(
        "Password required. Use --password or set CHURNVISION_ADMIN_PASSWORD."
    )


async def create_user(username: str, email: str, password: str, is_superuser: bool) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).filter((User.username == username) | (User.email == email))
        )
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print(f"User {username} or {email} already exists.")
            existing_user.hashed_password = get_password_hash(password)
            existing_user.is_active = True
            existing_user.is_superuser = is_superuser
            await db.commit()
            print("Updated existing user credentials.")
            return

        user = User(
            email=email,
            username=username,
            hashed_password=get_password_hash(password),
            full_name="Admin User",
            is_active=True,
            is_superuser=is_superuser
        )
        db.add(user)
        await db.commit()
        print(f"Created user: {username}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update a user.")
    parser.add_argument("--username", default="admin", help="Username to create")
    parser.add_argument("--email", default="admin@example.com", help="Email address")
    parser.add_argument("--password", help="User password (or CHURNVISION_ADMIN_PASSWORD)")
    parser.add_argument(
        "--superuser",
        action="store_true",
        default=True,
        help="Grant superuser privileges (default: true)",
    )
    parser.add_argument(
        "--no-superuser",
        dest="superuser",
        action="store_false",
        help="Create as a regular user",
    )

    args = parser.parse_args()
    try:
        password = _resolve_password(args)
    except ValueError as exc:
        print(str(exc))
        sys.exit(1)

    asyncio.run(create_user(args.username, args.email, password, args.superuser))


if __name__ == "__main__":
    main()
