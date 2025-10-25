document.addEventListener("DOMContentLoaded", () => {
  const toggleButton = document.getElementById("toggleOverlay");
  toggleButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "TOGGLE_OVERLAY" });
  });
});
