if (typeof browser === "undefined") {
  var browser = chrome;
}

browser.commands.onCommand.addListener((command) => {
  if (command === "pick-from-webpage") {
    // 向當前活動標籤頁發送訊息，通知 content.js 執行操作
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      browser.tabs.sendMessage(tabs[0].id, { action: "pickColor" });
    });
  }
  
  if (command === "clear-result") {
    // 向當前活動標籤頁發送訊息，通知 content.js 執行操作
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      browser.tabs.sendMessage(tabs[0].id, { action: "clearResult" });
    });
  }
});

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "capture") {
    browser.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true; // Keeps the message channel open for async response
  }
});
