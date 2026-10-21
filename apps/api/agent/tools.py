import re
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field, field_validator

from apps.api.services.parser import list_symbols, SymbolInfo
from apps.api.services.yjs_manager import yjs_manager

# Tool Schemas for LLM Tool Calling (OpenAI format)
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "list_symbols",
            "description": "Lists all functions and classes defined in the Python file with exact start and end lines.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file": {"type": "string", "description": "The file name, usually 'main.py'"}
                },
                "required": ["file"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_workspace_slice",
            "description": "Retrieves a slice of code lines for a specific symbol or line range (capped to stay within token budget).",
            "parameters": {
                "type": "object",
                "properties": {
                    "file": {"type": "string", "description": "File name, e.g. 'main.py'"},
                    "symbol": {"type": "string", "description": "Optional symbol name, e.g. 'apply_discount'"},
                    "start_line": {"type": "integer", "description": "1-indexed start line"},
                    "end_line": {"type": "integer", "description": "1-indexed end line"},
                },
                "required": ["file"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "annotate_code",
            "description": "Attaches an annotation, arrow, or warning highlight to an exact line range in the Monaco editor.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file": {"type": "string", "description": "File name, e.g. 'main.py'"},
                    "start_line": {"type": "integer", "description": "1-indexed start line"},
                    "end_line": {"type": "integer", "description": "1-indexed end line"},
                    "kind": {"type": "string", "enum": ["warning", "error", "info", "arrow"], "description": "Type of annotation"},
                    "message": {"type": "string", "description": "Short explanation for the annotation"},
                },
                "required": ["file", "start_line", "end_line", "kind", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "show_diagram",
            "description": "Displays a Mermaid architectural diagram in the client UI.",
            "parameters": {
                "type": "object",
                "properties": {
                    "mermaid_src": {"type": "string", "description": "Valid Mermaid source syntax, e.g. 'flowchart TD...'"},
                    "title": {"type": "string", "description": "Title of the diagram"},
                },
                "required": ["mermaid_src", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "post_message",
            "description": "Posts a direct explanation to the developers in the timeline. Response MUST be <= 120 words.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Facilitator message text (max 120 words)"}
                },
                "required": ["text"],
            },
        },
    },
]


# Pydantic Tool Input Validators
class ListSymbolsInput(BaseModel):
    file: str = "main.py"


class GetWorkspaceSliceInput(BaseModel):
    file: str = "main.py"
    symbol: Optional[str] = None
    start_line: Optional[int] = None
    end_line: Optional[int] = None


class AnnotateCodeInput(BaseModel):
    file: str = "main.py"
    start_line: int
    end_line: int
    kind: str
    message: str

    @field_validator("end_line")
    @classmethod
    def validate_range(cls, end, info):
        start = info.data.get("start_line")
        if start and end < start:
            raise ValueError(f"end_line ({end}) must be >= start_line ({start})")
        return end


class ShowDiagramInput(BaseModel):
    mermaid_src: str
    title: str

    @field_validator("mermaid_src")
    @classmethod
    def validate_mermaid(cls, v):
        trimmed = v.strip().lower()
        valid_starts = ("flowchart", "graph", "sequencediagram", "classdiagram", "statediagram")
        if not any(trimmed.startswith(s) for s in valid_starts):
            raise ValueError(f"Invalid Mermaid syntax. Must start with one of: {valid_starts}")
        return v


class PostMessageInput(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def validate_length(cls, v):
        words = v.strip().split()
        if len(words) > 135: # Small grace buffer
            raise ValueError(f"Response too long ({len(words)} words). Max 120 words allowed.")
        return v


# Execution Dispatcher
async def execute_tool(name: str, args: Dict[str, Any], room_id: str) -> Dict[str, Any]:
    """Executes a typed tool against the live synchronized Yjs room document."""
    room = await yjs_manager.get_or_init_room(room_id)
    import pycrdt
    code = str(room.ydoc.get("monaco", type=pycrdt.Text))
    lines = code.splitlines()

    if name == "list_symbols":
        validated = ListSymbolsInput(**args)
        symbols = list_symbols(code)
        return {
            "status": "success",
            "file": validated.file,
            "total_symbols": len(symbols),
            "symbols": [s.model_dump() for s in symbols],
        }

    elif name == "get_workspace_slice":
        validated = GetWorkspaceSliceInput(**args)
        if validated.symbol:
            symbols = list_symbols(code)
            sym = next((s for s in symbols if s.name == validated.symbol), None)
            if not sym:
                return {"status": "error", "message": f"Symbol '{validated.symbol}' not found in document."}
            start = sym.start_line
            end = sym.end_line
        else:
            start = max(1, validated.start_line or 1)
            end = min(len(lines), validated.end_line or len(lines))

        # Cap slice at 60 lines max
        if end - start > 60:
            end = start + 60

        sliced = lines[start - 1 : end]
        return {
            "status": "success",
            "start_line": start,
            "end_line": end,
            "lines": sliced,
            "content": "\n".join(sliced),
        }

    elif name == "annotate_code":
        validated = AnnotateCodeInput(**args)
        if validated.start_line > len(lines):
            return {"status": "error", "message": f"start_line {validated.start_line} exceeds document line count ({len(lines)})"}
        return {
            "status": "success",
            "annotation": validated.model_dump(),
        }

    elif name == "show_diagram":
        validated = ShowDiagramInput(**args)
        return {
            "status": "success",
            "diagram": validated.model_dump(),
        }

    elif name == "post_message":
        validated = PostMessageInput(**args)
        return {
            "status": "success",
            "text": validated.text,
        }

    raise ValueError(f"Unknown tool: {name}")
