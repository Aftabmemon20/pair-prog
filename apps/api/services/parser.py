import ast
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class SymbolInfo(BaseModel):
    name: str
    kind: str # "function" | "class" | "method"
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    args: List[str] = Field(default_factory=list)


class TracebackFrame(BaseModel):
    file: str
    line: int
    function: str
    code_line: Optional[str] = None


class StructuredTraceback(BaseModel):
    error_type: str
    error_message: str
    frames: List[TracebackFrame] = Field(default_factory=list)
    top_frame: Optional[TracebackFrame] = None


def list_symbols(code: str) -> List[SymbolInfo]:
    """
    Parses Python source code with the standard `ast` module.
    Returns functions, classes, and methods with exact start and end lines.
    """
    if not code or not code.strip():
        return []

    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []

    symbols: List[SymbolInfo] = []

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            symbols.append(_extract_func_symbol(node, kind="function"))
        elif isinstance(node, ast.ClassDef):
            symbols.append(_extract_class_symbol(node))
            # Also extract methods inside class
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    method_sym = _extract_func_symbol(item, kind="method", parent=node.name)
                    symbols.append(method_sym)

    return symbols


def _extract_func_symbol(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    kind: str = "function",
    parent: Optional[str] = None,
) -> SymbolInfo:
    name = f"{parent}.{node.name}" if parent else node.name
    args = [arg.arg for arg in node.args.args]
    docstring = ast.get_docstring(node)
    end_line = getattr(node, "end_lineno", node.lineno)

    return SymbolInfo(
        name=name,
        kind=kind,
        start_line=node.lineno,
        end_line=end_line,
        docstring=docstring,
        args=args,
    )


def _extract_class_symbol(node: ast.ClassDef) -> SymbolInfo:
    docstring = ast.get_docstring(node)
    end_line = getattr(node, "end_lineno", node.lineno)

    return SymbolInfo(
        name=node.name,
        kind="class",
        start_line=node.lineno,
        end_line=end_line,
        docstring=docstring,
        args=[],
    )


# Regex pattern to match Python traceback frames:
# File "main.py", line 29, in apply_discount
#     item['price'] = item['price'] - ...
FRAME_REGEX = re.compile(
    r'File\s+["\'](?P<file>[^"\']+)["\'],\s+line\s+(?P<line>\d+)(?:,\s+in\s+(?P<func>[^\n\r]+))?'
)


def parse_traceback(tb_text: str) -> StructuredTraceback:
    """
    Parses Python traceback text into structured frames, error type, and error message.
    """
    if not tb_text or not tb_text.strip():
        return StructuredTraceback(
            error_type="UnknownError",
            error_message="No traceback details provided.",
            frames=[],
        )

    lines = tb_text.strip().splitlines()
    frames: List[TracebackFrame] = []

    # Find all frame occurrences
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        match = FRAME_REGEX.search(line)
        if match:
            file_name = match.group("file")
            line_no = int(match.group("line"))
            func_name = (match.group("func") or "<module>").strip()
            
            # The next line often contains the actual source code quoted
            code_line = None
            if i + 1 < len(lines) and not lines[i + 1].strip().startswith("File "):
                code_line = lines[i + 1].strip()
                i += 1

            frames.append(
                TracebackFrame(
                    file=file_name,
                    line=line_no,
                    function=func_name,
                    code_line=code_line,
                )
            )
        i += 1

    # Extract final error line (e.g. ValueError: Price cannot be negative for Mechanical Keyboard: -60.0)
    error_type = "RuntimeError"
    error_message = ""

    last_line = lines[-1].strip() if lines else ""
    # Standard format: ExceptionName: message
    error_match = re.match(r"^([a-zA-Z_][a-zA-Z0-9_\.]*(?:Error|Exception|Interrupt|Exit)?):\s*(.*)$", last_line)
    if error_match:
        error_type = error_match.group(1)
        error_message = error_match.group(2)
    elif ":" in last_line:
        parts = last_line.split(":", 1)
        error_type = parts[0].strip()
        error_message = parts[1].strip()
    else:
        error_message = last_line

    # Identify the top application frame (prefer main.py frames)
    app_frames = [f for f in frames if "main.py" in f.file or not f.file.startswith("<")]
    top_frame = app_frames[-1] if app_frames else (frames[-1] if frames else None)

    return StructuredTraceback(
        error_type=error_type,
        error_message=error_message,
        frames=frames,
        top_frame=top_frame,
    )
