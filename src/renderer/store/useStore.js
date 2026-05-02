import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // --- Playlist ---
  sources: [],
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

  // --- Cast ---
  castDevices: [],
  selectedDevice: null,       // { name, host, port } — persisted
  castStatus: 'idle',         // idle | connecting | playing | paused | reconnecting | error
  castError: null,
  aggressiveReconnect: false, // persisted

  // --- Actions: playlist ---
  setSources: (sources) => set({ sources }),
  setChannels: (channels) => set({ channels }),
  setLoading: (isLoading) => set({ isLoading }),
  setLoadError: (loadError) => set({ loadError }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
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
  setFavorites: (favorites) => set({ favorites }),
  setRecentlyWatched: (recentlyWatched) => set({ recentlyWatched }),

  // --- Actions: cast ---
  setCastDevices: (castDevices) => set({ castDevices }),
  setCastStatus:  (castStatus)  => set({ castStatus }),
  setCastError:   (castError)   => set({ castError }),
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
