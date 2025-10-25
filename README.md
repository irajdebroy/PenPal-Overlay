study overlay assistant


(() => {
  // single global object to avoid duplicate injections
  if (!window.__penpal_global) {
    window.__penpal_global = { overlay: null, isMinimized: false, savedSize: null, initialized: false };
  }
  const G = window.__penpal_global;
  if (G.initialized) return;
  G.initialized = true;

  const STORAGE_KEY = "penpal-overlay";

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  // ---------- Overlay creation (kept robust) ----------
  function createOverlay() {
    if (G.overlay && G.overlay.isConnected) return G.overlay;

    const saved = loadState();
    const startTop = saved.top || "60px";
    const startLeft = saved.left || "60px";
    const startWidth = saved.width || "360px";
    const startHeight = saved.height || "220px";

    const overlay = document.createElement("div");
    overlay.id = "penpal-overlay";
    overlay.innerHTML = `
      <div id="penpal-header" role="toolbar">
        <div id="penpal-title">PenPal AI</div>
        <div id="penpal-controls">
          <button id="penpal-select">Select Content</button>
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
      zIndex: 2147483647,
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

    // header & controls styling (kept concise)
    const header = overlay.querySelector("#penpal-header");
    const title = overlay.querySelector("#penpal-title");
    const controls = overlay.querySelector("#penpal-controls");
    Object.assign(header.style, { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", gap: "8px", cursor: "move" });
    Object.assign(title.style, { fontWeight: "600", color: "white", fontSize: "14px", pointerEvents: "none" });
    Object.assign(controls.style, { display: "flex", gap: "6px", alignItems: "center" });

    // style select button to fit theme
    const selectBtn = overlay.querySelector("#penpal-select");
    Object.assign(selectBtn.style, {
      background: "transparent",
      color: "white",
      border: "1px solid rgba(255,255,255,0.06)",
      padding: "6px 8px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "13px"
    });

    // move other buttons into purple hover
    overlay.querySelectorAll("#penpal-controls button:not(#penpal-select)").forEach(btn => {
      Object.assign(btn.style, { background: "transparent", border: "none", color: "white", fontSize: "16px", cursor: "pointer", width: "28px", height: "28px" });
      btn.addEventListener("mouseenter", () => btn.style.background = "rgba(126,87,194,0.18)");
      btn.addEventListener("mouseleave", () => btn.style.background = "transparent");
    });

    // body/input/send/response styling
    const body = overlay.querySelector("#penpal-body");
    Object.assign(body.style, { padding: "10px", display: "flex", flexDirection: "column", gap: "8px", flex: "1 1 auto", overflow: "auto", backgroundColor: "transparent" });

    const input = overlay.querySelector("#penpal-input");
    Object.assign(input.style, { width: "100%", minHeight: "72px", resize: "none", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", color: "white", padding: "8px", boxSizing: "border-box", fontSize: "13px" });

    const sendBtn = overlay.querySelector("#penpal-send");
    Object.assign(sendBtn.style, { background: "linear-gradient(180deg, #7e57c2, #6a3eb6)", color: "white", border: "none", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", alignSelf: "flex-start" });

    const response = overlay.querySelector("#penpal-response");
    Object.assign(response.style, { background: "rgba(255,255,255,0.02)", borderRadius: "6px", padding: "8px", minHeight: "40px", color: "white", border: "1px solid rgba(255,255,255,0.02)", fontSize: "13px" });

    document.body.appendChild(overlay);
    G.overlay = overlay;

    // dragging, resize save, minimize, close (same robust logic as before)
    let dragging = false, dragOffsetX = 0, dragOffsetY = 0;
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("#penpal-controls")) return; // clicking control -> no drag
      dragging = true;
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
    function onDragEnd() { if (!dragging) return; dragging = false; document.removeEventListener("mousemove", onDrag); document.removeEventListener("mouseup", onDragEnd); saveOverlayRect(); }

    overlay.addEventListener("mouseup", () => { if (!G.isMinimized) saveOverlayRect(); });
    header.addEventListener("dragstart", (e) => e.preventDefault());

    const minimizeBtn = overlay.querySelector("#penpal-minimize");
    const closeBtn = overlay.querySelector("#penpal-close");
    minimizeBtn.addEventListener("click", () => toggleMinimize());
    closeBtn.addEventListener("click", removeOverlay);

    sendBtn.addEventListener("click", () => {
      const txt = input.value.trim();
      if (!txt) return;
      response.textContent = "Thinking...";
      chrome.runtime.sendMessage({ type: "aiQuery", text: txt }, (res) => { response.textContent = res?.result || "No response."; });
    });

    // ---------- Select Content button behavior ----------
    let selecting = false;
    let selectorEl = null;
    let startX = 0, startY = 0, curX = 0, curY = 0;

    const selectBtnEl = overlay.querySelector("#penpal-select");
    selectBtnEl.addEventListener("click", () => {
      if (selecting) return; // already selecting
      startSelectionMode();
    });

    function startSelectionMode() {
      // Guard: do not start if overlay is minimized or multiple active
      if (!G.overlay || G.isMinimized) return;
      selecting = true;

      // Create a full-screen neutral overlay that captures events
      selectorEl = document.createElement("div");
      Object.assign(selectorEl.style, {
        position: "fixed",
        inset: "0",
        zIndex: 2147483646, // just below PenPal overlay
        cursor: "crosshair",
        background: "rgba(0,0,0,0.15)"
      });
      // instruction HUD near top
      const hud = document.createElement("div");
      hud.textContent = "Drag to select area. Press ESC or Cancel to abort.";
      Object.assign(hud.style, { position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)", zIndex: 2147483647, background: "rgba(0,0,0,0.6)", color: "white", padding: "6px 10px", borderRadius: "6px", fontSize: "13px" });

      // cancel button
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      Object.assign(cancelBtn.style, { position: "fixed", top: "12px", right: "12px", zIndex: 2147483647, padding: "6px 10px", background: "#6a3eb6", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" });

      document.body.appendChild(selectorEl);
      document.body.appendChild(hud);
      document.body.appendChild(cancelBtn);

      // rect preview
      const rectPreview = document.createElement("div");
      Object.assign(rectPreview.style, {
        position: "fixed",
        border: "2px dashed rgba(126,87,194,0.95)",
        background: "rgba(126,87,194,0.12)",
        zIndex: 2147483647,
        display: "none",
        pointerEvents: "none"
      });
      document.body.appendChild(rectPreview);

      // listeners
      function onPointerDown(e) {
        // only left button or touch
        if (e.button !== undefined && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        curX = startX;
        curY = startY;
        rectPreview.style.left = `${startX}px`;
        rectPreview.style.top = `${startY}px`;
        rectPreview.style.width = `0px`;
        rectPreview.style.height = `0px`;
        rectPreview.style.display = "block";
        selectorEl.setPointerCapture?.(e.pointerId);
      }

      function onPointerMove(e) {
        if (rectPreview.style.display === "none") return;
        curX = e.clientX; curY = e.clientY;
        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        rectPreview.style.left = `${left}px`;
        rectPreview.style.top = `${top}px`;
        rectPreview.style.width = `${w}px`;
        rectPreview.style.height = `${h}px`;
      }

      function onPointerUp(e) {
        if (rectPreview.style.display === "none") return;
        // finalize rect
        const left = parseInt(rectPreview.style.left, 10);
        const top = parseInt(rectPreview.style.top, 10);
        const w = parseInt(rectPreview.style.width, 10);
        const h = parseInt(rectPreview.style.height, 10);
        // minimal size guard
        if (w < 8 || h < 8) {
          // too small — abort selection
          cleanupSelection();
          alert("Selection too small. Try again.");
          return;
        }
        // proceed to capture visible tab and crop
        finalizeSelection({ left, top, width: w, height: h });
        cleanupSelection();
      }

      function onKeyDown(e) {
        if (e.key === "Escape") {
          cleanupSelection();
        }
      }

      cancelBtn.addEventListener("click", cleanupSelection);
      selectorEl.addEventListener("pointerdown", onPointerDown);
      selectorEl.addEventListener("pointermove", onPointerMove);
      selectorEl.addEventListener("pointerup", onPointerUp);
      selectorEl.addEventListener("pointercancel", cleanupSelection);
      window.addEventListener("keydown", onKeyDown, { capture: true });

      // cleanup routine
      function cleanupSelection() {
        selecting = false;
        rectPreview.remove();
        selectorEl.remove();
        hud.remove();
        cancelBtn.remove();
        selectorEl.removeEventListener("pointerdown", onPointerDown);
        selectorEl.removeEventListener("pointermove", onPointerMove);
        selectorEl.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("keydown", onKeyDown, { capture: true });
      }
    } // end startSelectionMode

// finalize: crop screenshot, show thumbnail, and send to background
async function finalizeSelection(rect) {
  try {
    const capResp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE" }, (resp) => resolve(resp));
    });

    if (!capResp || !capResp.success || !capResp.dataUrl) {
      alert("Failed to capture screen. Make sure extension has permission and the page is not restricted.");
      return;
    }

    const img = new Image();
    img.onload = async () => {
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      const sx = Math.round(rect.left * dpr);
      const sy = Math.round(rect.top * dpr);
      const sw = Math.round(rect.width * dpr);
      const sh = Math.round(rect.height * dpr);
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const cropped = canvas.toDataURL("image/png");

      // 🖼️ Create temporary thumbnail preview
      const thumb = document.createElement("img");
      thumb.src = cropped;
      Object.assign(thumb.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "160px",
        height: "auto",
        border: "2px solid rgba(126,87,194,0.8)",
        borderRadius: "8px",
        boxShadow: "0 0 10px rgba(0,0,0,0.5)",
        zIndex: 2147483647,
        background: "black",
        transition: "opacity 0.5s ease",
      });
      document.body.appendChild(thumb);

      // Auto-fade and remove thumbnail after 5 seconds
      setTimeout(() => {
        thumb.style.opacity = "0";
        setTimeout(() => thumb.remove(), 600);
      }, 5000);

      // 🧠 Send to background AI handler
      const aiResp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "aiImage", image: cropped }, (r) => resolve(r));
      });

      const respEl = G.overlay?.querySelector("#penpal-response");
      if (aiResp && aiResp.success && aiResp.result) {
        if (respEl) respEl.textContent = aiResp.result;
      } else {
        if (respEl) respEl.textContent = aiResp?.error || "AI processing failed.";
      }
    };

    img.onerror = () => {
      alert("Failed to load captured screenshot image.");
    };
    img.src = capResp.dataUrl;
  } catch (err) {
    console.error("finalizeSelection error:", err);
    alert("An error occurred while processing the selection.");
  }
}

    // expose a small indicator while selecting (optional)
    // end of Select Content logic

    // ensure saved minimized state applied
    applySavedState();

    return overlay;
  } // end createOverlay

  // Save current overlay rect to localStorage
  function saveOverlayRect() {
    if (!G.overlay) return;
    const rect = G.overlay.getBoundingClientRect();
    const state = { top: `${Math.round(rect.top)}px`, left: `${Math.round(rect.left)}px`, width: `${Math.round(rect.width)}px`, height: `${Math.round(rect.height)}px`, minimized: !!G.isMinimized };
    saveState(state);
  }
  function applySavedState() {
    const state = loadState();
    if (!G.overlay) return;
    if (state.top) G.overlay.style.top = state.top;
    if (state.left) G.overlay.style.left = state.left;
    if (state.width) G.overlay.style.width = state.width;
    if (state.height) G.overlay.style.height = state.height;
    if (state.minimized) {
      G.savedSize = { width: state.width, height: state.height };
      performMinimize(true);
    } else {
      G.isMinimized = false;
      if (G.overlay) G.overlay.style.resize = "both";
    }
  }
  function removeOverlay() { if (G.overlay) { try { G.overlay.remove(); } catch {} G.overlay = null; } G.isMinimized = false; }

  function performMinimize(init=false) {
    if (!G.overlay) return;
    const overlay = G.overlay;
    const body = overlay.querySelector("#penpal-body");
    if (!G.isMinimized) {
      // store current size
      const rect = overlay.getBoundingClientRect();
      G.savedSize = { width: `${Math.round(rect.width)}px`, height: `${Math.round(rect.height)}px` };
      const headerHeight = 44;
      overlay.style.height = `${headerHeight}px`;
      overlay.style.width = G.savedSize.width || "160px";
      body.style.display = "none";
      overlay.style.resize = "none";
      G.isMinimized = true;
      const btn = overlay.querySelector("#penpal-minimize"); if (btn) btn.textContent = "+";
    } else {
      const w = (G.savedSize && G.savedSize.width) ? G.savedSize.width : "360px";
      const h = (G.savedSize && G.savedSize.height) ? G.savedSize.height : "220px";
      overlay.style.width = w;
      overlay.style.height = h;
      overlay.querySelector("#penpal-body").style.display = "flex";
      overlay.style.resize = "both";
      G.isMinimized = false;
      const btn = overlay.querySelector("#penpal-minimize"); if (btn) btn.textContent = "–";
    }
    if (!init) saveOverlayRect();
  }
  function toggleMinimize() { performMinimize(); }

  function toggleOverlay() {
    if (G.overlay && G.overlay.isConnected) {
      removeOverlay();
      return;
    }
    createOverlay();
  }

  // Listen for background/popup messages
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === "TOGGLE_PENPAL_OVERLAY") toggleOverlay();
  });

  // expose toggle
  G.toggle = toggleOverlay;
})();


