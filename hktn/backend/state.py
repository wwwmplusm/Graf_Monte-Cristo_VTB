from __future__ import annotations

from cachetools import TTLCache

from .config import settings

# Shared cache for expensive banking API calls.
api_cache: TTLCache[str, dict] = TTLCache(maxsize=settings.api_cache_size, ttl=settings.api_cache_ttl)
