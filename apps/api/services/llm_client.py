import hashlib
import json
import re
import time
from typing import Dict, Any, List, Optional
import httpx

from apps.api.config import settings
from apps.api.logger import get_logger

logger = get_logger("services.llm")

# In-memory response cache: hash(key) -> (response_text, timestamp)
LLM_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3600 # 1 hour

# Secret redaction regex patterns
SECRET_PATTERNS = [
    re.compile(r"gsk_[a-zA-Z0-9]{20,}", re.IGNORECASE),
    re.compile(r"ey[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}", re.IGNORECASE), # JWTs
    re.compile(r"sk-[a-zA-Z0-9]{20,}", re.IGNORECASE),
    re.compile(r"Bearer\s+[a-zA-Z0-9_\-\.]{15,}", re.IGNORECASE),
]


def redact_secrets(text: str) -> str:
    """Redacts potential API keys, JWT tokens, and credentials from outgoing text."""
    if not text:
        return ""
    redacted = text
    for pattern in SECRET_PATTERNS:
        redacted = pattern.sub("[REDACTED_SECRET]", redacted)
    return redacted


def truncate_context_tokens(messages: List[Dict[str, Any]], max_chars: int = 12000) -> List[Dict[str, Any]]:
    """
    Enforces the ~3K token input budget by truncating oversized message payloads
    while preserving tool_calls, tool_call_id, and other OpenAI-compatible message keys.
    """
    cleaned: List[Dict[str, Any]] = []

    for msg in messages:
        new_msg = dict(msg)
        raw_content = msg.get("content")
        if raw_content is not None:
            content = redact_secrets(str(raw_content))
            if len(content) > max_chars:
                content = content[:max_chars] + "\n...[Context truncated to preserve token budget]..."
            new_msg["content"] = content
        cleaned.append(new_msg)

    return cleaned


def compute_cache_key(model: str, messages: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]] = None) -> str:
    serialized = json.dumps({"model": model, "messages": messages, "tools": tools or []}, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class GroqLLMClient:
    """
    Robust Groq API client with:
    - 20s timeout
    - Exponential backoff retry
    - 429 fallback (openai/gpt-oss-120b -> openai/gpt-oss-20b)
    - Response cache keyed by hash(context)
    - Secret redaction
    """

    def __init__(self):
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"

    async def call_llm(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[str] = None,
        model_override: Optional[str] = None,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        """
        Executes an LLM call with fallback and caching.
        Returns OpenAI-compatible response dict or structured fallback message.
        """
        api_key = settings.GROQ_API_KEY.strip()
        primary_model = model_override or settings.GROQ_MODEL
        fallback_model = settings.GROQ_FALLBACK_MODEL

        # Sanitize and truncate messages
        safe_messages = truncate_context_tokens(messages)

        # Check Cache
        cache_key = compute_cache_key(primary_model, safe_messages, tools)
        if cache_key in LLM_CACHE:
            entry = LLM_CACHE[cache_key]
            if time.time() - entry["ts"] < CACHE_TTL_SECONDS:
                logger.info("Serving LLM response from labeled cache")
                res = entry["data"]
                res["_cached"] = True
                return res

        # STUB Fallback if API key is not configured
        if not api_key or api_key.startswith("gsk_..."):
            logger.warning("GROQ_API_KEY unconfigured; returning structured local mock response")
            return self._mock_response(safe_messages, tools)

        # Attempt Primary Model with retry
        try:
            return await self._execute_request(
                model=primary_model,
                messages=safe_messages,
                tools=tools,
                tool_choice=tool_choice,
                temperature=temperature,
                cache_key=cache_key,
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                logger.warning(f"HTTP 429 on primary model {primary_model}. Falling back to {fallback_model}")
                # Fallback model attempt
                fallback_cache_key = compute_cache_key(fallback_model, safe_messages, tools)
                return await self._execute_request(
                    model=fallback_model,
                    messages=safe_messages,
                    tools=tools,
                    tool_choice=tool_choice,
                    temperature=temperature,
                    cache_key=fallback_cache_key,
                    is_fallback=True,
                )
            raise

    async def _execute_request(
        self,
        model: str,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict[str, Any]]],
        tool_choice: Optional[str],
        temperature: float,
        cache_key: str,
        is_fallback: bool = False,
    ) -> Dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {settings.GROQ_API_KEY.strip()}",
            "Content-Type": "application/json",
        }

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 1024,
        }
        if tools:
            payload["tools"] = tools
            if tool_choice:
                payload["tool_choice"] = tool_choice

        # Max 2 retries with exponential backoff
        delays = [1.0, 2.5]
        last_error = None

        async with httpx.AsyncClient(timeout=20.0) as client:
            for attempt in range(len(delays) + 1):
                try:
                    res = await client.post(self.api_url, json=payload, headers=headers)
                    res.raise_for_status()
                    data = res.json()
                    if is_fallback:
                        data["_fallback_model"] = model

                    # Cache successful result
                    LLM_CACHE[cache_key] = {"data": data, "ts": time.time()}
                    return data
                except (httpx.TimeoutException, httpx.NetworkError) as err:
                    last_error = err
                    if attempt < len(delays):
                        sleep_time = delays[attempt]
                        logger.warning(f"LLM call to {model} attempt {attempt+1} failed: {err}. Retrying in {sleep_time}s")
                        import asyncio
                        await asyncio.sleep(sleep_time)
                except httpx.HTTPStatusError as err:
                    if err.response.status_code == 429:
                        raise # Handled by fallback logic
                    if attempt < len(delays) and err.response.status_code >= 500:
                        sleep_time = delays[attempt]
                        import asyncio
                        await asyncio.sleep(sleep_time)
                    else:
                        raise

        raise RuntimeError(f"LLM request to {model} failed after retries: {last_error}")

    def _mock_response(self, messages: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """STUB: Local deterministic mock for tests and offline development."""
        # If the preceding message is a tool output, synthesize a concise facilitator response
        if messages and messages[-1].get("role") == "tool":
            tool_content = messages[-1].get("content", "")
            try:
                parsed = json.loads(tool_content)
                if "symbols" in parsed:
                    sym_names = [f"`{s['name']}` (L{s['start_line']}-{s['end_line']})" for s in parsed["symbols"]]
                    return {
                        "id": "mock_resp_tools",
                        "choices": [
                            {
                                "message": {
                                    "role": "assistant",
                                    "content": f"The file contains {len(sym_names)} functions: {', '.join(sym_names)}. I am ready to split ownership or trace errors.",
                                },
                                "finish_reason": "stop",
                            }
                        ],
                        "_mock": True,
                    }
            except Exception:
                pass

            return {
                "id": "mock_resp_generic",
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "Tool execution completed. The workspace is verified and ready.",
                        },
                        "finish_reason": "stop",
                    }
                ],
                "_mock": True,
            }

        user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "").lower()

        # If user asks about functions/symbols, initiate tool call to list_symbols
        if tools and ("function" in user_msg or "symbol" in user_msg or "file" in user_msg):
            return {
                "id": "mock_call_1",
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call_mock_symbols",
                                    "type": "function",
                                    "function": {
                                        "name": "list_symbols",
                                        "arguments": json.dumps({"file": "main.py"}),
                                    },
                                }
                            ],
                        },
                        "finish_reason": "tool_calls",
                    }
                ],
                "_mock": True,
            }

        return {
            "id": "mock_resp_1",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Pair Master here. I facilitate code ownership, analyze runtime failures, and annotate code. Ask me about functions in this file or click 'Split Work'.",
                    },
                    "finish_reason": "stop",
                }
            ],
            "_mock": True,
        }


llm_client = GroqLLMClient()
