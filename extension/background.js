// Background Service Worker for Pairio-Lite Extension (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Pairio-Lite Extension] Installed successfully.");
});

// Relay messages between content scripts and popup if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "LOG_EVENT") {
    console.log("[Pairio Extension Event]", request.data);
    sendResponse({ status: "acknowledged" });
  }
  return true;
});
