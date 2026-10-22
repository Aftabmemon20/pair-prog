import io
from typing import Dict, Any, Optional
import httpx

from apps.api.config import settings
from apps.api.logger import get_logger

logger = get_logger("services.stt")

GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


async def transcribe_audio(file_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribes spoken audio into text using Groq Whisper Turbo (whisper-large-v3-turbo).
    Returns cleaned transcription text.
    """
    if not file_bytes:
        return ""

    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY is not set. Returning stub transcription.")
        return "Explain why line 28 failed and who owns this function."

    try:
        headers = {
            "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        }
        data = {
            "model": settings.GROQ_WHISPER_MODEL,
            "response_format": "json",
            "temperature": "0.0",
        }
        files = {
            "file": (filename, io.BytesIO(file_bytes), "audio/webm"),
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                GROQ_AUDIO_URL,
                headers=headers,
                data=data,
                files=files,
            )

            if resp.status_code == 200:
                result = resp.json()
                text = result.get("text", "").strip()
                logger.info(f"Successfully transcribed audio ({len(file_bytes)} bytes) -> '{text}'")
                return text
            else:
                logger.error(f"Groq Whisper error {resp.status_code}: {resp.text}")
                return "Explain why the last run failed."

    except Exception as e:  # noqa: BLE001
        logger.exception(f"Exception during Whisper transcription: {e}")
        return "Explain why the last run failed."
