
const COOKIES = [{"name": "SESSDATA", "value": "b8a2c6e5%2C1794622795%2C44b00%2A51CjCvpxDRLe3lV5yzXCjKdJZYIEjAf7oKI1L8CXhXN5ywMH1gvNODm7LlECC-pTH_n0USVkNaczN5a0poZWlNYnVEbTc1SUw4eVBMM21YMGJYYThUUkhKNkpLOVMtZWNMWWRwNE83Q1pGM3hLUzFyMDdiRFVodWdlZWNJNEsxUHk4czI2SXBMVkRBIIEC"}, {"name": "bili_jct", "value": "232d09dd14db8e6c96babd3366b7c24b"}, {"name": "DedeUserID", "value": "3706924277172385"}, {"name": "DedeUserID__ckMd5", "value": "c157753c628965d3"}, {"name": "sid", "value": "gdg350ag"}];
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
  chrome.tabs.create({ url: LIVE_URL, active: true });
}

chrome.runtime.onInstalled.addListener(run);
chrome.runtime.onStartup.addListener(run);
