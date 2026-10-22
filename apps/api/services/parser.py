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


def find_symbol_at_line(code: str, line: int) -> Optional[SymbolInfo]:
    """Finds the innermost function, method, or class enclosing a given 1-indexed line."""
    symbols = list_symbols(code)
    enclosing = [s for s in symbols if s.start_line <= line <= s.end_line]
    if not enclosing:
        return None
    # Sort by span length ascending to return the innermost symbol (e.g. method before class)
    enclosing.sort(key=lambda s: s.end_line - s.start_line)
    return enclosing[0]


class ResolvedOwnership(BaseModel):
    symbol: str
    owner: str  # e.g. "Dev A" or "Dev B"
    color: str  # hex color e.g. "#10b981" or "#0284c7"
    start_line: Optional[int] = None
    end_line: Optional[int] = None
    is_orphaned: bool = False
    reason: Optional[str] = None


OWNER_COLORS: Dict[str, str] = {
    "Dev A": "#10b981", # Emerald
    "Dev B": "#0284c7", # Sky Blue
    "Pair Master": "#a855f7", # Purple
}


def resolve_ownership(code: str, assignments: List[Dict[str, Any]]) -> List[ResolvedOwnership]:
    """
    Dynamically maps symbol ownership assignments to current line numbers in code.
    If a symbol is renamed or deleted from the AST, it is marked as `is_orphaned = True`.
    """
    symbols_by_name = {s.name: s for s in list_symbols(code)}
    resolved: List[ResolvedOwnership] = []

    for item in assignments:
        sym_name = item.get("symbol", "")
        owner = item.get("owner", "Dev A")
        color = OWNER_COLORS.get(owner, "#10b981")
        reason = item.get("reason") or item.get("rationale")

        if sym_name in symbols_by_name:
            ast_sym = symbols_by_name[sym_name]
            resolved.append(
                ResolvedOwnership(
                    symbol=sym_name,
                    owner=owner,
                    color=color,
                    start_line=ast_sym.start_line,
                    end_line=ast_sym.end_line,
                    is_orphaned=False,
                    reason=reason,
                )
            )
        else:
            resolved.append(
                ResolvedOwnership(
                    symbol=sym_name,
                    owner=owner,
                    color=color,
                    start_line=None,
                    end_line=None,
                    is_orphaned=True,
                    reason=reason,
                )
            )

    return resolved


def generate_call_graph_mermaid(
    code: str,
    ownership: Optional[Dict[str, str]] = None,
    failing_symbol: Optional[str] = None,
) -> str:
    """
    Constructs a Mermaid flowchart TD representing function call relationships.
    Nodes are styled with owner colors:
      - Dev A: Emerald fill (#064e3b), stroke (#10b981)
      - Dev B: Blue fill (#0c4a6e), stroke (#0284c7)
      - Failing Symbol: Ruby Red highlight (#881337), border (#f43f5e)
    """
    ownership = ownership or {}
    symbols = list_symbols(code)
    func_names = {s.name for s in symbols if s.kind in ("function", "method")}

    if not func_names:
        return "flowchart TD\n  empty[No functions detected in main.py]"

    calls: Dict[str, set] = {f: set() for f in func_names}
    pipeline_order: List[str] = []

    try:
        tree = ast.parse(code)
        # 1. Inspect function bodies for calls to other known functions
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                caller = node.name
                for child in ast.walk(node):
                    if isinstance(child, ast.Call):
                        if isinstance(child.func, ast.Name) and child.func.id in func_names:
                            if child.func.id != caller:
                                calls[caller].add(child.func.id)

        # 2. Inspect module-level execution to deduce sequential pipeline order
        for child in ast.walk(tree):
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Name):
                if child.func.id in func_names and child.func.id not in pipeline_order:
                    pipeline_order.append(child.func.id)
    except Exception as e:
        logger.debug(f"Could not deduce AST pipeline order: {e}")

    # Build edges
    edges: List[str] = []
    has_explicit_calls = any(len(callees) > 0 for callees in calls.values())

    if has_explicit_calls:
        for caller, callees in calls.items():
            for callee in callees:
                edges.append(f"    {caller} --> {callee}")
    elif len(pipeline_order) > 1:
        # Fallback to module pipeline order e.g. load_items --> apply_discount --> checkout_total
        for idx in range(len(pipeline_order) - 1):
            edges.append(f"    {pipeline_order[idx]} --> {pipeline_order[idx + 1]}")
    elif len(symbols) > 1:
        # Sequential order by AST definition
        for idx in range(len(symbols) - 1):
            edges.append(f"    {symbols[idx].name} --> {symbols[idx + 1].name}")

    # Build node labels and styles
    lines = ["flowchart TD"]
    for s in symbols:
        name = s.name
        owner = ownership.get(name, "Unassigned")
        is_failing = (failing_symbol and name == failing_symbol)
        
        label = f"{name}<br/>({owner})"
        if is_failing:
            label += " ⚠️ FAILING"

        # Safe node id
        node_id = re.sub(r"[^a-zA-Z0-9_]", "_", name)
        lines.append(f'    {node_id}["{label}"]')

    # Add edges
    if edges:
        lines.extend(edges)

    # Add styling classes
    lines.append("")
    for s in symbols:
        name = s.name
        node_id = re.sub(r"[^a-zA-Z0-9_]", "_", name)
        owner = ownership.get(name, "")
        is_failing = (failing_symbol and name == failing_symbol)

        if is_failing:
            lines.append(f"    style {node_id} fill:#881337,stroke:#f43f5e,stroke-width:3px,color:#fff")
        elif owner == "Dev A":
            lines.append(f"    style {node_id} fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#fff")
        elif owner == "Dev B":
            lines.append(f"    style {node_id} fill:#0c4a6e,stroke:#0284c7,stroke-width:2px,color:#fff")
        else:
            lines.append(f"    style {node_id} fill:#1e293b,stroke:#64748b,stroke-width:1px,color:#cbd5e1")

    return "\n".join(lines)

