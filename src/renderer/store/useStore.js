import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // --- Playlist ---
  sources: [],      // [{ id, name, url, type: 'm3u'|'xtream', host?, username?, password? }]
  activeSourceId: null,
  channels: [],
  isLoading: false,
  loadError: null,

  // --- UI ---
  selectedCategory: 'All',
  searchQuery: '',
  activeChannel: null,

  // --- Favorites / recent ---
  favorites: [],
  recentlyWatched: [],

  // --- EPG ---
  epg: {},
  epgUrl: '',
  epgStatus: 'idle',   // idle | loading | ready | error
  epgError: null,
  showGuide: false,
  epgRefreshInterval: 6, // hours

  setEpg:                (epg)    => set({ epg }),
  setEpgUrl:             (epgUrl) => set({ epgUrl }),
  setEpgStatus:          (s)      => set({ epgStatus: s }),
  setEpgError:           (e)      => set({ epgError: e }),
  setShowGuide:          (v)      => set({ showGuide: v }),
  setEpgRefreshInterval: (v)      => { set({ epgRefreshInterval: v }); window.electron?.store.set('epgRefreshInterval', v) },

  getNowNext: (tvgId) => {
    if (!tvgId) return { now: null, next: null }
    const { epg } = get()
    const progs = epg[tvgId]
    if (!progs?.length) return { now: null, next: null }
    const now = Date.now()
    const idx = progs.findIndex(p => p.start <= now && p.stop > now)
    if (idx === -1) return { now: null, next: progs.find(p => p.start > now) || null }
    return { now: progs[idx], next: progs[idx + 1] || null }
  },

  // --- Cast ---
  castDevices: [],
  selectedDevice: null,
  castStatus: 'idle',
  castError: null,
  aggressiveReconnect: false,

  // --- Actions: playlist ---
  setSources:      (sources)      => set({ sources }),
  setActiveSourceId: (id)         => set({ activeSourceId: id }),
  setChannels:     (channels)     => set({ channels }),
  setLoading:      (isLoading)    => set({ isLoading }),
  setLoadError:    (loadError)    => set({ loadError }),
  setSelectedCategory: (c)        => set({ selectedCategory: c }),
  setSearchQuery:  (searchQuery)  => set({ searchQuery }),

  setActiveChannel: (channel) => {
    const { recentlyWatched } = get()
    if (!channel) return set({ activeChannel: null })
    const filtered = recentlyWatched.filter(u => u !== channel.url)
    const updated = [channel.url, ...filtered].slice(0, 20)
    set({ activeChannel: channel, recentlyWatched: updated })
    window.electron?.store.set('recentlyWatched', updated)
  },

  toggleFavorite: (channelUrl) => {
    const { favorites } = get()
    const updated = favorites.includes(channelUrl)
      ? favorites.filter(u => u !== channelUrl)
      : [...favorites, channelUrl]
    set({ favorites: updated })
    window.electron?.store.set('favorites', updated)
  },

  setFavorites:        (favorites)       => set({ favorites }),
  setRecentlyWatched:  (recentlyWatched) => set({ recentlyWatched }),

  // --- Actions: cast ---
  setCastDevices:  (castDevices) => set({ castDevices }),
  setCastStatus:   (castStatus)  => set({ castStatus }),
  setCastError:    (castError)   => set({ castError }),
  selectDevice: (device) => {
    set({ selectedDevice: device, castStatus: 'idle', castError: null })
    window.electron?.store.set('selectedDevice', device)
  },
  setAggressiveReconnect: (val) => {
    set({ aggressiveReconnect: val })
    window.electron?.store.set('aggressiveReconnect', val)
  },

  // --- Derived ---
  getCategories: () => {
    const { channels } = get()
    const cats = new Set()
    channels.forEach(ch => { if (ch.group?.title) cats.add(ch.group.title) })
    return ['All', 'Favorites', 'Recent', ...Array.from(cats).sort()]
  },

  getFilteredChannels: () => {
    const { channels, selectedCategory, searchQuery, favorites, recentlyWatched } = get()
    let list = channels
    if (selectedCategory === 'Favorites') {
      list = channels.filter(ch => favorites.includes(ch.url))
    } else if (selectedCategory === 'Recent') {
      const map = new Map(channels.map(ch => [ch.url, ch]))
      list = recentlyWatched.map(url => map.get(url)).filter(Boolean)
    } else if (selectedCategory !== 'All') {
      list = channels.filter(ch => ch.group?.title === selectedCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(ch => ch.name?.toLowerCase().includes(q))
    }
    return list
  },
}))
