
const COOKIES = [{"name": "SESSDATA", "value": "4a567ee1%2C1794668920%2Cb6f4b%2A51CjD-1nqcivfP8H3fwy-r81tuxGQSvbcpWfjXJL1F8O7BOQopUaN_1g06zaeR3wNmXakSVjM5ZnB6aDN6Vi1TM1V5TXc3Sk9ycDdtbHJMRE94MmRrMndodVJMS3lYYzROMS1XWWJmWjlhbURkYXlYdTdWN3FnLTRPTlBoUTktNFB4WnFBWmhsdW1BIIEC"}, {"name": "bili_jct", "value": "bc83e0d5f16cd1ea364ebb11d0a402f3"}, {"name": "DedeUserID", "value": "3546913758513407"}, {"name": "DedeUserID__ckMd5", "value": "6af8731041481d07"}, {"name": "sid", "value": "hbp2f9ca"}];
const BASE_URL = "https://www.bilibili.com/";
const LIVE_URL = "https://live.bilibili.com/25528268?live_from=86001&spm_id_from=444.8.real_browser.0";
const EXPIRATION = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;

function setCookie(item) {
  return new Promise((resolve) => {
    chrome.cookies.set({
      url: "https://www.bilibili.com/",
      domain: ".bilibili.com",
      path: "/",
      name: item.name,
      value: item.value,
      secure: true,
      expirationDate: EXPIRATION
    }, () => resolve(chrome.runtime.lastError ? chrome.runtime.lastError.message : "ok"));
  });
}

async function run() {
  for (const item of COOKIES) {
    await setCookie(item);
  }
  const tabs = await chrome.tabs.query({});
  const first = tabs.find((tab) => tab.url === "about:blank" || (tab.url || "").startsWith("https://www.bilibili.com")) || tabs[0];
  if (first && first.id) {
    await chrome.tabs.update(first.id, { url: BASE_URL, active: true });
    setTimeout(() => chrome.tabs.reload(first.id), 1200);
    setTimeout(() => chrome.tabs.update(first.id, { url: LIVE_URL, active: true }), 3600);
  } else {
    const tab = await chrome.tabs.create({ url: BASE_URL, active: true });
    setTimeout(() => chrome.tabs.reload(tab.id), 1200);
    setTimeout(() => chrome.tabs.update(tab.id, { url: LIVE_URL, active: true }), 3600);
  }
}

chrome.runtime.onInstalled.addListener(run);
chrome.runtime.onStartup.addListener(run);
run();
