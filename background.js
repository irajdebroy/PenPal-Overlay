chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TOGGLE_OVERLAY") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return;
      const tabId = tabs[0].id;

      chrome.scripting.executeScript(
        {
          target: { tabId },
          files: ["content.js"]
        },
        () => {
          chrome.tabs.sendMessage(tabId, { type: "TOGGLE_PENPAL_OVERLAY" });
        }
      );
    });
  }

  return true;
});
