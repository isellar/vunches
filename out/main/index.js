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
  return win;
}
let castWindow = null;
let discoveredDevices = [];
let browser = null;
let activeClient = null;
const CLIENT_ID = "sender-0";
const DEFAULT_APP_ID = "CC1AD845";
const MEDIA_NS = "urn:x-cast:com.google.cast.media";
function startDiscovery() {
  const mdns = require("mdns-js");
  mdns.excludeInterface("0.0.0.0");
  discoveredDevices = [];
  if (browser) {
    try {
      browser.stop();
    } catch {
    }
  }
  browser = mdns.createBrowser("_googlecast._tcp");
  browser.on("ready", () => browser.discover());
  browser.on("update", (data) => {
    if (!data.addresses?.length) return;
    const host = data.addresses[0];
    const port = data.port || 8009;
    const fnTag = data.txt?.find((t) => t.startsWith("fn="));
    const name = fnTag ? fnTag.replace("fn=", "") : data.fullname?.replace("._googlecast._tcp.local", "") || host;
    if (!discoveredDevices.find((d) => d.host === host)) {
      discoveredDevices.push({ name, host, port });
      castWindow?.webContents.send("cast-devices-updated", discoveredDevices);
    }
  });
  browser.on("error", (e) => console.error("mDNS:", e.message));
}
function connectAndPlay({ host, port, url, title }) {
  return new Promise((resolve, reject) => {
    if (activeClient) {
      try {
        activeClient.close();
      } catch {
      }
      activeClient = null;
    }
    const castv2 = require("castv2");
    const client = new castv2.Client();
    activeClient = client;
    client.connect({ host, port: port || 8009 }, () => {
      const mkChan = (ns, dest = "receiver-0") => client.createChannel(CLIENT_ID, dest, ns, "JSON");
      const conn = mkChan("urn:x-cast:com.google.cast.tp.connection");
      const hb = mkChan("urn:x-cast:com.google.cast.tp.heartbeat");
      const recv = mkChan("urn:x-cast:com.google.cast.receiver");
      conn.send({ type: "CONNECT" });
      const hbTimer = setInterval(() => {
        try {
          hb.send({ type: "PING" });
        } catch {
        }
      }, 5e3);
      client._hbTimer = hbTimer;
      let reqId = 1;
      recv.send({ type: "LAUNCH", appId: DEFAULT_APP_ID, requestId: reqId++ });
      recv.on("message", (data) => {
        if (data.type !== "RECEIVER_STATUS") return;
        const app2 = data.status?.applications?.[0];
        if (!app2 || app2.appId !== DEFAULT_APP_ID) return;
        const dest = app2.transportId || app2.sessionId;
        const mconn = mkChan("urn:x-cast:com.google.cast.tp.connection", dest);
        const media = mkChan(MEDIA_NS, dest);
        mconn.send({ type: "CONNECT" });
        media.send({
          type: "LOAD",
          requestId: reqId++,
          sessionId: app2.sessionId,
          media: {
            contentId: url,
            contentType: "video/mp2t",
            streamType: "LIVE",
            metadata: { type: 0, metadataType: 0, title: title || "Vunches" }
          },
          autoplay: true,
          currentTime: 0
        });
        client._media = media;
        client._reqId = reqId;
        media.on("message", (m) => {
          castWindow?.webContents.send("cast-media-status", m);
        });
        resolve({ ok: true });
      });
      recv.on("message", (data) => {
        if (data.type === "LAUNCH_ERROR") {
          clearInterval(hbTimer);
          reject(new Error("Chromecast app launch failed"));
        }
      });
    });
    client.on("error", (e) => {
      clearInterval(client._hbTimer);
      activeClient = null;
      castWindow?.webContents.send("cast-disconnected");
      reject(e);
    });
    client.on("close", () => {
      clearInterval(client._hbTimer);
      activeClient = null;
      castWindow?.webContents.send("cast-disconnected");
    });
  });
}
function registerCastHandlers(win) {
  castWindow = win;
  ipcMain.handle("cast-start-discovery", () => {
    startDiscovery();
    return discoveredDevices;
  });
  ipcMain.handle("cast-stop-discovery", () => {
    if (browser) {
      try {
        browser.stop();
      } catch {
      }
      browser = null;
    }
  });
  ipcMain.handle("cast-get-devices", () => discoveredDevices);
  ipcMain.handle("cast-play", async (_e, opts) => {
    try {
      return await connectAndPlay(opts);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("cast-pause", () => {
    activeClient?._media?.send({ type: "PAUSE", requestId: activeClient._reqId++, mediaSessionId: 1 });
    return true;
  });
  ipcMain.handle("cast-resume", () => {
    activeClient?._media?.send({ type: "PLAY", requestId: activeClient._reqId++, mediaSessionId: 1 });
    return true;
  });
  ipcMain.handle("cast-stop", () => {
    activeClient?._media?.send({ type: "STOP", requestId: activeClient._reqId++, mediaSessionId: 1 });
    try {
      clearInterval(activeClient?._hbTimer);
      activeClient?.close();
    } catch {
    }
    activeClient = null;
    return true;
  });
  ipcMain.handle("cast-set-volume", (_e, level) => {
    if (!activeClient) return false;
    const recv = activeClient.createChannel(CLIENT_ID, "receiver-0", "urn:x-cast:com.google.cast.receiver", "JSON");
    recv.send({ type: "SET_VOLUME", volume: { level: Math.max(0, Math.min(1, level)) }, requestId: 99 });
    return true;
  });
}
app.whenReady().then(async () => {
  await getStore();
  const win = createWindow();
  registerCastHandlers(win);
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
    "--ontop=no",
    "--tls-verify=no"
  ];
  return new Promise((resolve) => {
    const proc = spawn(MPV, args, { detached: true, stdio: ["ignore", "ignore", "pipe"] });
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
      resolve({ launched: false, error: e.message });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) resolve({ launched: true, error: errOut || `exit code ${code}` });
    });
  });
});
ipcMain.handle("fetch-url", (_e, url) => {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? require("https") : require("http");
    const opts = { timeout: 3e4, rejectUnauthorized: false };
    const doRequest = (reqUrl, lib2) => {
      const req = lib2.get(reqUrl, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          return doRequest(loc, loc.startsWith("https") ? require("https") : require("http"));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });
    };
    doRequest(url, lib);
  });
});
