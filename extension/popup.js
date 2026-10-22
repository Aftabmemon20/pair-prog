// Popup Controller for Pairio-Lite Extension

document.addEventListener("DOMContentLoaded", async () => {
  const roomIdInput = document.getElementById("roomIdInput");
  const allowControlToggle = document.getElementById("allowControlToggle");
  const injectBtn = document.getElementById("injectBtn");
  const statusText = document.getElementById("statusText");

  // Load saved state
  chrome.storage.local.get(["pairio_room_id", "pairio_allow_control"], (res) => {
    if (res.pairio_room_id) roomIdInput.value = res.pairio_room_id;
    if (res.pairio_allow_control !== undefined) {
      allowControlToggle.checked = res.pairio_allow_control;
    }
  });

  injectBtn.addEventListener("click", async () => {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
      statusText.textContent = "Please enter a Room ID";
      statusText.style.color = "#f43f5e";
      return;
    }

    const allowControl = allowControlToggle.checked;

    // Save settings
    chrome.storage.local.set({
      pairio_room_id: roomId,
      pairio_allow_control: allowControl,
    });

    statusText.textContent = "Injecting toolbar...";
    statusText.style.color = "#34d399";

    // Query active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      statusText.textContent = "No active tab found";
      return;
    }

    // Security guardrail check: Warn on sensitive financial or cloud console domains
    const sensitiveDomains = ["bank", "paypal", "console.aws.amazon.com", "accounts.google.com"];
    const isSensitive = sensitiveDomains.some((d) => (tab.url || "").includes(d));
    if (isSensitive) {
      statusText.textContent = "Blocked: Sensitive domain protected by Pairio Guardrail";
      statusText.style.color = "#f43f5e";
      return;
    }

    // Auto-sync the current tab URL to the open Pairio room so Dev B's screen automatically loads it
    try {
      chrome.tabs.query({}, (tabs) => {
        const pairioTab = tabs.find((t) => t.url && (t.url.includes("pair-prog") || t.url.includes("localhost")));
        if (pairioTab && pairioTab.id && tab.url) {
          chrome.tabs.sendMessage(pairioTab.id, {
            action: "AUTO_SYNC_SHARED_URL",
            url: tab.url,
            title: tab.title || "Active Tab",
          });
        }
      });
    } catch {
      // Non-blocking
    }

    // Send activation message to content script
    try {
      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "ACTIVATE_PAIRIO",
          roomId,
          allowControl,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            statusText.textContent = "Reload the page once, then click Launch";
            statusText.style.color = "#fbbf24";
          } else if (response && response.status === "ok") {
            statusText.textContent = "Attached successfully! Check tab.";
            statusText.style.color = "#34d399";
            setTimeout(() => window.close(), 1200);
          }
        }
      );
    } catch (e) {
      statusText.textContent = "Error communicating with tab";
    }
  });
});

