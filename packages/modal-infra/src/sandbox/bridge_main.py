#!/usr/bin/env python3
"""Entry point for bridge process (called by supervisor)."""

import asyncio

from .bridge import main

if __name__ == "__main__":
    asyncio.run(main())
