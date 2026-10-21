from pathlib import Path
import pytest
from apps.api.services.parser import list_symbols, parse_traceback

DEMO_FILE = Path(__file__).resolve().parent.parent.parent.parent / "demo" / "inventory.py"


def test_list_symbols_on_inventory():
    code = DEMO_FILE.read_text(encoding="utf-8")
    symbols = list_symbols(code)

    names = [s.name for s in symbols]
    assert "load_items" in names
    assert "apply_discount" in names
    assert "checkout_total" in names

    # Verify line ranges
    apply_disc = next(s for s in symbols if s.name == "apply_discount")
    assert apply_disc.start_line < apply_disc.end_line
    assert apply_disc.kind == "function"
    assert "discount_pct" in apply_disc.args


def test_list_symbols_with_classes():
    sample = """
class OrderService:
    def __init__(self, tax_rate: float):
        self.tax_rate = tax_rate

    def calculate(self, amount: float):
        return amount * (1.0 + self.tax_rate)

def standalone_helper():
    pass
"""
    symbols = list_symbols(sample)
    names = [s.name for s in symbols]
    assert "OrderService" in names
    assert "OrderService.__init__" in names
    assert "OrderService.calculate" in names
    assert "standalone_helper" in names


def test_list_symbols_syntax_error():
    broken = "def broken_func(:\n    pass"
    symbols = list_symbols(broken)
    assert symbols == []


def test_parse_traceback_value_error():
    raw_tb = """
Traceback (most recent call last):
  File "main.py", line 47, in <module>
    checkout_total(apply_discount(items, 15.0))
  File "main.py", line 29, in apply_discount
    raise ValueError(f"Price cannot be negative for {item['name']}: {discounted_price}")
ValueError: Price cannot be negative for Mechanical Keyboard: -60.0
"""
    parsed = parse_traceback(raw_tb)

    assert parsed.error_type == "ValueError"
    assert "Price cannot be negative" in parsed.error_message
    assert len(parsed.frames) == 2

    # Verify top application frame
    top = parsed.top_frame
    assert top is not None
    assert top.file == "main.py"
    assert top.line == 29
    assert top.function == "apply_discount"
    assert "raise ValueError" in top.code_line


def test_parse_traceback_syntax_error():
    raw_tb = """
  File "main.py", line 12
    discounted_price = round(item["price"] * (1.0 - (discount_pct / 100.0) 10), 2)
                                                                           ^
SyntaxError: invalid syntax
"""
    parsed = parse_traceback(raw_tb)
    assert parsed.error_type == "SyntaxError"
    assert len(parsed.frames) == 1
    assert parsed.frames[0].line == 12
