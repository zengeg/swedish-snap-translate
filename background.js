// --- Toggle: click extension icon to enable/disable ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true });
  updateBadge(true);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get("enabled", (data) => {
    updateBadge(data.enabled !== false);
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get("enabled", (data) => {
    const newState = !data.enabled;
    chrome.storage.local.set({ enabled: newState });
    updateBadge(newState);
  });
});

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({
    color: enabled ? "#006aa7" : "#999999",
  });
}

// --- Translation relay (bypass page CSP) ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "translate") return false;

  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "sv");
  url.searchParams.set("tl", "en");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", request.text);

  fetch(url.toString())
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      const translated = data[0].map((seg) => seg[0]).join("");
      sendResponse({ ok: true, result: translated });
    })
    .catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });

  return true;
});
