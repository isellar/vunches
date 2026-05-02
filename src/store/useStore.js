import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // --- Playlist state ---
  sources: [],           // [{ id, name, url, type: 'url'|'file' }]
  channels: [],          // parsed channel objects
  isLoading: false,
  loadError: null,

  // --- UI state ---
  selectedCategory: 'All',
  searchQuery: '',
  activeChannel: null,   // currently playing channel

  // --- Favorites / recent ---
  favorites: [],         // array of channel ids
  recentlyWatched: [],   // array of channel ids (most recent first, max 20)

  // --- Actions ---
  setSources: (sources) => set({ sources }),
  setChannels: (channels) => set({ channels }),
  setLoading: (isLoading) => set({ isLoading }),
  setLoadError: (loadError) => set({ loadError }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActiveChannel: (channel) => {
    const { recentlyWatched } = get()
    if (!channel) return set({ activeChannel: null })
    const id = channel.url
    const filtered = recentlyWatched.filter((u) => u !== id)
    const updated = [id, ...filtered].slice(0, 20)
    set({ activeChannel: channel, recentlyWatched: updated })
    window.electron?.store.set('recentlyWatched', updated)
  },

  toggleFavorite: (channelUrl) => {
    const { favorites } = get()
    const updated = favorites.includes(channelUrl)
      ? favorites.filter((u) => u !== channelUrl)
      : [...favorites, channelUrl]
    set({ favorites: updated })
    window.electron?.store.set('favorites', updated)
  },

  setFavorites: (favorites) => set({ favorites }),
  setRecentlyWatched: (recentlyWatched) => set({ recentlyWatched }),

  // --- Derived helpers ---
  getCategories: () => {
    const { channels } = get()
    const cats = new Set()
    channels.forEach((ch) => {
      if (ch.group?.title) cats.add(ch.group.title)
    })
    return ['All', 'Favorites', 'Recent', ...Array.from(cats).sort()]
  },

  getFilteredChannels: () => {
    const { channels, selectedCategory, searchQuery, favorites, recentlyWatched } = get()
    let list = channels

    if (selectedCategory === 'Favorites') {
      list = channels.filter((ch) => favorites.includes(ch.url))
    } else if (selectedCategory === 'Recent') {
      const map = new Map(channels.map((ch) => [ch.url, ch]))
      list = recentlyWatched.map((url) => map.get(url)).filter(Boolean)
    } else if (selectedCategory !== 'All') {
      list = channels.filter((ch) => ch.group?.title === selectedCategory)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((ch) => ch.name?.toLowerCase().includes(q))
    }

    return list
  },
}))
