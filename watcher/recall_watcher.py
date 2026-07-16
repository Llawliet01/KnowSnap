import os
import sys
import time
import requests
import subprocess
from pathlib import Path
from datetime import datetime

# --- CONFIGURATION ---
# Replace with your deployed endpoint, Supabase URL, and Anon Key
BACKEND_UPLOAD_URL = "https://patelyug01234--recall-fastapi-app.modal.run/api/upload-file"
SUPABASE_URL = "https://avkwaxjnydfxlnavhiis.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2a3dheGpueWRmeGxuYXZoaWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NDc5NTAsImV4cCI6MjA5OTQyMzk1MH0.R9G3WD64REk1soBuuolPZXn4IAPs3k20wL_FEjz4rFI"

# Enter your Recall AI login credentials here
EMAIL = "your_email@example.com"
PASSWORD = "your_password"

# Resolve Windows Screenshots folder path
user_profile = os.environ.get("USERPROFILE")
if not user_profile:
    print("Error: Could not resolve USERPROFILE environment variable.")
    sys.exit(1)

SCREENSHOTS_DIR = os.path.join(user_profile, "Pictures", "Screenshots")

# Global auth cache
token_cache = {
    "access_token": None,
    "expires_at": 0
}

def get_auth_token():
    """Sign in to Supabase Auth using email/password and retrieve the JWT token."""
    now = time.time()
    # Return cached token if valid (leave 5 minutes buffer)
    if token_cache["access_token"] and token_cache["expires_at"] > now + 300:
        return token_cache["access_token"]

    print("Authenticating with Supabase Auth...")
    try:
        url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/token?grant_type=password"
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        }
        payload = {
            "email": EMAIL,
            "password": PASSWORD
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        token_cache["access_token"] = data["access_token"]
        token_cache["expires_at"] = now + int(data.get("expires_in", 3600))
        print("Authentication successful!")
        return token_cache["access_token"]
    except Exception as e:
        print(f"Authentication failed: {e}")
        return None

def trigger_notification(title, message):
    """Trigger a native Windows toast notification balloon using inline PowerShell."""
    ps_command = f"""
    [void] [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms");
    $objNotifyIcon = New-Object System.Windows.Forms.NotifyIcon;
    $objNotifyIcon.Icon = [System.Drawing.SystemIcons]::Information;
    $objNotifyIcon.BalloonTipIcon = "Info";
    $objNotifyIcon.BalloonTipTitle = "{title}";
    $objNotifyIcon.BalloonTipText = "{message}";
    $objNotifyIcon.Visible = $True;
    $objNotifyIcon.ShowBalloonTip(4000);
    """
    try:
        subprocess.run(["powershell", "-Command", ps_command], capture_output=True)
    except Exception as e:
        print(f"Failed to show toast notification: {e}")

def upload_screenshot(file_path):
    """Upload screenshot to Recall AI backend with Bearer token authentication."""
    print(f"New screenshot detected: {file_path}")
    
    # 1. Get verified auth token
    token = get_auth_token()
    if not token:
        print("Skipping upload due to authentication failure.")
        trigger_notification("Recall AI: Upload Failed", "Could not authenticate your session.")
        return

    # 2. Upload file to backend
    print("Uploading to Recall AI backend...")
    try:
        headers = {
            "Authorization": f"Bearer {token}"
        }
        with open(file_path, "rb") as f:
            files = {
                "file": (os.path.basename(file_path), f, "image/png")
            }
            resp = requests.post(BACKEND_UPLOAD_URL, headers=headers, files=files, timeout=30)
            
        if resp.status_code == 200:
            data = resp.json()
            title = data.get("metadata", {}).get("title", "Screenshot")
            print(f"Upload successful! Indexed item: {title}")
            trigger_notification(
                "Recall AI: Screenshot Indexed! 🚀",
                f"Successfully parsed and indexed: {title}"
            )
        else:
            print(f"Upload endpoint failed with status {resp.status_code}: {resp.text}")
            trigger_notification("Recall AI: Upload Error", f"Server responded with error status {resp.status_code}.")
    except Exception as e:
        print(f"Network error during upload: {e}")
        trigger_notification("Recall AI: Upload Error", "Network or server failure occurred.")

def watch_folder():
    """Poll the Screenshots directory for newly created image assets."""
    print(f"Watching directory: {SCREENSHOTS_DIR}")
    print("Press Ctrl+C to exit.")
    
    # Pre-populate list of existing files so we don't upload old screenshots
    if not os.path.exists(SCREENSHOTS_DIR):
        print(f"Creating screenshots directory as it does not exist: {SCREENSHOTS_DIR}")
        os.makedirs(SCREENSHOTS_DIR)

    existing_files = set(os.listdir(SCREENSHOTS_DIR))
    
    # Initial authentication verification on start
    get_auth_token()

    while True:
        try:
            time.sleep(1)  # scan folder contents every second
            current_files = set(os.listdir(SCREENSHOTS_DIR))
            new_files = current_files - existing_files
            
            for file_name in new_files:
                # Watch for PNG and JPG file extensions
                if file_name.lower().endswith(('.png', '.jpg', '.jpeg')):
                    file_path = os.path.join(SCREENSHOTS_DIR, file_name)
                    
                    # Wait briefly to ensure file writing is completely finalized by Windows
                    time.sleep(0.5)
                    upload_screenshot(file_path)
                    
            existing_files = current_files
        except KeyboardInterrupt:
            print("\nExiting watcher.")
            break
        except Exception as e:
            print(f"Watcher loop error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    if EMAIL == "your_email@example.com" or PASSWORD == "your_password":
        print("ERROR: Please configure your EMAIL and PASSWORD inside the script first!")
        sys.exit(1)
    watch_folder()
