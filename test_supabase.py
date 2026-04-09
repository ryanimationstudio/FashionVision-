import os
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Missing URL or KEY")
    sys.exit(1)

supabase = create_client(url, key)

try:
    print("\n--- UPLOAD TEST ---")
    res = supabase.storage.from_("fashion-images").upload(
        "test_ping.jpg",
        b"dummy image content",
        file_options={"content-type": "image/jpeg", "upsert": "true"}
    )
    print("Upload succeeded:", res)
except Exception as e:
    print("Upload failed:", e)
