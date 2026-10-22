# Pairio-Lite Co-Pilot Chrome Extension (v2 Prototype)

This lightweight Manifest V3 Chrome Extension injects a **Floating Telestrator Drawing Toolbar** directly onto any open browser tab (Claude, YouTube, documentation, or local web apps) with built-in security guardrails.

---

### Security Guardrails Implemented:
1. **Explicit Permission Toggle**: Remote peer control is strictly OFF by default.
2. **Panic Revoke**: Pressing the `Escape` key or clicking `Revoke` immediately terminates remote control.
3. **Sensitive Domain Filter**: Financial, banking, and cloud console domains (AWS, Google Accounts) are protected by default.
4. **No Debugger API**: Avoids intrusive `chrome.debugger` attachment warnings.

---

### How to Install in 3 Steps:

1. Open Google Chrome and go to:
   ```
   chrome://extensions
   ```
2. In the top-right corner, turn ON **"Developer mode"**.
3. Click the **"Load unpacked"** button (top-left) and select this folder:
   ```
   c:\Users\ASUS\Downloads\pairio browser proto\extension
   ```

---

### How to Use:
1. Open any tab (e.g. YouTube, Claude, or your local web app `localhost:3000`).
2. Click the **Pairio Extension icon** in your Chrome toolbar.
3. Enter your active **Pairio Room ID** and click **"Launch In-Tab Toolbar"**.
4. The sleek floating Pairio bar will appear in the bottom-right corner!
5. Click **Draw (✏️)** to draw circles, arrows, and notes directly on the webpage!
