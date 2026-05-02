const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key),
  },
  playStream: (url, channelName) => ipcRenderer.invoke('play-stream', url, channelName),
  fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url),

  cast: {
    startDiscovery:  ()       => ipcRenderer.invoke('cast-start-discovery'),
    stopDiscovery:   ()       => ipcRenderer.invoke('cast-stop-discovery'),
    getDevices:      ()       => ipcRenderer.invoke('cast-get-devices'),
    play:            (opts)   => ipcRenderer.invoke('cast-play', opts),
    pause:           ()       => ipcRenderer.invoke('cast-pause'),
    resume:          ()       => ipcRenderer.invoke('cast-resume'),
    stop:            ()       => ipcRenderer.invoke('cast-stop'),
    setVolume:       (level)  => ipcRenderer.invoke('cast-set-volume', level),

    onDevicesUpdated: (cb) => ipcRenderer.on('cast-devices-updated', (_e, d) => cb(d)),
    onMediaStatus:    (cb) => ipcRenderer.on('cast-media-status',    (_e, s) => cb(s)),
    onDisconnected:   (cb) => ipcRenderer.on('cast-disconnected',    ()      => cb()),
    onReconnecting:   (cb) => ipcRenderer.on('cast-reconnecting',    ()      => cb()),
    onReconnected:    (cb) => ipcRenderer.on('cast-reconnected',     ()      => cb()),
    onError:          (cb) => ipcRenderer.on('cast-error',           (_e, e) => cb(e)),
    offAll: () => {
      ['cast-devices-updated','cast-media-status','cast-disconnected',
       'cast-reconnecting','cast-reconnected','cast-error']
        .forEach(ch => ipcRenderer.removeAllListeners(ch))
    },
  },
})
