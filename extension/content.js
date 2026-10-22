// Content Script for Pairio-Lite Extension
// Injects floating telestrator toolbar and guardrail remote control overlay directly onto target webpage

(() => {
  let isInitialized = false;
  let isDrawingMode = false;
  let selectedColor = "#f43f5e";
  let isPointerDown = false;
  let canvas = null;
  let ctx = null;
  let floatingBar = null;
  let guardrailBanner = null;
  let allowControl = false;
  let currentRoomId = null;

  // Listen for popup activation
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ACTIVATE_PAIRIO") {
      currentRoomId = request.roomId;
      allowControl = request.allowControl;
      initOverlay();
      sendResponse({ status: "ok" });
    }
  });

  function initOverlay() {
    if (isInitialized) {
      if (floatingBar) floatingBar.style.display = "flex";
      updateGuardrailBanner();
      return;
    }
    isInitialized = true;

    // 1. Create Transparent Canvas Overlay
    canvas = document.createElement("canvas");
    canvas.id = "pairio-overlay-canvas";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");

    // Handle Window Resize
    window.addEventListener("resize", () => {
      if (!canvas || !ctx) return;
      const tempImg = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.putImageData(tempImg, 0, 0);
    });

    // Drawing Listeners
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);

    // 2. Create Floating Toolbar
    floatingBar = document.createElement("div");
    floatingBar.id = "pairio-floating-bar";
    floatingBar.innerHTML = `
      <div class="pairio-badge">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#34d399;margin-right:2px;"></span>
        Pairio: ${currentRoomId || "Connected"}
      </div>
      <button class="pairio-btn" id="pairio-draw-toggle">
        ✏️ <span>Draw</span>
      </button>
      <div style="display:flex;align-items:center;gap:4px;margin:0 2px;">
        <div class="pairio-color-dot selected" data-color="#f43f5e" style="background:#f43f5e;" title="Electric Red"></div>
        <div class="pairio-color-dot" data-color="#06b6d4" style="background:#06b6d4;" title="Cyan"></div>
        <div class="pairio-color-dot" data-color="#eab308" style="background:#eab308;" title="Yellow"></div>
      </div>
      <button class="pairio-btn" id="pairio-clear-btn" title="Clear markings">
        🧹
      </button>
      <button class="pairio-btn" id="pairio-close-btn" style="color:#94a3b8;" title="Hide toolbar">
        ✕
      </button>
    `;
    document.body.appendChild(floatingBar);

    // Wire Toolbar Controls
    const drawBtn = floatingBar.querySelector("#pairio-draw-toggle");
    drawBtn.addEventListener("click", () => {
      isDrawingMode = !isDrawingMode;
      drawBtn.classList.toggle("active", isDrawingMode);
      canvas.classList.toggle("pairio-drawing-active", isDrawingMode);
    });

    // Color Pickers
    floatingBar.querySelectorAll(".pairio-color-dot").forEach((dot) => {
      dot.addEventListener("click", (e) => {
        floatingBar.querySelectorAll(".pairio-color-dot").forEach((d) => d.classList.remove("selected"));
        dot.classList.add("selected");
        selectedColor = dot.getAttribute("data-color");
      });
    });

    // Clear Canvas
    floatingBar.querySelector("#pairio-clear-btn").addEventListener("click", () => {
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    // Close / Hide Toolbar
    floatingBar.querySelector("#pairio-close-btn").addEventListener("click", () => {
      floatingBar.style.display = "none";
      if (isDrawingMode) {
        isDrawingMode = false;
        drawBtn.classList.remove("active");
        canvas.classList.remove("pairio-drawing-active");
      }
    });

    // 3. Security Guardrail Banner (If Peer Control Enabled)
    updateGuardrailBanner();

    // Panic Revoke on 'Escape' Key
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && allowControl) {
        revokeControl("Esc key pressed");
      }
    });
  }

  function updateGuardrailBanner() {
    if (allowControl) {
      if (!guardrailBanner) {
        guardrailBanner = document.createElement("div");
        guardrailBanner.id = "pairio-guardrail-banner";
        guardrailBanner.innerHTML = `
          <span>⚠️ Remote Peer Control Active on Tab</span>
          <button class="pairio-panic-btn" id="pairio-panic-revoke">Revoke (Esc)</button>
        `;
        document.body.appendChild(guardrailBanner);

        guardrailBanner.querySelector("#pairio-panic-revoke").addEventListener("click", () => {
          revokeControl("User clicked revoke");
        });
      }
      guardrailBanner.style.display = "flex";
    } else if (guardrailBanner) {
      guardrailBanner.style.display = "none";
    }
  }

  function revokeControl(reason) {
    allowControl = false;
    if (guardrailBanner) guardrailBanner.style.display = "none";
    chrome.storage.local.set({ pairio_allow_control: false });
    console.log(`[Pairio Security Guardrail] Remote peer control revoked: ${reason}`);
  }

  // Telestrator Drawing Mechanics
  let lastX = 0;
  let lastY = 0;

  function handlePointerDown(e) {
    if (!isDrawingMode || !ctx) return;
    isPointerDown = true;
    lastX = e.clientX;
    lastY = e.clientY;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = selectedColor;
    ctx.fill();
  }

  function handlePointerMove(e) {
    if (!isPointerDown || !isDrawingMode || !ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(e.clientX, e.clientY);
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    lastX = e.clientX;
    lastY = e.clientY;
  }

  function handlePointerUp() {
    isPointerDown = false;
  }
})();
