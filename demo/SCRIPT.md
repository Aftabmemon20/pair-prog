# 6-Step Demo Script — Pairio-Lite Pair Master

Target Audience: Founder of Pairio (Mark)  
Duration: 4–5 minutes  
Goal: Showcase domain mastery in pair programming, CRDT sync, and a helpful AI agent facilitating on the third seat.

---

### Step 1: Room Creation & Multi-User Join (0:00 - 0:45)
- **Host (Dev A)** navigates to the web app, clicks **"Create Pair Room"**.
- Enters name `"Dev A (Host)"`, copies link `/r/[room-id]`.
- Opens a second browser window (e.g. Incognito or secondary profile), pastes link, enters `"Mark / Dev B"`.
- **Showcase**: Presence list shows both users with distinct cursor colors. Simultaneous typing shows zero-conflict CRDT synchronization.

### Step 2: "Split Work" — AI Code Ownership Proposal (0:45 - 1:30)
- Dev A clicks the **"Split Work"** button.
- **Pair Master Agent** inspects Python AST symbols:
  - `load_items` ➔ Assigned to Dev A
  - `apply_discount` ➔ Assigned to Dev B ("Handling pricing and discount logic")
  - `checkout_total` ➔ Assigned to Dev A ("Handling total aggregation and taxes")
- Humans see proposed cards in Timeline with **[Accept] / [Reject]**.
- Both click **Accept**.
- **Showcase**: Colored gutter bars appear next to respective functions in Monaco with author badges.

### Step 3: Trigger Intentional Bug in Dev B's Block (1:30 - 2:15)
- Dev B edits `apply_discount` in `demo/inventory.py` to add an accidental calculation error:
  `item['price'] = item['price'] - (item['price'] * (discount_pct / 100.0) * 10)`
- Dev A clicks **"Run"**.
- Pyodide Web Worker runs the code in sandbox and times out or throws `ValueError: Price cannot be negative for Mechanical Keyboard: -60.0`.
- Output panel broadcasts the exact stack trace to both participants.

### Step 4: AI Failure Analysis & Visual Explanation (2:15 - 3:30)
- Pair Master automatically wakes up on runtime error.
- Timeline displays structured analysis:
  - **Failing Symbol**: `apply_discount`
  - **Owner**: Dev B (highlighted)
  - **Evidence**: Line 29 quoted with exact text match verified by backend.
  - **Diagram**: Flowchart rendered via Mermaid showing `load_items` (green) ➔ `apply_discount` (RED failure) ➔ `checkout_total` (gray).
  - **Annotation**: Monaco gutter/line is annotated with a warning arrow and explanation.

### Step 5: Voice Push-to-Talk (3:30 - 4:00)
- Dev B presses and holds **"Hold to Talk"**:
  *"Why did the total go negative?"*
- Whisper Turbo transcribes clip in <1s.
- Agent answers within 120 words with verified rationale.

### Step 6: Session Recap & Shareable Artifact (4:00 - 4:45)
- Dev A clicks **"End Session"**.
- Agent generates structured summary:
  - Key decisions
  - Owned symbols
  - Bugs encountered & fixes
  - Next steps
- Shareable read-only link `/s/[session-id]` is presented.
