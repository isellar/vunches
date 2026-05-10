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
const os = require("os");
const dgram = require("dgram");
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
    titleBarOverlay: { color: "#0f0f0f", symbolColor: "#ffffff", height: 36 },
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
const MDNS_ADDR = "224.0.0.251";
const MDNS_PORT = 5353;
const CAST_QUERY = Buffer.from([
  0,
  0,
  // ID: 0
  0,
  0,
  // Flags: standard query
  0,
  1,
  // QDCOUNT: 1
  0,
  0,
  0,
  0,
  0,
  0,
  // ANCOUNT, NSCOUNT, ARCOUNT
  // QNAME: _googlecast._tcp.local
  11,
  95,
  103,
  111,
  111,
  103,
  108,
  101,
  99,
  97,
  115,
  116,
  // _googlecast
  4,
  95,
  116,
  99,
  112,
  // _tcp
  5,
  108,
  111,
  99,
  97,
  108,
  // local
  0,
  // root
  0,
  12,
  // QTYPE: PTR
  0,
  1
  // QCLASS: IN
]);
let mdnsSocket = null;
let discoveredDevices = [];
let castWindow = null;
let discoveryInterval = null;
function getLocalInterfaces() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4") addrs.push(iface.address);
    }
  }
  return addrs;
}
let _cachedLocalIPs = null;
let _localIPsTime = 0;
function _localIPs() {
  const now = Date.now();
  if (!_cachedLocalIPs || now - _localIPsTime > 3e4) {
    _cachedLocalIPs = getLocalInterfaces();
    _localIPsTime = now;
  }
  return _cachedLocalIPs;
}
function parseDnsTxtRecords(msg) {
  const result = {};
  const known = ["fn=", "id=", "md=", "rs=", "ve=", "ca=", "st=", "bs=", "nf="];
  for (let i = 0; i < msg.length - 3; i++) {
    for (const key of known) {
      if (i + key.length > msg.length) continue;
      const chunk = msg.slice(i, i + key.length).toString("utf8");
      if (chunk === key) {
        let end = i + key.length;
        while (end < msg.length && msg[end] !== 0 && (msg[end] >= 32 || msg[end] === 9)) {
          end++;
        }
        const val = msg.slice(i + key.length, end).toString("utf8").trim();
        if (val) result[key.slice(0, -1)] = val;
        break;
      }
    }
  }
  return result;
}
function startDiscovery(win) {
  castWindow = win;
  discoveredDevices = [];
  if (mdnsSocket) {
    if (Array.isArray(mdnsSocket)) {
      mdnsSocket.forEach((s) => {
        try {
          s.close();
        } catch {
        }
      });
    } else {
      try {
        mdnsSocket.close();
      } catch {
      }
    }
    mdnsSocket = null;
  }
  if (discoveryInterval) {
    clearInterval(discoveryInterval);
    discoveryInterval = null;
  }
  const localIPs = _localIPs();
  const bindAddrs = getLocalInterfaces().filter(
    (ip) => !ip.startsWith("127.") && !ip.startsWith("172.") && // WSL2/Docker/Hyper-V virtual switches
    !ip.startsWith("10.5.")
    // NordVPN / other VPN ranges
  );
  if (!bindAddrs.length) {
    bindAddrs.push(...getLocalInterfaces().filter((ip) => !ip.startsWith("127.")));
  }
  console.log("mDNS binding on:", bindAddrs);
  const sockets = [];
  mdnsSocket = sockets;
  function handleMessage(msg, rinfo) {
    const srcIp = rinfo.address;
    if (localIPs.includes(srcIp)) return;
    if (discoveredDevices.find((d) => d.host === srcIp)) return;
    const txt = parseDnsTxtRecords(msg);
    const name = txt.fn || txt.md || null;
    if (!name) {
      probeChromecast(srcIp, `Device (${srcIp})`);
      return;
    }
    addDevice(srcIp, name);
  }
  function addDevice(ip, name) {
    if (discoveredDevices.find((d) => d.host === ip)) return;
    discoveredDevices.push({ name, host: ip, port: 8009 });
    console.log("Discovered:", name, ip);
    castWindow?.webContents.send("cast-devices-updated", discoveredDevices);
  }
  function probeChromecast(ip, fallbackName) {
    if (discoveredDevices.find((d) => d.host === ip)) return;
    const net = require("net");
    const sock = net.createConnection({ host: ip, port: 8009, timeout: 1500 });
    sock.on("connect", () => {
      sock.destroy();
      fetchChromecastInfo(ip, fallbackName);
    });
    sock.on("error", () => {
    });
    sock.on("timeout", () => sock.destroy());
  }
  function fetchChromecastInfo(ip, fallbackName) {
    if (discoveredDevices.find((d) => d.host === ip)) return;
    const http = require("http");
    const req = http.get(`http://${ip}:8008/setup/eureka_info?options=detail`, { timeout: 2e3 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const info = JSON.parse(Buffer.concat(chunks).toString());
          const name = info.name || info.device_info?.name || fallbackName;
          addDevice(ip, name);
        } catch {
          addDevice(ip, fallbackName);
        }
      });
    });
    req.on("error", () => addDevice(ip, fallbackName));
    req.on("timeout", () => {
      req.destroy();
      addDevice(ip, fallbackName);
    });
  }
  bindAddrs.forEach((bindAddr) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    sockets.push(sock);
    sock.on("error", (e) => console.error("mDNS error on", bindAddr, e.message));
    sock.on("message", handleMessage);
    sock.bind(MDNS_PORT, () => {
      try {
        sock.addMembership(MDNS_ADDR, bindAddr);
      } catch {
      }
      sock.send(CAST_QUERY, MDNS_PORT, MDNS_ADDR);
    });
  });
  const sendQuery = () => {
    sockets.forEach((sock) => {
      try {
        sock.send(CAST_QUERY, MDNS_PORT, MDNS_ADDR);
      } catch {
      }
    });
  };
  const lanAddr = bindAddrs.find((ip) => ip.startsWith("192.168."));
  if (lanAddr) {
    const subnet = lanAddr.split(".").slice(0, 3).join(".");
    setTimeout(() => {
      for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`;
        if (!localIPs.includes(ip)) probeChromecast(ip, `Chromecast (${ip})`);
      }
    }, 2e3);
  }
  sendQuery();
  discoveryInterval = setInterval(sendQuery, 1e4);
}
function stopDiscovery() {
  if (discoveryInterval) {
    clearInterval(discoveryInterval);
    discoveryInterval = null;
  }
  if (mdnsSocket) {
    const socks = Array.isArray(mdnsSocket) ? mdnsSocket : [mdnsSocket];
    socks.forEach((s) => {
      try {
        s.close();
      } catch {
      }
    });
    mdnsSocket = null;
  }
}
let proxyServer = null;
let proxyPort = null;
let proxyStreamUrl = null;
function getLocalLanIp() {
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && iface.address.startsWith("192.168.")) {
        return iface.address;
      }
    }
  }
  return null;
}
function startStreamProxy(streamUrl) {
  return new Promise((resolve, reject) => {
    if (proxyServer && proxyStreamUrl === streamUrl && proxyPort) {
      const lanIp = getLocalLanIp();
      return resolve(lanIp ? `http://${lanIp}:${proxyPort}/stream` : null);
    }
    if (proxyServer) {
      try {
        proxyServer.close();
      } catch {
      }
      proxyServer = null;
      proxyPort = null;
    }
    proxyStreamUrl = streamUrl;
    const http = require("http");
    const https = require("https");
    const server = http.createServer((req, res) => {
      if (req.url !== "/stream") {
        res.writeHead(404);
        res.end();
        return;
      }
      console.log("Proxy: Chromecast fetching stream from", streamUrl.slice(0, 80));
      const lib = streamUrl.startsWith("https") ? https : http;
      const upstream = lib.get(streamUrl, { rejectUnauthorized: false, timeout: 15e3 }, (upstream2) => {
        const ct = upstream2.headers["content-type"] || "video/mp2t";
        res.writeHead(upstream2.statusCode || 200, {
          "Content-Type": ct,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
          "Transfer-Encoding": "chunked"
        });
        upstream2.pipe(res);
        res.on("close", () => upstream2.destroy());
      });
      upstream.on("error", (e) => {
        console.error("Proxy upstream error:", e.message);
        res.writeHead(502);
        res.end();
      });
    });
    server.listen(0, "0.0.0.0", () => {
      proxyPort = server.address().port;
      proxyServer = server;
      const lanIp = getLocalLanIp();
      console.log("Proxy server listening on port", proxyPort, "| LAN IP:", lanIp);
      const { exec } = require("child_process");
      exec(
        `netsh advfirewall firewall add rule name="Vunches Stream Proxy" dir=in action=allow protocol=TCP localport=${proxyPort}`,
        (err) => {
          if (err) console.warn("Firewall rule add failed (may need admin):", err.message);
        }
      );
      if (!lanIp) {
        console.warn("Proxy: could not determine LAN IP — falling back to direct URL");
        server.close();
        return resolve(null);
      }
      const proxyUrl = `http://${lanIp}:${proxyPort}/stream`;
      console.log("Stream proxy started:", proxyUrl, "→", streamUrl.slice(0, 80));
      resolve(proxyUrl);
    });
    server.on("error", (e) => {
      console.error("Proxy server error:", e.message);
      resolve(null);
    });
  });
}
function stopStreamProxy() {
  if (proxyServer) {
    try {
      proxyServer.close();
    } catch {
    }
    const { exec } = require("child_process");
    exec('netsh advfirewall firewall delete rule name="Vunches Stream Proxy"', () => {
    });
    proxyServer = null;
    proxyPort = null;
    proxyStreamUrl = null;
  }
}
const CLIENT_ID = "sender-0";
const DEFAULT_APP_ID = "CC1AD845";
const MEDIA_NS = "urn:x-cast:com.google.cast.media";
const RECEIVER_NS = "urn:x-cast:com.google.cast.receiver";
const CONN_NS = "urn:x-cast:com.google.cast.tp.connection";
const HB_NS = "urn:x-cast:com.google.cast.tp.heartbeat";
let activeClient = null;
let reconnectTimer = null;
let currentCastOpts = null;
function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}
let hasPlayedSuccessfully = false;
function connectAndPlay(opts) {
  clearReconnect();
  if (activeClient) {
    try {
      activeClient.close();
    } catch {
    }
    activeClient = null;
  }
  currentCastOpts = opts;
  hasPlayedSuccessfully = false;
  return _connect(opts);
}
function detectStreamType(url) {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8") || lower.includes("type=m3u") || lower.includes("output=hls")) {
    return Promise.resolve({ contentType: "application/x-mpegurl", streamType: "LIVE" });
  }
  if (lower.includes(".mp4") || lower.includes("output=mp4")) {
    return Promise.resolve({ contentType: "video/mp4", streamType: "BUFFERED" });
  }
  if (lower.includes(".ts") || lower.includes("output=ts") || lower.includes("type=ts")) {
    return Promise.resolve({ contentType: "video/mp2t", streamType: "LIVE" });
  }
  const fallback = { contentType: "video/mp2t", streamType: "LIVE" };
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith("https") ? require("https") : require("http");
      const req = lib.request(url, {
        method: "GET",
        timeout: 4e3,
        rejectUnauthorized: false,
        headers: { Range: "bytes=0-512" }
      }, (res) => {
        const ct = (res.headers["content-type"] || "").toLowerCase();
        res.destroy();
        if (ct.includes("mpegurl") || ct.includes("x-mpegurl")) {
          resolve({ contentType: "application/x-mpegurl", streamType: "LIVE" });
        } else if (ct.includes("mp4")) {
          resolve({ contentType: "video/mp4", streamType: "BUFFERED" });
        } else {
          resolve(fallback);
        }
      });
      req.on("error", () => resolve(fallback));
      req.on("timeout", () => {
        req.destroy();
        resolve(fallback);
      });
      req.end();
    } catch {
      resolve(fallback);
    }
  });
}
function _connect({ host, port, url, title, aggressive }) {
  return new Promise(async (resolve, reject) => {
    if (activeClient) {
      clearReconnect();
      try {
        activeClient.close();
      } catch {
      }
      activeClient = null;
    }
    const proxyUrl = await startStreamProxy(url);
    const castUrl = proxyUrl || url;
    console.log("Cast URL:", proxyUrl ? `proxy → ${proxyUrl}` : `direct → ${url.slice(0, 80)}`);
    const { contentType, streamType } = await detectStreamType(url);
    console.log("Cast stream type:", contentType, streamType);
    const castv2 = require("castv2");
    const client = new castv2.Client();
    activeClient = client;
    const timeout = setTimeout(() => {
      reject(new Error("Connection timed out"));
      try {
        client.close();
      } catch {
      }
    }, 2e4);
    client.connect({ host, port: port || 8009 }, () => {
      const mkChan = (ns, dest = "receiver-0") => client.createChannel(CLIENT_ID, dest, ns, "JSON");
      const conn = mkChan(CONN_NS);
      const hb = mkChan(HB_NS);
      const recv = mkChan(RECEIVER_NS);
      conn.send({ type: "CONNECT" });
      const hbTimer = setInterval(() => {
        try {
          hb.send({ type: "PING" });
        } catch {
        }
      }, 5e3);
      client._hbTimer = hbTimer;
      let reqId = 1;
      let appLaunched = false;
      recv.send({ type: "LAUNCH", appId: DEFAULT_APP_ID, requestId: reqId++ });
      recv.on("message", (data) => {
        console.log("Receiver msg:", data.type, data.status?.applications?.[0]?.statusText);
        if (data.type === "LAUNCH_ERROR") {
          clearTimeout(timeout);
          reject(new Error("Chromecast app failed to launch"));
          return;
        }
        if (data.type !== "RECEIVER_STATUS") return;
        const appInfo = data.status?.applications?.[0];
        if (!appInfo || appInfo.appId !== DEFAULT_APP_ID || appLaunched) return;
        appLaunched = true;
        const dest = appInfo.transportId || appInfo.sessionId;
        console.log("App launched, transport:", dest);
        const mconn = mkChan(CONN_NS, dest);
        const media = mkChan(MEDIA_NS, dest);
        mconn.send({ type: "CONNECT" });
        setTimeout(() => {
          const loadReqId = reqId++;
          console.log("Sending LOAD, contentType:", contentType, "url:", castUrl.slice(0, 80));
          media.send({
            type: "LOAD",
            requestId: loadReqId,
            sessionId: appInfo.sessionId,
            media: {
              contentId: castUrl,
              contentType: "video/mp2t",
              // proxy always serves raw TS
              streamType: "LIVE",
              metadata: { type: 0, metadataType: 0, title: title || "Vunches" }
            },
            autoplay: true,
            currentTime: 0
          });
        }, 500);
        client._media = media;
        client._recv = recv;
        client._reqId = reqId;
        let loadResolved = false;
        media.on("message", (m) => {
          console.log("Media msg:", m.type, m.status?.[0]?.playerState, m.status?.[0]?.idleReason, m.detailedErrorCode || "");
          castWindow?.webContents.send("cast-media-status", m);
          if (!loadResolved && m.type === "LOAD_FAILED") {
            loadResolved = true;
            clearTimeout(timeout);
            currentCastOpts = null;
            reject(new Error("Stream could not be loaded by the Chromecast. The TV may not be able to reach this URL directly."));
            return;
          }
          if (!loadResolved && m.type === "MEDIA_STATUS" && m.status?.[0]) {
            const ps = m.status[0].playerState;
            if (ps === "PLAYING" || ps === "BUFFERING" || ps === "PAUSED") {
              loadResolved = true;
              hasPlayedSuccessfully = true;
              clearTimeout(timeout);
              resolve({ ok: true });
            } else if (ps === "IDLE" && m.status[0].idleReason === "ERROR") {
              loadResolved = true;
              clearTimeout(timeout);
              currentCastOpts = null;
              reject(new Error("Stream failed to load on the Chromecast. The TV may not be able to reach this stream URL directly."));
            }
          }
        });
      });
    });
    client.on("error", (e) => {
      clearTimeout(timeout);
      clearInterval(client._hbTimer);
      activeClient = null;
      console.error("Cast client error:", e.message);
      castWindow?.webContents.send("cast-error", e.message);
      if (hasPlayedSuccessfully) {
        _handleDisconnect();
      } else {
        currentCastOpts = null;
        reject(e);
      }
    });
    client.on("close", () => {
      clearInterval(client._hbTimer);
      if (activeClient === client) activeClient = null;
      castWindow?.webContents.send("cast-disconnected");
      if (hasPlayedSuccessfully) {
        _handleDisconnect();
      } else {
        currentCastOpts = null;
      }
    });
  });
}
function _handleDisconnect() {
  clearReconnect();
  if (!currentCastOpts) return;
  if (!currentCastOpts.aggressive) {
    currentCastOpts = null;
    return;
  }
  console.log("Cast disconnected — reconnecting in 3s (aggressive mode)");
  castWindow?.webContents.send("cast-reconnecting");
  reconnectTimer = setTimeout(() => {
    if (!currentCastOpts) return;
    _connect(currentCastOpts).then(() => castWindow?.webContents.send("cast-reconnected")).catch((e) => {
      castWindow?.webContents.send("cast-error", e.message);
      _handleDisconnect();
    });
  }, 3e3);
}
function sendMediaCmd(type, extra = {}) {
  if (!activeClient?._media) return false;
  activeClient._media.send({ type, requestId: activeClient._reqId++, mediaSessionId: 1, ...extra });
  return true;
}
function stopCast() {
  currentCastOpts = null;
  hasPlayedSuccessfully = false;
  clearReconnect();
  stopStreamProxy();
  sendMediaCmd("STOP");
  try {
    clearInterval(activeClient?._hbTimer);
    activeClient?.close();
  } catch {
  }
  activeClient = null;
}
function registerHandlers(win) {
  castWindow = win;
  ipcMain.handle("cast-start-discovery", () => {
    startDiscovery(win);
    return discoveredDevices;
  });
  ipcMain.handle("cast-stop-discovery", () => stopDiscovery());
  ipcMain.handle("cast-get-devices", () => discoveredDevices);
  ipcMain.handle("cast-play", async (_e, opts) => {
    try {
      await connectAndPlay(opts);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("cast-pause", () => sendMediaCmd("PAUSE"));
  ipcMain.handle("cast-resume", () => sendMediaCmd("PLAY"));
  ipcMain.handle("cast-stop", () => {
    stopCast();
    return true;
  });
  ipcMain.handle("cast-set-volume", (_e, level) => {
    if (!activeClient) return false;
    const recv = activeClient.createChannel(CLIENT_ID, "receiver-0", RECEIVER_NS, "JSON");
    recv.send({ type: "SET_VOLUME", volume: { level: Math.max(0, Math.min(1, level)) }, requestId: 99 });
    return true;
  });
}
app.whenReady().then(async () => {
  await getStore();
  const win = createWindow();
  registerHandlers(win);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  stopDiscovery();
  stopCast();
  stopStreamProxy();
  if (process.platform !== "darwin") app.quit();
});
ipcMain.handle("store-get", async (_e, k) => {
  const s = await getStore();
  return s.get(k);
});
ipcMain.handle("store-set", async (_e, k, v) => {
  const s = await getStore();
  s.set(k, v);
});
ipcMain.handle("store-delete", async (_e, k) => {
  const s = await getStore();
  s.delete(k);
});
ipcMain.handle("xtream-fetch", async (_e, { host, username, password, action }) => {
  const baseUrl = host.replace(/\/$/, "");
  const url = `${baseUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}`;
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? require("https") : require("http");
    const req = lib.get(url, { timeout: 3e4, rejectUnauthorized: false }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new Error("Invalid JSON response from server"));
        }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
});
ipcMain.handle("xtream-get-stream-url", (_e, { host, username, password, streamId, streamType }) => {
  const base = host.replace(/\/$/, "");
  const ext = streamType === "live" ? "ts" : "mp4";
  return `${base}/${streamType}/${username}/${password}/${streamId}.${ext}`;
});
ipcMain.handle("export-data", async (event) => {
  const { dialog } = require("electron");
  const fs = require("fs");
  const win = BrowserWindow.fromWebContents(event.sender);
  const s = await getStore();
  const data = {
    version: 1,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    sources: s.get("sources") || [],
    favorites: s.get("favorites") || [],
    epgUrl: s.get("epgUrl") || "",
    selectedDevice: s.get("selectedDevice") || null,
    aggressiveReconnect: s.get("aggressiveReconnect") || false
  };
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: "Export Vunches Settings",
    defaultPath: `vunches-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { ok: true, filePath };
});
ipcMain.handle("import-data", async (event) => {
  const { dialog } = require("electron");
  const fs = require("fs");
  const win = BrowserWindow.fromWebContents(event.sender);
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: "Import Vunches Settings",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (canceled || !filePaths.length) return { ok: false };
  try {
    const raw = fs.readFileSync(filePaths[0], "utf8");
    const data = JSON.parse(raw);
    if (!data.version) throw new Error("Invalid backup file");
    const s = await getStore();
    if (data.sources?.length) s.set("sources", data.sources);
    if (data.favorites?.length) s.set("favorites", data.favorites);
    if (data.epgUrl) s.set("epgUrl", data.epgUrl);
    if (data.selectedDevice) s.set("selectedDevice", data.selectedDevice);
    if (data.aggressiveReconnect != null) s.set("aggressiveReconnect", data.aggressiveReconnect);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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
ipcMain.handle("detect-epg-url", async (_e, m3uUrl) => {
  const probe = (url) => new Promise((resolve) => {
    try {
      const lib = url.startsWith("https") ? require("https") : require("http");
      const req = lib.request(url, { method: "HEAD", timeout: 5e3, rejectUnauthorized: false }, (res) => {
        const ct = res.headers["content-type"] || "";
        const ok = res.statusCode >= 200 && res.statusCode < 300 && (ct.includes("xml") || ct.includes("gzip") || ct.includes("octet") || url.endsWith(".gz"));
        resolve(ok ? url : null);
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
  const candidates = [];
  if (m3uUrl.includes("get.php")) {
    const xmltvUrl = m3uUrl.replace("get.php", "xmltv.php").replace(/&type=[^&]*/g, "").replace(/&output=[^&]*/g, "");
    candidates.push(xmltvUrl);
  }
  const bare = m3uUrl.replace(/\?.*$/, "");
  const base = bare.replace(/\/(get|playlist|channels|live|index)\.m3u[^/]*/i, "");
  candidates.push(
    bare.replace(/\.m3u[^?]*$/i, ".xml"),
    bare.replace(/\.m3u[^?]*$/i, ".xml.gz"),
    base + "/epg.xml.gz",
    base + "/epg.xml",
    base + "/xmltv.php"
  );
  const results = await Promise.all(candidates.map(probe));
  const found = results.find((r) => r !== null) || null;
  return found;
});
ipcMain.handle("fetch-url", (_e, url) => {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? require("https") : require("http");
    const doReq = (u, l) => {
      const req = l.get(u, { timeout: 3e4, rejectUnauthorized: false }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          return doReq(loc, loc.startsWith("https") ? require("https") : require("http"));
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
    doReq(url, lib);
  });
});
function parseM3uIncremental(text) {
  const channels = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF")) {
      i++;
      continue;
    }
    const tvgId = line.match(/tvg-id="([^"]*)"/)?.[1] || "";
    const tvgName = line.match(/tvg-name="([^"]*)"/)?.[1] || "";
    const tvgLogo = line.match(/tvg-logo="([^"]*)"/)?.[1] || "";
    const groupTitle = line.match(/group-title="([^"]*)"/)?.[1] || "";
    const commaIdx = line.lastIndexOf(",");
    const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : tvgName || "Unknown";
    let url = "";
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (next && !next.startsWith("#")) {
        url = next;
        i = j;
        break;
      }
    }
    if (url) {
      channels.push({
        id: `${tvgId || name}-${url}`,
        name: name || tvgName || "Unknown Channel",
        url,
        tvgId,
        tvgLogo,
        group: { title: groupTitle }
      });
    }
    i++;
  }
  return channels;
}
ipcMain.handle("load-playlist", (event, url) => {
  const path = require("path");
  const fs = require("fs");
  const win = BrowserWindow.fromWebContents(event.sender);
  const cacheDir = app.getPath("userData");
  const cacheFile = path.join(cacheDir, "playlist-cache.json");
  const metaFile = path.join(cacheDir, "playlist-meta.json");
  const sendProgress = (data) => {
    try {
      win?.webContents.send("playlist-progress", data);
    } catch {
    }
  };
  return new Promise((resolve, reject) => {
    let cachedMeta = null;
    try {
      cachedMeta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    } catch {
    }
    const lib = url.startsWith("https") ? require("https") : require("http");
    const doReq = (reqUrl, reqLib) => {
      const reqOpts = {
        timeout: 6e4,
        rejectUnauthorized: false,
        headers: cachedMeta?.etag ? { "If-None-Match": cachedMeta.etag } : {}
      };
      const req = reqLib.get(reqUrl, reqOpts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          return doReq(loc, loc.startsWith("https") ? require("https") : require("http"));
        }
        if (res.statusCode === 304 && cachedMeta) {
          sendProgress({ stage: "cache", message: "Using cached playlist" });
          try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
            sendProgress({ stage: "done", channelCount: cached.length, tvgUrl: cachedMeta.tvgUrl || null });
            return resolve({ channels: cached, tvgUrl: cachedMeta.tvgUrl || null });
          } catch {
          }
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        const etag = res.headers["etag"] || null;
        let receivedBytes = 0;
        let buffer = "";
        let channelCount = 0;
        const chunks = [];
        sendProgress({ stage: "downloading", receivedBytes: 0, totalBytes, channelCount: 0 });
        res.on("data", (chunk) => {
          chunks.push(chunk);
          receivedBytes += chunk.length;
          buffer += chunk.toString("utf8");
          const matches = buffer.match(/#EXTINF/g);
          const newCount = matches ? matches.length : 0;
          if (newCount !== channelCount) {
            channelCount = newCount;
            sendProgress({ stage: "downloading", receivedBytes, totalBytes, channelCount });
          }
          if (buffer.length > 1e5) buffer = buffer.slice(-2e3);
        });
        res.on("end", () => {
          sendProgress({ stage: "parsing", receivedBytes, totalBytes, channelCount });
          const fullText = Buffer.concat(chunks).toString("utf8");
          const headerSnip = fullText.slice(0, 2e3);
          const tvgUrl = headerSnip.match(/x-tvg-url="([^"]+)"/i)?.[1] || headerSnip.match(/url-tvg="([^"]+)"/i)?.[1] || null;
          setImmediate(() => {
            try {
              const channels = parseM3uIncremental(fullText);
              sendProgress({ stage: "done", channelCount: channels.length, tvgUrl });
              try {
                fs.writeFileSync(cacheFile, JSON.stringify(channels));
                fs.writeFileSync(metaFile, JSON.stringify({ etag, url, cachedAt: Date.now(), tvgUrl }));
              } catch {
              }
              resolve({ channels, tvgUrl });
            } catch (e) {
              reject(e);
            }
          });
        });
        res.on("error", reject);
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });
    };
    if (cachedMeta?.url === url) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        if (cached?.length > 0) {
          sendProgress({ stage: "cache", message: `Loaded ${cached.length.toLocaleString()} channels from cache`, channelCount: cached.length, tvgUrl: cachedMeta.tvgUrl || null });
          resolve({ channels: cached, tvgUrl: cachedMeta.tvgUrl || null });
          setTimeout(() => {
            try {
              doReq(url, lib);
            } catch {
            }
          }, 1e3);
          return;
        }
      } catch {
      }
    }
    doReq(url, lib);
  });
});
ipcMain.handle("load-epg", (event, url) => {
  const path = require("path");
  const fs = require("fs");
  const zlib = require("zlib");
  const win = BrowserWindow.fromWebContents(event.sender);
  const cacheFile = path.join(app.getPath("userData"), "epg-cache.json");
  const metaFile = path.join(app.getPath("userData"), "epg-meta.json");
  const sendProgress = (data) => {
    try {
      win?.webContents.send("epg-progress", data);
    } catch {
    }
  };
  return new Promise((resolve, reject) => {
    let cachedMeta = null;
    try {
      cachedMeta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    } catch {
    }
    const lib = url.startsWith("https") ? require("https") : require("http");
    const doReq = (reqUrl, reqLib) => {
      const reqOpts = {
        timeout: 12e4,
        rejectUnauthorized: false,
        headers: cachedMeta?.etag ? { "If-None-Match": cachedMeta.etag } : {}
      };
      const req = reqLib.get(reqUrl, reqOpts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          return doReq(loc, loc.startsWith("https") ? require("https") : require("http"));
        }
        if (res.statusCode === 304 && cachedMeta) {
          sendProgress({ stage: "cache", message: "EPG up to date" });
          try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
            return resolve(cached);
          } catch {
          }
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const isGzip = res.headers["content-encoding"] === "gzip" || reqUrl.endsWith(".gz");
        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        const etag = res.headers["etag"] || null;
        let receivedBytes = 0;
        sendProgress({ stage: "downloading", receivedBytes: 0, totalBytes });
        const chunks = [];
        const dataStream = isGzip ? res.pipe(zlib.createGunzip()) : res;
        res.on("data", (chunk) => {
          receivedBytes += chunk.length;
          sendProgress({ stage: "downloading", receivedBytes, totalBytes });
        });
        dataStream.on("data", (chunk) => chunks.push(chunk));
        dataStream.on("end", () => {
          sendProgress({ stage: "parsing" });
          const xml = Buffer.concat(chunks).toString("utf8");
          setImmediate(() => {
            try {
              const epg = parseXmltvFast(xml);
              const channelCount = Object.keys(epg).length;
              sendProgress({ stage: "done", channelCount });
              try {
                fs.writeFileSync(cacheFile, JSON.stringify(epg));
                fs.writeFileSync(metaFile, JSON.stringify({ etag, url, cachedAt: Date.now() }));
              } catch {
              }
              resolve(epg);
            } catch (e) {
              reject(e);
            }
          });
        });
        dataStream.on("error", reject);
        res.on("error", reject);
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("EPG request timed out"));
      });
    };
    if (cachedMeta?.url === url) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        if (cached && Object.keys(cached).length > 0) {
          sendProgress({ stage: "cache", channelCount: Object.keys(cached).length });
          resolve(cached);
          setTimeout(() => {
            try {
              doReq(url, lib);
            } catch {
            }
          }, 1500);
          return;
        }
      } catch {
      }
    }
    doReq(url, lib);
  });
});
function parseXmltvFast(xml) {
  const epg = {};
  const chanRe = /<channel\s+id="([^"]+)"[^>]*>/g;
  let m;
  while ((m = chanRe.exec(xml)) !== null) {
    const id = m[1].trim();
    if (!epg[id]) epg[id] = [];
  }
  const progRe = /<programme\s[^>]*start="([^"]+)"[^>]*stop="([^"]+)"[^>]*channel="([^"]+)"[^>]*>([\s\S]*?)<\/programme>/g;
  const titleRe = /<title[^>]*>([^<]+)<\/title>/;
  const descRe = /<desc[^>]*>([^<]+)<\/desc>/;
  while ((m = progRe.exec(xml)) !== null) {
    const start = parseXmltvDate(m[1]);
    const stop = parseXmltvDate(m[2]);
    const channel = m[3].trim();
    const inner = m[4];
    const title = (titleRe.exec(inner) || [])[1]?.trim() || "";
    const desc = (descRe.exec(inner) || [])[1]?.trim() || "";
    if (!epg[channel]) epg[channel] = [];
    epg[channel].push({ title, desc, start, stop });
  }
  for (const id of Object.keys(epg)) {
    epg[id].sort((a, b) => a.start - b.start);
  }
  return epg;
}
function parseXmltvDate(str) {
  const s = str.trim();
  const base = s.slice(0, 14);
  const tz = s.slice(15).trim() || "+0000";
  const year = +base.slice(0, 4), month = +base.slice(4, 6), day = +base.slice(6, 8);
  const h = +base.slice(8, 10), min = +base.slice(10, 12), sec = +base.slice(12, 14);
  const tzSign = tz[0] === "-" ? -1 : 1;
  const tzH = parseInt(tz.slice(1, 3), 10), tzM = parseInt(tz.slice(3, 5), 10);
  return Date.UTC(year, month - 1, day, h, min, sec) - tzSign * (tzH * 60 + tzM) * 6e4;
}
