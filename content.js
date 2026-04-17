(() => {
  let bubble = null;
  let pendingTimer = null;
  let enabled = true;

  // Read initial state once
  chrome.storage.local.get("enabled", (data) => {
    enabled = data.enabled !== false;
  });

  // Sync instantly when toggled via icon click
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue;
    }
  });

  // --- Ask background to translate ---
  function translate(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "translate", text }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (resp && resp.ok) resolve(resp.result);
        else reject(new Error(resp ? resp.error : "No response"));
      });
    });
  }

  // --- Read aloud in Swedish ---
  function speak(text) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "sv-SE";
    speechSynthesis.speak(utterance);
  }

  // --- Bubble UI (Shadow DOM isolated) ---
  function createBubble() {
    const el = document.createElement("div");
    el.setAttribute("data-sv-en", "1");
    const shadow = el.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        position: absolute;
        z-index: 2147483647;
        pointer-events: none;
        display: block;
      }
      .bubble {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #1a1a2e;
        background: #ffffffee;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 10px;
        padding: 10px 14px;
        max-width: 380px;
        min-width: 60px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
        pointer-events: auto;
        animation: fadeIn 0.18s ease-out;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .bubble.dark {
        color: #e8e8f0;
        background: #1a1a2eee;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .translation { font-size: 14px; }
      .loading {
        display: inline-block;
        width: 16px; height: 16px;
        border: 2px solid rgba(0,0,0,0.1);
        border-top-color: #006aa7;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      .dark .loading {
        border-color: rgba(255,255,255,0.1);
        border-top-color: #fecc02;
      }
      .error { color: #c0392b; font-style: italic; font-size: 13px; }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(6px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `;
    shadow.appendChild(style);

    const container = document.createElement("div");
    container.className = "bubble";
    shadow.appendChild(container);

    document.documentElement.appendChild(el);
    return { host: el, container };
  }

  function isDarkBackground() {
    try {
      const bg = window.getComputedStyle(document.body).backgroundColor;
      const m = bg.match(/\d+/g);
      if (!m) return false;
      const [r, g, b] = m.map(Number);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
    } catch {
      return false;
    }
  }

  function showBubble(x, y, html) {
    removeBubble();
    const { host, container } = createBubble();
    bubble = host;

    if (isDarkBackground()) container.classList.add("dark");
    container.innerHTML = html;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    host.style.left = "0px";
    host.style.top = "0px";
    host.style.visibility = "hidden";

    requestAnimationFrame(() => {
      const rect = host.getBoundingClientRect();
      let left = x + scrollX - rect.width / 2;
      let top = y + scrollY + 12;

      const vw = document.documentElement.clientWidth;
      if (left < scrollX + 8) left = scrollX + 8;
      if (left + rect.width > scrollX + vw - 8) left = scrollX + vw - 8 - rect.width;

      host.style.left = left + "px";
      host.style.top = top + "px";
      host.style.visibility = "visible";
    });
  }

  function removeBubble() {
    if (bubble) {
      bubble.remove();
      bubble = null;
    }
  }

  function cancelPending() {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // --- Main: select text → translate + speak (only when enabled) ---
  document.addEventListener("mouseup", (e) => {
    if (bubble && bubble.contains(e.target)) return;
    cancelPending();

    pendingTimer = setTimeout(async () => {
      if (!enabled) return;

      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (!text || text.length < 2 || text.length > 5000) return;

      let range;
      try { range = sel.getRangeAt(0); } catch { return; }
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) return;

      const x = rect.left + rect.width / 2;
      const y = rect.bottom;

      speak(text);

      showBubble(x, y, `<div class="loading"></div>`);

      try {
        const result = await translate(text);
        if (!bubble) return;
        showBubble(x, y, `<div class="translation">${escapeHtml(result)}</div>`);
      } catch (err) {
        if (!bubble) return;
        showBubble(x, y, `<div class="error">Translation failed</div>`);
      }
    }, 300);
  });

  document.addEventListener("mousedown", (e) => {
    if (bubble && !bubble.contains(e.target)) removeBubble();
    cancelPending();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { removeBubble(); cancelPending(); }
  });
})();
