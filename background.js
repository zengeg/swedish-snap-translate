// Background service worker — handles translation fetch
// to bypass page-level CSP restrictions on content scripts.

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

  // Return true to indicate we will call sendResponse asynchronously
  return true;
});
