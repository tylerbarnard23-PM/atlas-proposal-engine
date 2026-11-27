// Renders the application icon (desktop/assets/icon.png, 512 x 512) from the
// app's own mark (src/app/icon.svg) with Electron's Chromium. Run once when the
// mark changes:  npx electron desktop/scripts/render-icon.cjs
// electron-builder converts the PNG into the Windows .ico.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(root, "src", "app", "icon.svg"), "utf8").replace("<svg ", '<svg width="512" height="512" ');
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true, javascript: false } });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 500));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(root, "desktop", "assets", "icon.png"), image.resize({ width: 512, height: 512 }).toPNG());
  console.log("desktop/assets/icon.png written", image.getSize());
  app.quit();
});
