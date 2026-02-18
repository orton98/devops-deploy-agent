#!/usr/bin/env python3
"""
DevOps Deploy Agent — Production Setup Script
==============================================
One-command setup: builds Docker images, starts the stack,
waits for n8n to be ready, then auto-creates the workflow.

Usage:
    python scripts/setup_production.py

Requirements:
    - Docker Desktop running
    - .env.production filled in with your tokens
    - N8N_API_KEY set in .env.production (after first n8n login)
"""

import subprocess
import urllib.request
import urllib.error
import json
import os
import sys
import time
import shutil
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.parent
ENV_FILE = PROJECT_ROOT / ".env.production"

N8N_URL = "http://localhost/n8n"
APP_URL = "http://localhost"


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_env(path: Path) -> dict:
    """Load key=value pairs from an env file."""
    env = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, _, val = line.partition('=')
            env[key.strip()] = val.strip()
    return env


def run(cmd: list, check=True, capture=False) -> subprocess.CompletedProcess:
    """Run a shell command."""
    print(f"  $ {' '.join(cmd)}")
    return subprocess.run(
        cmd,
        check=check,
        capture_output=capture,
        text=True,
        cwd=str(PROJECT_ROOT)
    )


def wait_for_url(url: str, label: str, timeout: int = 120, interval: int = 5) -> bool:
    """Poll a URL until it responds 200 or timeout."""
    print(f"  ⏳ Waiting for {label} to be ready at {url}...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status < 500:
                    print(f"  ✅ {label} is ready! ({int(time.time() - start)}s)")
                    return True
        except Exception:
            pass
        time.sleep(interval)
        elapsed = int(time.time() - start)
        print(f"     Still waiting... ({elapsed}s / {timeout}s)")
    print(f"  ❌ {label} did not become ready within {timeout}s")
    return False


def check_docker() -> bool:
    """Check if Docker is running."""
    try:
        result = run(["docker", "info"], check=False, capture=True)
        return result.returncode == 0
    except FileNotFoundError:
        return False


def n8n_api(path: str, method: str = "GET", data: dict = None, api_key: str = "") -> dict:
    """Make an authenticated request to the n8n API."""
    url = f"http://localhost/n8n/api/v1{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "X-N8N-API-KEY": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        method=method
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("  🚀 DevOps Deploy Agent — Production Setup")
    print("=" * 65)

    # ── Step 1: Check prerequisites ──────────────────────────────────
    print("\n[1/6] Checking prerequisites...")

    if not check_docker():
        print("  ❌ Docker is not running!")
        print("     Please start Docker Desktop and try again.")
        sys.exit(1)
    print("  ✅ Docker is running")

    if not ENV_FILE.exists():
        print(f"  ❌ Missing {ENV_FILE}")
        print("     Copy .env.example to .env.production and fill in your tokens.")
        sys.exit(1)
    print(f"  ✅ Found {ENV_FILE.name}")

    env = load_env(ENV_FILE)
    api_key = env.get("N8N_API_KEY", "")

    # ── Step 2: Create SSL directory (placeholder) ───────────────────
    print("\n[2/6] Setting up directories...")
    ssl_dir = PROJECT_ROOT / "nginx" / "ssl"
    ssl_dir.mkdir(parents=True, exist_ok=True)
    print(f"  ✅ Created {ssl_dir}")

    # ── Step 3: Build Docker images ──────────────────────────────────
    print("\n[3/6] Building Docker images (this may take 2-5 minutes)...")
    try:
        run(["docker", "compose", "build", "--no-cache"])
        print("  ✅ Docker images built successfully!")
    except subprocess.CalledProcessError as e:
        print(f"  ❌ Build failed: {e}")
        sys.exit(1)

    # ── Step 4: Start the stack ──────────────────────────────────────
    print("\n[4/6] Starting Docker Compose stack...")
    try:
        run(["docker", "compose", "up", "-d"])
        print("  ✅ Stack started!")
    except subprocess.CalledProcessError as e:
        print(f"  ❌ Failed to start stack: {e}")
        sys.exit(1)

    # ── Step 5: Wait for services ────────────────────────────────────
    print("\n[5/6] Waiting for services to be healthy...")

    # Wait for nginx/app
    if not wait_for_url(f"{APP_URL}/health", "Nginx", timeout=60):
        print("  ⚠️  Nginx not ready — check: docker compose logs nginx")

    # Wait for n8n
    if not wait_for_url(f"{N8N_URL}/healthz", "n8n", timeout=120):
        print("  ⚠️  n8n not ready — check: docker compose logs n8n")
        print("     You can create the workflow manually later:")
        print("     python scripts/create_n8n_workflow.py")
    else:
        # ── Step 6: Create n8n workflow ──────────────────────────────
        print("\n[6/6] Setting up n8n workflow...")

        if not api_key or api_key == "your-n8n-api-key-here":
            print("  ⚠️  N8N_API_KEY not set in .env.production")
            print("     1. Open http://localhost/n8n")
            print("     2. Log in (admin / changeme123)")
            print("     3. Go to Settings > n8n API > Create API key")
            print("     4. Add it to .env.production as N8N_API_KEY")
            print("     5. Run: python scripts/create_n8n_workflow.py")
        else:
            # Import and run the workflow creation
            sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
            try:
                # Override the N8N URL for the workflow script
                os.environ["N8N_URL"] = "http://localhost/n8n"
                os.environ["N8N_API_KEY"] = api_key

                # Load env vars for platform tokens
                for k, v in env.items():
                    os.environ.setdefault(k, v)

                import create_n8n_workflow  # noqa: F401
                print("  ✅ n8n workflow created and activated!")
            except Exception as e:
                print(f"  ⚠️  Could not auto-create workflow: {e}")
                print("     Run manually: python scripts/create_n8n_workflow.py")

    # ── Summary ──────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("  🎉 Production Stack is Running!")
    print("=" * 65)
    print(f"""
  📱 App URL:      {APP_URL}
  🔧 n8n UI:       {APP_URL}/n8n
  🔗 Webhook URL:  {APP_URL}/webhook/deploy
  📊 Health:       {APP_URL}/health

  Credentials:
    n8n login:     admin / changeme123  (change in .env.production)

  Useful commands:
    docker compose logs -f          # Follow all logs
    docker compose logs -f nextjs   # Follow app logs
    docker compose logs -f n8n      # Follow n8n logs
    docker compose ps               # Check service status
    docker compose down             # Stop the stack
    docker compose restart nextjs   # Restart app only
""")


if __name__ == "__main__":
    main()
