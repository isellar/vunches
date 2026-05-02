const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key),
  },
  playStream: (url, channelName) => ipcRenderer.invoke('play-stream', url, channelName),
  fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url),
})
