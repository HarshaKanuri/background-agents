#!/usr/bin/env python3
"""
Pre-build the sandbox image so it's cached for fast startup.

Run this once with: python prebuild_image.py
Then subsequent tests will use the cached image.
"""

from pathlib import Path

import modal

SANDBOX_DIR = Path(__file__).parent / "src" / "sandbox"

# Create a named app for image persistence
app = modal.App("open-inspect-image-builder")

# Define the sandbox image
sandbox_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(
        "git",
        "curl",
        "build-essential",
        "ca-certificates",
        "gnupg",
    )
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        "node --version",
        "npm --version",
    )
    .pip_install("httpx", "websockets", "pydantic>=2.0")
    .run_commands(
        "npm install -g opencode-ai@latest",
        "opencode --version || echo 'OpenCode installed'",
        "mkdir -p /workspace /tmp/opencode",
    )
    .env(
        {
            "PYTHONPATH": "/app",
            "HOME": "/root",
            "SANDBOX_IMAGE_VERSION": "v1",
        }
    )
    .add_local_dir(str(SANDBOX_DIR), remote_path="/app/sandbox")
)


@app.function(image=sandbox_image)
def warmup():
    """Function to trigger image build."""
    import subprocess

    result = subprocess.run(["node", "--version"], capture_output=True, text=True)
    print(f"Node version: {result.stdout.strip()}")
    result = subprocess.run(["opencode", "--version"], capture_output=True, text=True)
    print(f"OpenCode: {result.stdout.strip() or result.stderr.strip()}")
    return {"status": "ready", "node": result.stdout.strip()}


if __name__ == "__main__":
    print("Pre-building sandbox image...")
    print("This may take 5-10 minutes on first run, but will be cached after that.")
    print()

    with app.run():
        result = warmup.remote()
        print(f"Image built successfully: {result}")

    print("\nImage is now cached. Subsequent runs will be faster.")
