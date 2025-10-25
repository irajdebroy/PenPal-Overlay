// content.js - PenPal overlay (robust single-instance + minimize/restore + persistence)
(() => {
  // Use a single global object so repeated injections share state
  if (!window.__penpal_global) {
    window.__penpal_global = {
      overlay: null,
      isMinimized: false,
      savedSize: null,    // { width, height }
      initialized: false,
    };
  }

  const G = window.__penpal_global;

  // If we've already initialized the message listener, just return (no duplication).
  if (G.initialized) {
    // already ready to receive messages
    return;
  }
  G.initialized = true;

  const STORAGE_KEY = "penpal-overlay";

  // Helpers for storage
  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function clampToViewport(val, size) {
    // simple clamp helper (not necessary but avoids off-screen positions)
    const n = parseInt(val, 10);
    if (isNaN(n)) return size;
    return `${Math.max(10, Math.min(n, window.innerWidth - 40))}px`;
  }

  // Create overlay (only once)
  function createOverlay() {
    if (G.overlay && G.overlay.isConnected) {
      // Already present in DOM
      return G.overlay;
    }

    // read saved state (top, left, width, height)
    const saved = loadState();
    const startTop = saved.top || "60px";
    const startLeft = saved.left || "60px";
    const startWidth = saved.width || "360px";
    const startHeight = saved.height || "220px";

    // root
    const overlay = document.createElement("div");
    overlay.id = "penpal-overlay";
    overlay.setAttribute("aria-label", "PenPal overlay");
    overlay.innerHTML = `
      <div id="penpal-header" role="toolbar">
        <div id="penpal-title">PenPal AI</div>
        <div id="penpal-controls">
          <button id="penpal-minimize" title="Minimize">–</button>
          <button id="penpal-close" title="Close">✕</button>
        </div>
      </div>
      <div id="penpal-body">
        <textarea id="penpal-input" placeholder="Ask or paste text here..."></textarea>
        <div style="display:flex;gap:8px;">
          <button id="penpal-send">Explain</button>
        </div>
        <div id="penpal-response" aria-live="polite"></div>
      </div>
    `;

    // Base styles: dark gray translucent, white text, purple border/highlights
    Object.assign(overlay.style, {
      position: "fixed",
      top: startTop,
      left: startLeft,
      width: startWidth,
      height: startHeight,
      backgroundColor: "rgba(32,34,36,0.92)",
      color: "white",
      border: "2px solid rgba(126,87,194,0.95)",
      borderRadius: "10px",
      zIndex: 2147483647, // maximum to avoid being hidden
      padding: "0",
      boxSizing: "border-box",
      resize: "both",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      fontFamily: "Inter, Roboto, sans-serif",
      minWidth: "220px",
      minHeight: "46px",
      userSelect: "none"
    });

    // Header styles
    const header = overlay.querySelector("#penpal-header");
    const title = overlay.querySelector("#penpal-title");
    const controls = overlay.querySelector("#penpal-controls");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 10px",
      gap: "8px",
      cursor: "move", // draggable
      background: "linear-gradient(90deg, rgba(0,0,0,0.05), rgba(0,0,0,0.04))",
      borderTopLeftRadius: "8px",
      borderTopRightRadius: "8px",
    });

    Object.assign(title.style, {
      fontWeight: "600",
      color: "white",
      fontSize: "14px",
      pointerEvents: "none"
    });

    Object.assign(controls.style, {
      display: "flex",
      gap: "6px",
      alignItems: "center"
    });

    // Buttons style
    overlay.querySelectorAll("#penpal-controls button").forEach(btn => {
      Object.assign(btn.style, {
        background: "transparent",
        border: "none",
        color: "white",
        fontSize: "16px",
        cursor: "pointer",
        width: "28px",
        height: "28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "6px"
      });
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(126,87,194,0.18)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "transparent";
      });
    });

    // Body styles
    const body = overlay.querySelector("#penpal-body");
    Object.assign(body.style, {
      padding: "10px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      flex: "1 1 auto",
      overflow: "auto",
      backgroundColor: "transparent"
    });

    const input = overlay.querySelector("#penpal-input");
    Object.assign(input.style, {
      width: "100%",
      minHeight: "72px",
      resize: "none",
      borderRadius: "6px",
      border: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(255,255,255,0.03)",
      color: "white",
      padding: "8px",
      boxSizing: "border-box",
      fontSize: "13px",
      fontFamily: "inherit"
    });

    const sendBtn = overlay.querySelector("#penpal-send");
    Object.assign(sendBtn.style, {
      background: "linear-gradient(180deg, #7e57c2, #6a3eb6)",
      color: "white",
      border: "none",
      padding: "8px 12px",
      borderRadius: "8px",
      cursor: "pointer",
      alignSelf: "flex-start"
    });

    const response = overlay.querySelector("#penpal-response");
    Object.assign(response.style, {
      background: "rgba(255,255,255,0.02)",
      borderRadius: "6px",
      padding: "8px",
      minHeight: "40px",
      color: "white",
      border: "1px solid rgba(255,255,255,0.02)",
      fontSize: "13px"
    });

    // Add to DOM
    document.body.appendChild(overlay);
    G.overlay = overlay;

    // Dragging logic (header)
    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    header.addEventListener("mousedown", (e) => {
      // If clicking control buttons, don't start drag
      if (e.target.closest("#penpal-controls")) return;
      dragging = true;
      // compute offset relative to viewport
      const rect = overlay.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;

      document.addEventListener("mousemove", onDrag);
      document.addEventListener("mouseup", onDragEnd);
    });

    function onDrag(e) {
      if (!dragging) return;
      e.preventDefault();
      const left = Math.max(6, e.clientX - dragOffsetX);
      const top = Math.max(6, e.clientY - dragOffsetY);
      overlay.style.left = `${Math.min(left, window.innerWidth - 40)}px`;
      overlay.style.top = `${Math.min(top, window.innerHeight - 40)}px`;
    }

    function onDragEnd() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("mousemove", onDrag);
      document.removeEventListener("mouseup", onDragEnd);
      // persist
      saveOverlayRect();
    }

    // Resize handling: save on mouseup when user resizes
    overlay.addEventListener("mouseup", (e) => {
      // if overlay is not minimized, save size/pos after user finishes resizing
      if (!G.isMinimized) saveOverlayRect();
    });

    // Prevent text selection during drag
    header.addEventListener("dragstart", (e) => e.preventDefault());

    // Minimize / restore behavior
    const minimizeBtn = overlay.querySelector("#penpal-minimize");
    const closeBtn = overlay.querySelector("#penpal-close");

    minimizeBtn.addEventListener("click", () => {
      toggleMinimize();
    });

    closeBtn.addEventListener("click", () => {
      removeOverlay();
    });

    // Send (placeholder AI call)
    sendBtn.addEventListener("click", () => {
      const txt = input.value.trim();
      if (!txt) return;
      response.textContent = "Thinking...";
      chrome.runtime.sendMessage({ type: "aiQuery", text: txt }, (res) => {
        response.textContent = res?.result || "No response.";
      });
    });

    // Make overlay keyboard accessible - close on Escape
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        removeOverlay();
      }
    });

    // On creation, ensure overlay has stored size & minimized state applied
    applySavedState();

    return overlay;
  } // end createOverlay

  // Save current overlay style rect (top/left/width/height)
  function saveOverlayRect() {
    if (!G.overlay) return;
    const rect = G.overlay.getBoundingClientRect();
    const state = {
      top: `${Math.round(rect.top)}px`,
      left: `${Math.round(rect.left)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      minimized: !!G.isMinimized
    };
    saveState(state);
  }

  // Apply saved state (position/size, and restore minimized state if previously minimized)
  function applySavedState() {
    const state = loadState();
    if (!G.overlay) return;
    if (state.top) G.overlay.style.top = state.top;
    if (state.left) G.overlay.style.left = state.left;
    if (state.width) G.overlay.style.width = state.width;
    if (state.height) G.overlay.style.height = state.height;
    if (state.minimized) {
      // apply minimized but preserve savedSize
      G.savedSize = { width: state.width, height: state.height };
      performMinimize(true);
    } else {
      G.isMinimized = false;
      G.overlay.style.resize = "both";
    }
  }

  // Remove overlay cleanly
  function removeOverlay() {
    if (G.overlay) {
      try {
        G.overlay.remove();
      } catch {}
      G.overlay = null;
    }
    G.isMinimized = false;
  }

  // Minimize helper that can be forced (init)
  function performMinimize(init=false) {
    if (!G.overlay) return;
    const overlay = G.overlay;
    const body = overlay.querySelector("#penpal-body");
    if (!G.isMinimized) {
      // go into minimized state: store current size first
      const rect = overlay.getBoundingClientRect();
      G.savedSize = { width: `${Math.round(rect.width)}px`, height: `${Math.round(rect.height)}px` };

      // set to header-only height, keep title visible
      const headerHeight = 44; // px
      overlay.style.height = `${headerHeight}px`;
      overlay.style.width = G.savedSize.width || "160px"; // keep width similar
      body.style.display = "none";
      overlay.style.resize = "none"; // disable resize while minimized
      G.isMinimized = true;
      // update minimize button visual
      const btn = overlay.querySelector("#penpal-minimize");
      if (btn) btn.textContent = "+";
    } else {
      // restore
      const w = (G.savedSize && G.savedSize.width) ? G.savedSize.width : "360px";
      const h = (G.savedSize && G.savedSize.height) ? G.savedSize.height : "220px";
      overlay.style.width = w;
      overlay.style.height = h;
      overlay.querySelector("#penpal-body").style.display = "flex";
      overlay.style.resize = "both";
      G.isMinimized = false;
      const btn = overlay.querySelector("#penpal-minimize");
      if (btn) btn.textContent = "–";
    }
    // persist after minimize/restore (unless initial apply)
    if (!init) saveOverlayRect();
  }

  function toggleMinimize() {
    performMinimize();
  }

  // Toggle overlay (show/hide) — ensures single instance
  function toggleOverlay() {
    // If overlay exists in DOM, remove it (toggle off)
    if (G.overlay && G.overlay.isConnected) {
      removeOverlay();
      return;
    }

    // Else create and attach
    createOverlay();
  }

  // Message listener: external callers use {type: "TOGGLE_PENPAL_OVERLAY"}
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === "TOGGLE_PENPAL_OVERLAY") {
      toggleOverlay();
    }
    // we don't call sendResponse here
  });

  // expose toggle globally (optional) so page-injected scripts can call window.__penpal_global.toggle()
  G.toggle = toggleOverlay;
})();
