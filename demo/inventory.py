"""
demo/inventory.py — Seed inventory processing pipeline for Pairio-Lite demo.

Architecture:
  - load_items: Dev A loads catalog data
  - apply_discount: Dev B applies pricing rules & discounts (INTENTIONAL BUG TARGET)
  - checkout_total: Computes taxes and final invoice total
"""

from typing import List, Dict, Any


def load_items() -> List[Dict[str, Any]]:
    """Loads sample catalog items with baseline prices."""
    return [
        {"id": "item_1", "name": "Mechanical Keyboard", "price": 120.0, "category": "electronics"},
        {"id": "item_2", "name": "Ergonomic Mouse", "price": 60.0, "category": "electronics"},
        {"id": "item_3", "name": "USB-C Hub", "price": 40.0, "category": "accessories"},
    ]


def apply_discount(items: List[Dict[str, Any]], discount_pct: float) -> List[Dict[str, Any]]:
    """
    Applies percentage discount to each eligible item.
    
    INTENTIONAL BUG FOR DEMO:
    When Dev B modifies this function, changing the formula or handling 100% discount,
    a sign or calculation error causes total prices to become negative or zero-division:
    E.g.: item['price'] = item['price'] - (item['price'] * (discount_pct / 100.0) * 10) # 10x multiplier bug!
    """
    updated = []
    for item in items:
        # Working baseline:
        discounted_price = round(item["price"] * (1.0 - (discount_pct / 100.0)), 2)
        if discounted_price < 0:
            raise ValueError(f"Price cannot be negative for {item['name']}: {discounted_price}")
        updated.append({**item, "price": discounted_price})
    return updated


def checkout_total(items: List[Dict[str, Any]], tax_rate: float = 0.08) -> float:
    """Calculates final cart checkout total including sales tax."""
    subtotal = sum(item["price"] for item in items)
    if subtotal < 0:
        raise ValueError(f"Subtotal calculation invalid: negative subtotal ${subtotal:.2f}")
    tax = round(subtotal * tax_rate, 2)
    return round(subtotal + tax, 2)


if __name__ == "__main__":
    print("=== Running Inventory Checkout ===")
    catalog = load_items()
    print(f"Loaded {len(catalog)} items.")
    discounted = apply_discount(catalog, 15.0)
    print(f"Applied 15% discount.")
    total = checkout_total(discounted)
    print(f"Checkout Total: ${total:.2f}")
