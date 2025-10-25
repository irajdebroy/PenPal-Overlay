# crypto-overlay
const readme = `CryptoSim Starter


Overview
- Manifest V3 extension that injects a small iframe overlay into every page using a content script and Shadow DOM to isolate styles.
- The overlay contains a simulated portfolio, fake buy/sell buttons, and a canvas stub for charts.


Notes & Next steps
- Use IndexedDB for storing larger history/analytics and chrome.storage for small settings. IndexedDB avoids chrome.storage size quotas.
- Because of Content Security Policy (Manifest V3), avoid inline scripts/styles; load files via web_accessible_resources and static files declared in the manifest.
- Respect site owners and users: clearly label every UI element as "simulated" and avoid altering or intercepting page forms or real trading flows.


See the manifest and example files in this document. Copy into a real filesystem and split into actual files for development.`;
