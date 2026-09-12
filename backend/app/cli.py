"""Operator-only provisioning: python -m app.cli email@example.org"""
import argparse
import getpass
from pydantic import TypeAdapter, EmailStr
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.models import User

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    args = parser.parse_args()
    email = str(TypeAdapter(EmailStr).validate_python(args.email)).lower()
    password = getpass.getpass("New administrator password (minimum 14 characters): ")
    if len(password) < 14 or password != getpass.getpass("Confirm password: "):
        raise SystemExit("Password too short or confirmation mismatch")
    with SessionLocal() as db:
        if db.query(User).filter(User.email == email).first():
            raise SystemExit("User already exists; no change made")
        db.add(User(email=email, full_name="Super Admin", role="super_admin", tenant_id=None, password_hash=hash_password(password)))
        db.commit()
    print("Administrator created")

if __name__ == "__main__":
    main()
