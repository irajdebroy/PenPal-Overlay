chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Toggle overlay (existing)
  if (request.type === "TOGGLE_OVERLAY") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return;
      const tabId = tabs[0].id;

      chrome.scripting.executeScript(
        { target: { tabId }, files: ["content.js"] },
        () => {
          chrome.tabs.sendMessage(tabId, { type: "TOGGLE_PENPAL_OVERLAY" });
        }
      );
    });
    // no response needed
    return;
  }

  // Capture visible tab as dataURL and return via sendResponse
  if (request.type === "CAPTURE_VISIBLE") {
    // note: requires "tabs" permission in manifest
    chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || "capture failed" });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });
    // keep channel open for async response
    return true;
  }

  // Placeholder AI: receive image dataURL and return simulated text
  if (request.type === "aiImage") {
    // request.image is a dataURL (base64 PNG)
    // TODO: Replace this block with your real AI upload/processing (fetch to your server)
    console.log("Received aiImage, length:", request.image?.length || 0);
    // Simulated response
    sendResponse({ success: true, result: `AI would explain the selected image here (size ${Math.round((request.image?.length||0)/1024)} KB).` });
    return;
  }

  // Existing aiQuery text handler (kept for compatibility)
  if (request.type === "aiQuery") {
    console.log("AI Query received:", request.text);
    sendResponse({ result: `AI would explain: "${request.text}" here.` });
  }

  // default: no async response
});
