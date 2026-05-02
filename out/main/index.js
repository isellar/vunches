"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const { app, BrowserWindow, ipcMain } = require("electron");
const { join } = require("path");
const { spawn } = require("child_process");
let store;
async function getStore() {
  if (!store) {
    const { default: Store } = await import("electron-store");
    store = new Store();
  }
  return store;
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f0f0f",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0f0f0f",
      symbolColor: "#ffffff",
      height: 40
    },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(async () => {
  await getStore();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
ipcMain.handle("store-get", async (_e, key) => {
  const s = await getStore();
  return s.get(key);
});
ipcMain.handle("store-set", async (_e, key, value) => {
  const s = await getStore();
  s.set(key, value);
});
ipcMain.handle("store-delete", async (_e, key) => {
  const s = await getStore();
  s.delete(key);
});
ipcMain.handle("play-stream", (_e, url, channelName) => {
  const MPV = "C:\\Program Files\\MPV Player\\mpv.exe";
  const args = [
    url,
    `--title=${channelName || "Vunches"}`,
    "--cache=yes",
    "--cache-secs=10",
    "--demuxer-max-bytes=50MiB",
    "--hwdec=auto",
    "--force-window=immediate",
    "--ontop=no"
  ];
  return new Promise((resolve) => {
    const proc = spawn(MPV, args, {
      detached: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let errOut = "";
    proc.stderr.on("data", (d) => {
      errOut += d.toString();
    });
    const timer = setTimeout(() => {
      proc.stderr.destroy();
      proc.unref();
      resolve({ launched: true });
    }, 3e3);
    proc.on("error", (e) => {
      clearTimeout(timer);
      console.error("mpv spawn error:", e.message);
      resolve({ launched: false, error: e.message });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error("mpv exited with code", code, errOut);
        resolve({ launched: true, error: errOut || `exit code ${code}` });
      }
    });
  });
});
ipcMain.handle("fetch-url", async (_e, url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text;
});
