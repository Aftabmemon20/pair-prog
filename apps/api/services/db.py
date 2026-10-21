from typing import Tuple, Optional
import httpx
from apps.api.config import settings
from apps.api.logger import get_logger

logger = get_logger("services.db")


async def check_db_health() -> Tuple[bool, str]:
    """
    Checks Supabase connectivity.
    Returns:
      (is_ok, message)
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        return True, "unconfigured (mock/local mode)"

    try:
        url = f"{settings.SUPABASE_URL.rstrip('/')}/rest/v1/sessions?select=id&limit=1"
        headers = {
            "apikey": settings.SUPABASE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_KEY}",
        }
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code in (200, 206):
                return True, "connected"
            else:
                logger.warning("Supabase check returned status %s: %s", resp.status_code, resp.text)
                return False, f"error: HTTP {resp.status_code}"
    except httpx.TimeoutException:
        logger.error("Supabase health check timed out")
        return False, "timeout"
    except Exception as exc:
        logger.error("Supabase health check failed: %s", str(exc))
        return False, f"connection_error: {type(exc).__name__}"
