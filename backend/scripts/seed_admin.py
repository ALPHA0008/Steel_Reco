"""Create ONE admin user who can see every site's data.

An admin has NO project_assignments row -- the RLS function
accessible_project_ids() (migration 0002) returns ALL projects when
app.user_role = 'admin', so an admin session transparently reads every
project. The admin never lands on a single-project QS dashboard; the frontend
routes them to the multi-site admin dashboard instead.

This is the only supported way to create an admin (self-service signup always
produces a QS). It connects via the migration/superuser URL because the very
first identity row can't satisfy the RLS INSERT policy on `users` when written
by the unprivileged app role -- same reasoning as seed_dev.py.

Idempotent by username: a re-run updates the existing admin's password and
name rather than creating a duplicate.

Usage:
    venv/Scripts/python.exe scripts/seed_admin.py --username admin --password 'S3cret!' [--name "Administrator"] [--email admin@myhome.example]

If --password is omitted you'll be shown an error (we never bake a default
secret into the script). --username defaults to 'admin'.
"""
from __future__ import annotations

import argparse
import asyncio
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402
from app.security import hash_password  # noqa: E402


async def seed(username: str, password: str, full_name: str, email: str) -> None:
    engine = create_async_engine(settings.migration_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        existing = (await s.execute(
            text("SELECT id FROM users WHERE username = :u"), {"u": username}
        )).scalar_one_or_none()
        pw_hash = hash_password(password)
        if existing is None:
            uid = (await s.execute(
                text("INSERT INTO users (username, email, password_hash, full_name, role, is_active) "
                     "VALUES (:u, :e, :p, :f, 'admin', true) RETURNING id"),
                {"u": username, "e": email, "p": pw_hash, "f": full_name},
            )).scalar_one()
            print(f"Created admin user '{username}' (id={uid}). Role=admin, no project assignment -> sees ALL sites.")
        else:
            await s.execute(
                text("UPDATE users SET password_hash = :p, full_name = :f, email = :e, "
                     "role = 'admin', is_active = true WHERE id = :id"),
                {"p": pw_hash, "f": full_name, "e": email, "id": existing},
            )
            # An admin must NOT have a project assignment (that would scope
            # them to one site). Clear any that exist, defensively.
            await s.execute(text("DELETE FROM project_assignments WHERE user_id = :id"), {"id": existing})
            print(f"Updated existing user '{username}' (id={existing}) -> role=admin, password reset, assignments cleared.")
        await s.commit()
    await engine.dispose()
    print("Done. Log in at /login with these credentials; you'll land on the admin dashboard.")


def main() -> None:
    p = argparse.ArgumentParser(description="Create/update the admin user.")
    p.add_argument("--username", default="admin")
    p.add_argument("--password", required=True, help="Admin password (required; no default is baked in).")
    p.add_argument("--name", default="Administrator")
    p.add_argument("--email", default=None, help="Defaults to <username>@myhome.example")
    args = p.parse_args()
    email = args.email or f"{args.username}@myhome.example"
    asyncio.run(seed(args.username, args.password, args.name, email))


if __name__ == "__main__":
    main()
