import asyncio
import os

from dotenv import load_dotenv
from supabase import create_async_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL or SUPABASE_KEY not set in .env")
    exit(1)


async def get_token(email, password):
    client = await create_async_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        res = await client.auth.sign_in_with_password(
            {"email": email, "password": password}
        )
        if res.session:
            print(f"\nAccess Token:\n{res.session.access_token}\n")
            print(
                f'Curl Command:\ncurl -X GET http://localhost:8000/api/v1/users/me -H "Authorization: Bearer {res.session.access_token}"'
            )
        else:
            print("Failed to get session.")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        print("Usage: python get_token.py <email> <password>")
    else:
        asyncio.run(get_token(sys.argv[1], sys.argv[2]))
