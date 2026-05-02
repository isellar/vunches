"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electron", {
  store: {
    get: (key) => ipcRenderer.invoke("store-get", key),
    set: (key, value) => ipcRenderer.invoke("store-set", key, value),
    delete: (key) => ipcRenderer.invoke("store-delete", key)
  },
  playStream: (url, name) => ipcRenderer.invoke("play-stream", url, name),
  fetchUrl: (url) => ipcRenderer.invoke("fetch-url", url),
  loadPlaylist: (url) => ipcRenderer.invoke("load-playlist", url),
  detectEpgUrl: (url) => ipcRenderer.invoke("detect-epg-url", url),
  loadEpg: (url) => ipcRenderer.invoke("load-epg", url),
  // Xtream Codes
  xtreamFetch: (opts) => ipcRenderer.invoke("xtream-fetch", opts),
  xtreamGetStreamUrl: (opts) => ipcRenderer.invoke("xtream-get-stream-url", opts),
  // Import / Export
  exportData: () => ipcRenderer.invoke("export-data"),
  importData: () => ipcRenderer.invoke("import-data"),
  // Progress events
  onPlaylistProgress: (cb) => ipcRenderer.on("playlist-progress", (_e, d) => cb(d)),
  offPlaylistProgress: () => ipcRenderer.removeAllListeners("playlist-progress"),
  onEpgProgress: (cb) => ipcRenderer.on("epg-progress", (_e, d) => cb(d)),
  offEpgProgress: () => ipcRenderer.removeAllListeners("epg-progress"),
  // Chromecast
  cast: {
    startDiscovery: () => ipcRenderer.invoke("cast-start-discovery"),
    stopDiscovery: () => ipcRenderer.invoke("cast-stop-discovery"),
    getDevices: () => ipcRenderer.invoke("cast-get-devices"),
    play: (opts) => ipcRenderer.invoke("cast-play", opts),
    pause: () => ipcRenderer.invoke("cast-pause"),
    resume: () => ipcRenderer.invoke("cast-resume"),
    stop: () => ipcRenderer.invoke("cast-stop"),
    setVolume: (level) => ipcRenderer.invoke("cast-set-volume", level),
    onDevicesUpdated: (cb) => ipcRenderer.on("cast-devices-updated", (_e, d) => cb(d)),
    onMediaStatus: (cb) => ipcRenderer.on("cast-media-status", (_e, s) => cb(s)),
    onDisconnected: (cb) => ipcRenderer.on("cast-disconnected", () => cb()),
    onReconnecting: (cb) => ipcRenderer.on("cast-reconnecting", () => cb()),
    onReconnected: (cb) => ipcRenderer.on("cast-reconnected", () => cb()),
    onError: (cb) => ipcRenderer.on("cast-error", (_e, e) => cb(e)),
    offAll: () => {
      [
        "cast-devices-updated",
        "cast-media-status",
        "cast-disconnected",
        "cast-reconnecting",
        "cast-reconnected",
        "cast-error"
      ].forEach((ch) => ipcRenderer.removeAllListeners(ch));
    }
  }
});
