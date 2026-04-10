import React, { useState, useRef, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { 
  Home, Search, Library, Heart, PlusCircle, 
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, 
  Volume2, VolumeX, ListMusic, MoreHorizontal, Maximize2, 
  Trash2, Settings, ShieldCheck, UploadCloud, Share2, BarChart, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, setDoc } from "firebase/firestore";


const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache()
});

// --- Internal Empty State ---
const MOCK_SONGS: any[] = [];
const EMPTY_SONG = { id: 0, title: 'No Tracks Available', artist: 'Upload to begin', time: '0:00', cover: '', liked: false, audioUrl: '' };

// Dynamic Features are built inside state

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`flex items-center w-full gap-4 px-4 py-3 rounded-xl transition-colors ${
      active ? 'text-emerald-400 bg-emerald-400/10 font-medium' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
    }`}
  >
    <Icon size={20} className={active ? 'text-emerald-400' : ''} />
    <span>{label}</span>
  </button>
);

export default function App() {
  const isLocalNetwork = window.location.hostname === 'localhost' || window.location.hostname.startsWith('10.') || window.location.hostname.startsWith('192.') || window.location.hostname === '127.0.0.1';
  const API_URL = isLocalNetwork ? `http://${window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname}:8000` : '';
  const [currentView, setCurrentView] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [songs, setSongs] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, "songs"), orderBy("id", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const songsData = snapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
      setSongs(songsData);
    });
    
    const pq = collection(db, "playlists");
    const unsubscribePlaylists = onSnapshot(pq, (snapshot) => {
      const plData = snapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
      setPlaylists(plData);
    });

    return () => { unsubscribe(); unsubscribePlaylists(); };
  }, []);
  const [currentSong, setCurrentSong] = useState(songs[0] || EMPTY_SONG);
  const [recentlyPlayed, setRecentlyPlayed] = useState<any[]>([]);
  const [libraryTab, setLibraryTab] = useState<'liked' | 'playlists' | 'favorites'>('liked');
  const [isPlaying, setIsPlaying] = useState(false);

  // Level 5 Storage Metrics
  const storageStats = useMemo(() => {
    let totalSize = 0;
    let seenTitles = new Set();
    let seenFingerprints = new Set();
    let dupsTitleCount = 0;
    let dupsFingerCount = 0;

    songs.forEach(s => {
      totalSize += (s.audioBytes || 0) + (s.coverBytes || 0);
      const title = s.title.toLowerCase();
      if (seenTitles.has(title)) dupsTitleCount++;
      else seenTitles.add(title);

      if (s.fingerprint) {
        if (seenFingerprints.has(s.fingerprint)) dupsFingerCount++;
        else seenFingerprints.add(s.fingerprint);
      }
    });

    const largeFiles = [...songs]
      .sort((a, b) => ((b.audioBytes || 0) + (b.coverBytes || 0)) - ((a.audioBytes || 0) + (a.coverBytes || 0)))
      .slice(0, 5);

    return { totalSize, dupsTitleCount, dupsFingerCount, largeFiles };
  }, [songs]);

  const [isMobilePlayerExpanded, setIsMobilePlayerExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [prevVolume, setPrevVolume] = useState(1);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [storageData, setStorageData] = useState<{ used: number; limit: number } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [progressList, setProgressList] = useState<number[]>([]);
  const [statusList, setStatusList] = useState<string[]>([]);
  const [currentUploadingIndex, setCurrentUploadingIndex] = useState<number | null>(null);
  const [globalStatus, setGlobalStatus] = useState<string | null>(null);
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);

  const updateProgress = (index: number, value: number) => {
    setProgressList(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const updateStatus = (index: number, status: string) => {
    setStatusList(prev => {
      const updated = [...prev];
      updated[index] = status;
      return updated;
    });
  };

  // State Persistence - Save Song and State
  useEffect(() => {
    if (currentSong.id !== 0) {
      localStorage.setItem("player_song", JSON.stringify(currentSong));
    }
  }, [currentSong]);

  useEffect(() => {
    localStorage.setItem("player_state", isPlaying ? "playing" : "paused");
  }, [isPlaying]);

  useEffect(() => {
    localStorage.setItem("player_volume", String(volume));
  }, [volume]);

  // State Persistence - Restore on Load
  useEffect(() => {
    const savedSong = localStorage.getItem("player_song");
    const savedTime = localStorage.getItem("player_time");
    const savedState = localStorage.getItem("player_state");
    const savedVolume = localStorage.getItem("player_volume");

    if (savedVolume) setVolume(parseFloat(savedVolume));

    if (savedSong) {
      try {
        const parsedSong = JSON.parse(savedSong);
        if (parsedSong && parsedSong.id !== 0) {
          setCurrentSong(parsedSong);
          
          setTimeout(() => {
            if (audioRef.current && savedTime) {
              audioRef.current.currentTime = parseFloat(savedTime);
              if (savedState === "playing") {
                setIsPlaying(true);
                audioRef.current.play().catch(() => {});
              }
            }
          }, 800); // 800ms to ensure buffer readiness
        }
      } catch (e) {}
    }
  }, []);

  const getCoverLabel = (source: string | null) => {
    if (source === "auto") return "Auto-selected cover ⚡";
    if (source === "manual") return "Custom cover uploaded 🖼️";
    if (source === "suggested") return "Used suggested cover ✅";
    return null;
  };

  const handleCancel = () => {
    if (audioRef.current) {
      localStorage.setItem("player_time", String(audioRef.current.currentTime));
      audioRef.current.pause();
      setIsPlaying(false);
      setIsPlayerVisible(false);
    }
  };

  const handleExpandMobilePlayer = () => {
    requestAnimationFrame(() => {
      setIsMobilePlayerExpanded(true);
    });
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY;
  const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET;


  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let totalBytes = 0;
    songs.forEach(song => {
      totalBytes += (song.audioBytes || 0) + (song.coverBytes || 0);
    });
    setStorageData({ used: totalBytes, limit: 25 * 1024 * 1024 * 1024 });
  }, [songs]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb < 0.1) {
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(2)} MB`;
    }
    return `${gb.toFixed(2)} GB`;
  };

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Playback failed: ", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSong]);

  // Upload Form State
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArtist, setUploadArtist] = useState('');
  const [uploadCover, setUploadCover] = useState<any>(null);
  const [uploadCoverSource, setUploadCoverSource] = useState<'auto' | 'manual' | null>(null);
  const [uploadFingerprint, setUploadFingerprint] = useState<string | null>(null);
  const [uploadAudioUrl, setUploadAudioUrl] = useState<any>(null);
  const [suggestedMatches, setSuggestedMatches] = useState<any[]>([]);
  const [uploadMode, setUploadMode] = useState<'single' | 'bulk'>('single');
  const [bulkSongs, setBulkSongs] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (uploadMode === 'single' && uploadTitle && uploadTitle.length > 2) {
      const fetchMatches = async () => {
        try {
          const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(uploadTitle)}&entity=song&limit=5`);
          const data = await res.json();
          if (data.results) setSuggestedMatches(data.results);
        } catch (e) {}
      };
      const timer = setTimeout(fetchMatches, 500);
      return () => clearTimeout(timer);
    }
  }, [uploadTitle, uploadMode]);

  const uploadToCloudinary = (file: File, onProgress?: (percent: number) => void) => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY;
    const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return Promise.resolve(null);

    const timestamp = Math.round(new Date().getTime() / 1000).toString();
    const signatureString = `timestamp=${timestamp}${apiSecret}`;

    return new Promise<any>(async (resolve, reject) => {
      const msgBuffer = new TextEncoder().encode(signatureString);
      const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);

      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          resolve({ 
            url: data.secure_url, 
            public_id: data.public_id, 
            bytes: data.bytes || 0, 
            duration: data.duration || 0 
          });
        } else {
          console.error("Upload error:", xhr.responseText);
          resolve(null);
        }
      };

      xhr.onerror = () => {
        console.error("XHR network error");
        resolve(null);
      };

      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (!uploadTitle || !uploadArtist) return;
    
    // Duplicate Detection (Case-Insensitive)
    const isDuplicate = songs.some(s => s.title.toLowerCase() === uploadTitle.trim().toLowerCase());
    if (isDuplicate) {
      if (!window.confirm(`The song "${uploadTitle}" already exists in the sanctuary. Do you want to re-upload it?`)) {
        return;
      }
    }

    const newSong = {
      id: Date.now(),
      title: uploadTitle,
      artist: uploadArtist,
      time: uploadAudioUrl?.duration ? formatTime(uploadAudioUrl.duration) : '0:00',
      cover: uploadCover?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=150&h=150&fit=crop&q=80',
      coverPublicId: uploadCover?.public_id,
      audioUrl: uploadAudioUrl?.url || '',
      audioPublicId: uploadAudioUrl?.public_id,
      audioBytes: uploadAudioUrl?.bytes || 0,
      coverBytes: uploadCover?.bytes || 0,
      fingerprint: uploadFingerprint,
      liked: false
    };

    await addDoc(collection(db, "songs"), newSong);
    setUploadTitle('');
    setUploadArtist('');
    setUploadCover('');
    setUploadCoverSource(null);
    setSuggestedMatches([]);
    setUploadAudioUrl('');
    setCurrentView('home'); 
  };

  const createPlaylist = async (name: string) => {
    await addDoc(collection(db, "playlists"), {
      name,
      songs: [],
      createdAt: Date.now()
    });
  };

  const deleteFromCloudinary = async (publicId: string, resourceType: string = 'video') => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY;
    const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return;

    const timestamp = Math.round(new Date().getTime() / 1000).toString();
    const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const msgBuffer = new TextEncoder().encode(signatureString);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    try {
      await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, { method: 'POST', body: formData });
    } catch (e) {
      console.error(e);
    }
  };

  const generateFingerprint = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const deleteSong = async (songId: number) => {
    const songToDelete = songs.find(s => s.id === songId);
    if (!songToDelete) return;

    if ((songToDelete as any).audioPublicId) await deleteFromCloudinary((songToDelete as any).audioPublicId, 'video');
    if ((songToDelete as any).coverPublicId) await deleteFromCloudinary((songToDelete as any).coverPublicId, 'image');

    if ((songToDelete as any).firebaseId) {
      await deleteDoc(doc(db, "songs", (songToDelete as any).firebaseId));
    }
    if (currentSong.id === songId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
      setIsPlaying(false);
      setCurrentSong(songs[0] || EMPTY_SONG);
    }
  };

  const togglePlay = () => setIsPlaying(!isPlaying);

  const recordTransition = async (fromId: string | number, toId: string | number, listenDur: number, totalDur: number) => {
    if (fromId === 0 || toId === 0 || fromId === toId || !API_URL) return;
    try {
      await fetch(`${API_URL}/record-transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_song_id: String(fromId),
          to_song_id: String(toId),
          listen_duration_seconds: listenDur,
          total_duration_seconds: totalDur || 1
        })
      });
    } catch (e) { }
  };

  const playSong = (song: any) => {
    if (currentSong.id !== 0 && currentSong.id !== song.id) {
      recordTransition(currentSong.id, song.id, currentTime, duration);
    }

    const wasClosed = !isPlayerVisible;
    setIsPlayerVisible(true);
    
    if (currentSong.id === song.id && wasClosed) {
      // Just resume if it was the same song
      const savedTime = localStorage.getItem("player_time");
      if (savedTime && audioRef.current) {
        audioRef.current.currentTime = parseFloat(savedTime);
      }
      setIsPlaying(true);
      return;
    }

    setCurrentSong(song);
    setIsPlaying(true);
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(s => s.id !== song.id);
      return [song, ...filtered].slice(0, 5);
    });
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      if (!song.audioUrl) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
        setIsPlaying(false);
      }
    }
  };
  const toggleLike = async (e: React.MouseEvent, id?: number) => {
    e.stopPropagation();
    const targetId = id || currentSong.id;
    const songToUpdate = songs.find(s => s.id === targetId);
    if (songToUpdate && songToUpdate.firebaseId) {
      await updateDoc(doc(db, "songs", songToUpdate.firebaseId), {
        liked: !songToUpdate.liked
      });
      if (currentSong.id === targetId) setCurrentSong({ ...currentSong, liked: !currentSong.liked });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      // Save every second
      localStorage.setItem("player_time", String(time));
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current) {
      const bar = e.currentTarget;
      const rect = bar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      let newTime = (clickX / rect.width) * duration;
      if (newTime < 0) newTime = 0;
      if (newTime > duration) newTime = duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    let newVolume = clickX / rect.width;
    if (newVolume < 0) newVolume = 0;
    if (newVolume > 1) newVolume = 1;
    setVolume(newVolume);
    if (newVolume > 0) setPrevVolume(newVolume);
  };

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume || 1);
    }
  };

  const handleNextSong = async () => {
    if (isRepeat && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      return;
    }

    if (!isShuffle && currentSong.id !== 0 && API_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 200); // 200ms strict threshold
        const res = await fetch(`${API_URL}/recommendations/${currentSong.id}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (data.recommended_song_id) {
           const recommendedSong = songs.find(s => String(s.id) === String(data.recommended_song_id));
           if (recommendedSong) {
             playSong(recommendedSong);
             return;
           }
        }
      } catch (e) { }
    }

    let nextIndex = songs.findIndex(s => s.id === currentSong.id) + 1;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * songs.length);
    } else if (nextIndex >= songs.length) {
      nextIndex = 0;
    }
    const nextSong = songs[nextIndex];
    if (nextSong) playSong(nextSong);
  };

  const handlePrevSong = () => {
    let prevIndex = songs.findIndex(s => s.id === currentSong.id) - 1;
    if (prevIndex < 0) prevIndex = songs.length - 1;
    const prevSong = songs[prevIndex];
    if (prevSong) playSong(prevSong);
  };

  useEffect(() => {
    if ('mediaSession' in navigator && currentSong.id !== 0) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist || 'Leaf Player',
        album: 'Leaf Player Sanctuary',
        artwork: [{ src: currentSong.cover, sizes: '512x512', type: 'image/jpeg' }, { src: currentSong.cover, sizes: '512x512', type: 'image/png' }]
      });

      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('previoustrack', handlePrevSong);
      navigator.mediaSession.setActionHandler('nexttrack', handleNextSong);
    }
  }, [currentSong, songs, isShuffle, isRepeat]);

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans selection:bg-emerald-500/30">
      <audio 
        ref={audioRef}
        src={currentSong.audioUrl || ''}
        onEnded={handleNextSong}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />
      
      {/* --- Desktop Sidebar --- */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0f0f0f] border-r border-zinc-800/50 p-6 z-20">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-full bg-emerald-400 flex items-center justify-center">
            <div className="w-3 h-3 bg-black rounded-full" />
          </div>
          <span className="text-xl font-bold tracking-tight text-emerald-400">Leaf Player</span>
        </div>

        <div className="flex flex-col gap-1 mb-8">
          <SidebarItem icon={Home} label="Home" active={currentView === 'home'} onClick={() => setCurrentView('home')} />
          <SidebarItem icon={ListMusic} label="Recently Uploaded" active={currentView === 'recent'} onClick={() => setCurrentView('recent')} />
          <SidebarItem icon={Search} label="Search" active={currentView === 'search'} onClick={() => setCurrentView('search')} />
          <SidebarItem icon={ListMusic} label="Library" active={currentView === 'library'} onClick={() => setCurrentView('library')} />
          <SidebarItem icon={ShieldCheck} label="Admin" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
        </div>

        <button className="flex items-center justify-center gap-2 w-full py-3 rounded-full bg-emerald-400 text-black font-semibold hover:bg-emerald-300 transition-colors mb-8">
          <PlusCircle size={20} />
          Create Playlist
        </button>

        <div className="mt-auto flex flex-col gap-4 text-xs text-zinc-500">
          <div className="flex gap-4">
            <a href="#" className="hover:text-zinc-300">Legal</a>
            <a href="#" className="hover:text-zinc-300">Privacy</a>
          </div>
        </div>
      </aside>

      {/* --- Main Content Area --- */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* Top Navigation Bar */}
        <header className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-[#0a0a0a] to-transparent z-10 flex items-center justify-between px-6 md:px-10 pointer-events-none">
          <div className="flex items-center gap-6 pointer-events-auto">
            {/* Mobile Logo */}
            <div className="md:hidden flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center">
                <div className="w-2 h-2 bg-black rounded-full" />
              </div>
              <span className="text-xl font-bold tracking-tight text-emerald-400">Leaf Player</span>
            </div>
            
          </div>

          <div className="flex items-center gap-4 pointer-events-auto">
            <div className="hidden md:flex items-center bg-zinc-900/80 border border-zinc-800 rounded-full px-4 py-2 w-64 focus-within:border-zinc-600 transition-colors">
              <Search size={16} className="text-zinc-400 mr-2" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (currentView !== 'search') setCurrentView('search');
                }}
                placeholder="Search library..." 
                className="bg-transparent border-none outline-none text-sm w-full placeholder:text-zinc-500"
              />
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-32 pt-20 px-6 md:px-10 scrollbar-hide">
          <AnimatePresence mode="wait">
            {currentView === 'home' && (
              <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-10">
                {/* Continue Listening */}
                {recentlyPlayed.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold tracking-tight">Continue Listening</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                      {recentlyPlayed.map((album) => (
                        <div key={album.id} className="group cursor-pointer" onClick={() => playSong(album)}>
                          <div className="relative aspect-square rounded-2xl overflow-hidden mb-4 bg-zinc-800">
                            <img src={album.cover || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=150&h=150&fit=crop&q=80'} alt={album.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button className="w-12 h-12 bg-emerald-400 rounded-full flex items-center justify-center text-black shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                                <Play size={24} fill="currentColor" className="ml-1" />
                              </button>
                            </div>
                          </div>
                          <h3 className="font-semibold text-zinc-100 truncate">{album.title}</h3>
                          <p className="text-sm text-zinc-500 truncate">{album.artist}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* All Songs List */}
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold tracking-tight">Your Tracks</h2>
                  </div>
                  <div className="flex flex-col gap-1">
                    {songs.map((song, index) => {
                      const isActive = currentSong.id === song.id;
                      return (
                        <div 
                          key={song.id}
                          onClick={() => playSong(song)}
                          className={`grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-4 items-center px-4 py-3 rounded-xl cursor-pointer transition-colors group ${
                            isActive ? 'bg-emerald-400/10 border border-emerald-400/20' : 'hover:bg-zinc-800/50 border border-transparent'
                          }`}
                        >
                          <div className="w-8 text-center text-zinc-500 font-medium">
                            {isActive && isPlaying ? (
                              <div className="flex items-end justify-center gap-0.5 h-4">
                                <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                <motion.div animate={{ height: [8, 16, 8] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                <motion.div animate={{ height: [6, 10, 6] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                              </div>
                            ) : (
                              <span className={isActive ? 'text-emerald-400' : 'group-hover:hidden'}>{index + 1}</span>
                            )}
                            {!isActive && <Play size={16} className="hidden group-hover:inline-block text-zinc-100" fill="currentColor" />}
                          </div>
                          
                          <div className="flex items-center gap-4 overflow-hidden">
                            <img src={song.cover} alt={song.title} className="w-10 h-10 rounded-md object-cover shadow-md" />
                            <div className="truncate">
                              <div className={`font-medium truncate ${isActive ? 'text-emerald-400' : 'text-zinc-100'}`}>{song.title}</div>
                              <div className="text-sm text-zinc-500 truncate md:hidden">{song.artist}</div>
                            </div>
                          </div>
                          
                          <div className="hidden md:block text-sm text-zinc-400 truncate">{song.artist}</div>
                          
                          <div className="w-16 text-right flex items-center justify-end gap-4">
                            <Heart size={16} className={song.liked ? 'text-emerald-400 fill-emerald-400' : 'text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100'} />
                            <span className="text-sm text-zinc-500">{song.time}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </motion.div>
            )}

            {currentView === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                    <p className="text-zinc-500">Refining the auditory experience.</p>
                  </div>
                  <div className="flex items-center gap-3 bg-zinc-900 rounded-full py-1.5 px-2 border border-zinc-800">
                    <div className={`w-2.5 h-2.5 rounded-full ml-2 transition-colors duration-500 ${isOnline ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`} />
                    <span className="text-sm font-medium pr-3">{isOnline ? 'Online' : 'Offline'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Upload Section */}
                  <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 md:p-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                      <h2 className="text-xl font-semibold flex items-center gap-2">
                        <PlusCircle size={20} className="text-emerald-400" /> Upload Sanctuary Piece
                      </h2>
                      <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                        <button 
                          onClick={() => setUploadMode('single')}
                          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${uploadMode === 'single' ? 'bg-emerald-400 text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          Single Track
                        </button>
                        <button 
                          onClick={() => setUploadMode('bulk')}
                          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${uploadMode === 'bulk' ? 'bg-emerald-400 text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          Bulk Upload
                        </button>
                      </div>
                    </div>
                    
                    {uploadMode === 'single' ? (
                      <>
                        <label className="border-2 border-dashed border-zinc-700 rounded-2xl p-10 flex flex-col items-center justify-center text-center mb-6 hover:bg-zinc-800/30 transition-colors cursor-pointer relative overflow-hidden">
                        <input 
                          type="file" 
                          accept="audio/*"
                          className="hidden" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                               const fileName = file.name.replace(/\.[^/.]+$/, "");
                               
                               // Level 1: Name Check
                               const isNameDup = songs.some(s => s.title.toLowerCase() === fileName.toLowerCase());
                               if (isNameDup) {
                                 if (!window.confirm(`A song named "${fileName}" already exists. Re-upload?`)) return;
                               }

                               setIsUploading(true);

                               // Level 2: Fingerprint Check
                               const fingerprint = await generateFingerprint(file);
                               const isFingerDup = songs.some(s => s.fingerprint === fingerprint);
                               if (isFingerDup) {
                                 if (!window.confirm("This audio content already exists in the library. Upload anyway?")) {
                                   setIsUploading(false);
                                   return;
                                 }
                               }
                               setUploadFingerprint(fingerprint);

                               setUploadTitle(prev => prev || fileName);
                               
                               try {
                                 const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(fileName)}&entity=song&limit=5`);
                                 const data = await res.json();
                                 if (data.results && data.results.length > 0) {
                                   setSuggestedMatches(data.results);
                                   setUploadArtist(prev => prev || data.results[0].artistName);
                                   setUploadCover(prev => prev || { url: data.results[0].artworkUrl100.replace('100x100bb', '500x500bb') });
                                   setUploadCoverSource('auto');
                                 }
                               } catch (err) { console.error("iTunes metadata sync failed:", err); }
                               
                               const url = await uploadToCloudinary(file);
                               if (url) { setUploadAudioUrl(url); } else { alert("Failed to upload audio."); }
                               setIsUploading(false);
                            }
                          }} 
                        />
                      {isUploading ? (
                        <div className="flex flex-col items-center animate-fade-in">
                          <div className="flex items-end gap-1 mb-6 h-8">
                            {[0, 1, 2, 3, 4].map((i) => (
                              <div 
                                key={i}
                                className="w-1.5 bg-emerald-400 rounded-full animate-waveform shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                                style={{ animationDelay: `${i * 0.15}s` }}
                              />
                            ))}
                          </div>
                          <p className="font-bold text-emerald-400 mb-1 animate-pulse italic">Uploading audio...</p>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Please wait while we sync with the sanctuary</p>
                        </div>
                      ) : (
                        <>
                          <UploadCloud size={40} className="text-emerald-400 mb-4" />
                          <p className="font-medium text-zinc-300 mb-1">
                            {uploadAudioUrl ? "Audio File Loaded successfully!" : "Click to select a high-fidelity MP3 or WAV"}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {uploadAudioUrl ? "File ready for release" : "Maximum file size 50MB"}
                          </p>
                        </>
                      )}
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Song Title</label>
                        <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} type="text" placeholder="e.g. Midnight Echoes" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 transition-colors" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Artist Name</label>
                        <input value={uploadArtist} onChange={(e) => setUploadArtist(e.target.value)} type="text" placeholder="e.g. Lumina" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 transition-colors" />
                      </div>
                    </div>
                    
                    {suggestedMatches.length > 0 && (
                      <div className="mb-6 bg-zinc-950/50 border border-zinc-800 rounded-2xl p-4">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Sync verified matches</p>
                        <div className="flex flex-col gap-2 max-h-40 overflow-y-auto scrollbar-hide pr-1">
                          {suggestedMatches.map((match, i) => (
                            <div 
                              key={i} 
                              onClick={() => {
                                setUploadArtist(match.artistName);
                                setUploadTitle(match.trackName);
                                setUploadCover({ url: match.artworkUrl100.replace('100x100bb', '500x500bb') });
                                setUploadCoverSource('suggested');
                              }}
                              className="flex items-center gap-3 p-2 hover:bg-zinc-800/50 rounded-xl cursor-pointer transition-all border border-transparent hover:border-zinc-700/50 group"
                            >
                              <img src={match.artworkUrl60} className="w-10 h-10 rounded-lg shrink-0 object-cover shadow-sm group-hover:scale-105 transition-transform" />
                              <div className="truncate flex-1">
                                <p className="text-xs font-semibold truncate text-zinc-200">{match.trackName}</p>
                                <p className="text-[10px] text-zinc-500 truncate">{match.artistName} • {match.collectionName || 'Single'}</p>
                              </div>
                              <div className="w-6 h-6 rounded-full border border-zinc-800 flex items-center justify-center group-hover:bg-emerald-400 group-hover:border-emerald-400 transition-colors">
                                <PlusCircle size={12} className="group-hover:text-black" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-8">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider">Album Image (Auto-Synced or Upload)</label>
                        {uploadCoverSource && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            uploadCoverSource === 'manual' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' : 
                            'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                          }`}>
                            {getCoverLabel(uploadCoverSource)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 bg-zinc-950/50 border border-zinc-800 rounded-xl p-3">
                        {uploadCover ? (
                          <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden shadow-lg border border-zinc-700 bg-zinc-900">
                            <img src={uploadCover.url} className="w-full h-full object-cover" alt="Album Cover Preview" />
                          </div>
                        ) : (
                          <div className="w-16 h-16 shrink-0 rounded-xl border-2 border-dashed border-zinc-800 flex items-center justify-center bg-zinc-950">
                             <Settings size={20} className="text-zinc-700 animate-spin-slow" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <input 
                            type="file" 
                            accept="image/*"
                            className="w-full text-sm text-zinc-400 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-emerald-400 file:text-black hover:file:bg-emerald-300 cursor-pointer"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                 setIsUploading(true);
                                  const url = await uploadToCloudinary(file);
                                  if (url) { 
                                    setUploadCover(url); 
                                    setUploadCoverSource('manual');
                                  } else { alert("Failed to upload image."); }
                                 setIsUploading(false);
                              }
                            }}
                          />
                          <p className="text-[10px] text-zinc-500 mt-1 truncate">
                            {uploadCover ? "Ready to sync" : "Select artwork (Square suggested)"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button disabled={isUploading} onClick={handleUpload} className={`w-full ${isUploading ? 'bg-zinc-700 text-zinc-400' : 'bg-emerald-400 text-black hover:bg-emerald-300'} font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2`}>
                      <UploadCloud size={20} /> Release to Sanctuary
                    </button>
                    {(uploadAudioUrl || uploadCover || uploadTitle) && (
                      <button 
                         onClick={async () => {
                            if (uploadAudioUrl?.public_id) await deleteFromCloudinary(uploadAudioUrl.public_id, "video");
                            if (uploadCover?.public_id) await deleteFromCloudinary(uploadCover.public_id, "image");
                            setUploadTitle('');
                             setUploadArtist('');
                             setUploadCover(null);
                             setUploadCoverSource(null);
                             setSuggestedMatches([]);
                             setUploadAudioUrl(null);
                         }}
                         disabled={isUploading}
                         className="w-full mt-3 border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-900/50 hover:bg-red-500/10 font-semibold py-3 rounded-xl transition-colors"
                      >
                        Cancel & Remove
                          </button>
                      )}
                    </>
                    ) : (
                      <div className="flex flex-col gap-6">
                        <label className="border-2 border-dashed border-zinc-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-zinc-800/30 transition-colors cursor-pointer relative">
                          <input 
                            type="file" 
                            accept="audio/*,.zip"
                            multiple
                            className="hidden" 
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []) as File[];
                              if (files.length === 0) return;
                              
                              let audioFiles: File[] = [];
                              setIsUploading(true);
                              
                              for (const file of files) {
                                if (file.name.endsWith('.zip')) {
                                  const zip = await JSZip.loadAsync(file as any);
                                  const zipFiles = Object.values(zip.files) as any[];
                                  for (const zf of zipFiles) {
                                    if (!zf.dir && (zf.name.endsWith('.mp3') || zf.name.endsWith('.wav'))) {
                                      const blob = await zf.async('blob') as Blob;
                                      audioFiles.push(new File([blob], zf.name, { type: 'audio/mpeg' }));
                                    }
                                  }
                                } else {
                                  audioFiles.push(file);
                                }
                              }
                              
                              const limit = 10;
                              const finalFiles = audioFiles.slice(0, limit);
                              const preparedPromises = finalFiles.map(async f => {
                                  const fingerprint = await generateFingerprint(f);
                                  return {
                                    file: f,
                                    title: f.name.replace(/\.[^/.]+$/, ""),
                                    artist: '',
                                    cover: null,
                                    status: 'idle',
                                    fingerprint: fingerprint
                                  };
                                });
                                
                                let prepared = await Promise.all(preparedPromises);

                                // Level 3: Batch Duplicate Detection
                                const duplicates = prepared.filter(p => 
                                  songs.some(s => s.title.toLowerCase() === p.title.toLowerCase() || s.fingerprint === p.fingerprint)
                                );

                                if (duplicates.length > 0) {
                                  if (window.confirm(`${duplicates.length} songs already exist. What do you want to do?\n\nOK = Skip Duplicates\nCancel = Re-upload All`)) {
                                    prepared = prepared.filter(p => 
                                      !songs.some(s => s.title.toLowerCase() === p.title.toLowerCase() || s.fingerprint === p.fingerprint)
                                    );
                                  }
                                }
                                
                                setBulkSongs(prepared);
                                
                                // Trigger metadata fetch for each
                                for (let i = 0; i < prepared.length; i++) {
                                  try {
                                    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(prepared[i].title)}&entity=song&limit=1`);
                                    const data = await res.json();
                                    if (data.results && data.results.length > 0) {
                                      setBulkSongs(prev => {
                                        const copy = [...prev];
                                        if (copy[i]) {
                                          copy[i] = {
                                            ...copy[i],
                                            artist: data.results[0].artistName,
                                            cover: { url: data.results[0].artworkUrl100.replace('100x100bb', '500x500bb') }
                                          };
                                        }
                                        return copy;
                                      });
                                    }
                                  } catch (e) {}
                                }
                                setIsUploading(false);
                            }} 
                          />
                          <UploadCloud size={32} className="text-emerald-400 mb-3" />
                          <p className="font-medium text-zinc-300">Choose Audio Files or ZIP</p>
                          <p className="text-xs text-zinc-500 mt-1">Up to 10 tracks at once</p>
                        </label>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {bulkSongs.map((song, idx) => (
                            <div key={idx} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden group">
                              {song.status === 'done' && <div className="absolute inset-0 bg-emerald-400/10 flex items-center justify-center z-10 backdrop-blur-[1px]"><ShieldCheck className="text-emerald-400" size={32} /></div>}
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-zinc-900 rounded-lg flex-shrink-0 relative overflow-hidden border border-zinc-800">
                                  {song.cover ? <img src={song.cover.url} className="w-full h-full object-cover" /> : <ListMusic size={20} className="absolute inset-0 m-auto text-zinc-700" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <input 
                                    value={song.title} 
                                    onChange={(e) => setBulkSongs(prev => { const c = [...prev]; c[idx].title = e.target.value; return c; })}
                                    className="bg-transparent border-none outline-none text-sm font-semibold w-full text-zinc-100 placeholder:text-zinc-600" 
                                    placeholder="Track Title"
                                  />
                                  <input 
                                    value={song.artist} 
                                    onChange={(e) => setBulkSongs(prev => { const c = [...prev]; c[idx].artist = e.target.value; return c; })}
                                    className="bg-transparent border-none outline-none text-xs w-full text-zinc-500 placeholder:text-zinc-700" 
                                    placeholder="Artist Name"
                                  />
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <button onClick={() => setBulkSongs(prev => prev.filter((_, i) => i !== idx))} className="text-zinc-600 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                                  {currentUploadingIndex === idx && <span className="text-[10px] font-bold text-emerald-400 animate-pulse">Uploading...</span>}
                                </div>
                              </div>
                              
                              {/* Progress for bulk upload */}
                              {(statusList[idx] || isUploading) && (
                                <div className="mt-2 space-y-1">
                                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                                    <span className="text-zinc-500">{statusList[idx] || "waiting"}</span>
                                    <span className="text-emerald-400">{progressList[idx] || 0}%</span>
                                  </div>
                                  <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-emerald-400 transition-all duration-300 shadow-[0_0_8px_rgba(52,211,153,0.4)]"
                                      style={{ width: `${progressList[idx] || 0}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {bulkSongs.length > 0 && (
                          <div className="flex gap-3">
                            <button 
                              disabled={isUploading}
                              className={`flex-1 ${isUploading ? 'bg-zinc-800 text-zinc-500' : 'bg-emerald-400 text-black hover:bg-emerald-300'} font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2`}
                                onClick={async () => {
                                  setIsUploading(true);
                                  setProgressList(new Array(bulkSongs.length).fill(0));
                                  setStatusList(new Array(bulkSongs.length).fill('waiting'));

                                  const concurrency = 3;
                                  const queue = bulkSongs
                                    .map((s, idx) => ({ ...s, originalIndex: idx }))
                                    .filter(s => s.status !== 'done');

                                  const processQueue = async () => {
                                    while (queue.length > 0) {
                                      const song = queue.shift();
                                      if (!song) break;
                                      const i = song.originalIndex;

                                      // Duplicate Detection for Bulk
                                      const isDup = songs.some(s => s.title.toLowerCase() === song.title.trim().toLowerCase());
                                      if (isDup && !song.confirmed) {
                                        if (!window.confirm(`"${song.title}" already exists. Re-upload this track?`)) {
                                          setBulkSongs(prev => { const c = [...prev]; c[i].status = 'idle'; return c; });
                                          updateStatus(i, 'skipped');
                                          continue;
                                        }
                                      }

                                      setCurrentUploadingIndex(i);
                                      updateStatus(i, "uploading");
                                      setBulkSongs(prev => { const c = [...prev]; c[i].status = 'uploading'; return c; });
                                      
                                      const audioData = await uploadToCloudinary(song.file, (p) => updateProgress(i, p));
                                      if (!audioData) {
                                        updateStatus(i, "failed");
                                        continue;
                                      }
                                      
                                      const finalSong = {
                                        id: Date.now() + i,
                                        title: song.title,
                                        artist: song.artist || 'Unknown Artist',
                                        time: audioData.duration ? formatTime(audioData.duration) : '0:00',
                                        cover: song.cover?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=150&h=150&fit=crop&q=80',
                                        coverPublicId: song.cover?.public_id,
                                        audioUrl: audioData.url,
                                        audioPublicId: audioData.public_id,
                                        audioBytes: audioData.bytes,
                                        coverBytes: song.cover?.bytes || 0,
                                        fingerprint: song.fingerprint,
                                        liked: false
                                      };
                                      
                                      await addDoc(collection(db, "songs"), finalSong);
                                      setBulkSongs(prev => { const c = [...prev]; c[i].status = 'done'; return c; });
                                      updateStatus(i, "completed");
                                      updateProgress(i, 100);
                                    }
                                  };

                                  const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(() => processQueue());
                                  await Promise.all(workers);

                                  setGlobalStatus("syncing");
                                  setGlobalStatus("done");
                                  setIsUploading(false);
                                  setCurrentUploadingIndex(null);
                                  alert("Bulk upload process completed!");
                                }}
                            >
                              <UploadCloud size={20} /> Deploy Bulk Sanctuary
                            </button>
                            <button onClick={() => setBulkSongs([])} className="px-6 border border-zinc-800 text-zinc-500 hover:bg-zinc-800/50 rounded-xl font-bold transition-all">Clear All</button>
                          </div>
                        )}
                      </div>
                    )
                  }
                  </div>

                  {/* Stats & Trending */}
                  <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Storage Used</p>
                        <p className="text-3xl font-bold text-emerald-400">{storageData ? formatBytes(storageData.used) : '0 GB'}</p>
                      </div>
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Total Storage</p>
                        <p className="text-3xl font-bold text-purple-400">25 GB</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 flex-1 max-h-[400px] overflow-y-auto scrollbar-hide">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold">Manage Uploaded Songs</h3>
                      </div>
                      <div className="flex flex-col gap-4 mb-6">
                        {songs.map((song) => (
                          <div key={song.id} className="flex items-center justify-between p-2 hover:bg-zinc-800/50 rounded-lg group">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <img src={song.cover} className="w-10 h-10 rounded-md object-cover shrink-0 shadow-sm" />
                              <div className="truncate">
                                <p className="text-sm font-medium text-zinc-200 truncate pr-2">{song.title}</p>
                                <p className="text-xs text-zinc-500 truncate">{song.artist}</p>
                              </div>
                            </div>
                            <button onClick={() => deleteSong(song.id)} className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                        {songs.length === 0 && (
                          <p className="text-sm text-zinc-500 text-center py-4">No uploaded songs yet.</p>
                        )}
                      </div>
                    </div>
                    
                    {storageData && (
                      <div className="mb-4 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6">
                        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Cloudinary Space</p>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-lg font-bold text-emerald-400">{formatBytes(storageData.used)}</span>
                          <span className="text-sm font-medium text-zinc-500">of 25 GB limit</span>
                        </div>
                        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-400 rounded-full transition-all duration-1000" 
                            style={{ width: `${Math.min((storageData.used / (25 * 1024 * 1024 * 1024)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="bg-zinc-950/50 border border-zinc-800 rounded-3xl p-6">
                      <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <BarChart size={16} className="text-emerald-400" /> Analytics & Optimization
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">Total Analyzed</span>
                          <span className="text-zinc-200 font-bold">{songs.length} tracks</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">Redundant Content</span>
                          <span className={`${storageStats.dupsFingerCount > 0 ? 'text-red-400' : 'text-emerald-400'} font-bold`}>
                            {storageStats.dupsFingerCount} identical hashes
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">Duplicate Titles</span>
                          <span className="text-orange-400 font-bold">{storageStats.dupsTitleCount} songs</span>
                        </div>
                        
                        <div className="pt-4 border-t border-zinc-800/50">
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Top 5 Large Files</p>
                          <div className="space-y-2">
                            {storageStats.largeFiles.map((f, i) => (
                              <div key={i} className="flex justify-between items-center text-[10px]">
                                <span className="text-zinc-400 truncate max-w-[120px]">{f.title}</span>
                                <span className="text-zinc-500 font-mono">{formatBytes((f.audioBytes || 0) + (f.coverBytes || 0))}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {(storageStats.dupsFingerCount > 0 || storageStats.largeFiles.length > 0) && (
                          <div className="mt-4 p-3 bg-emerald-400/5 border border-emerald-400/10 rounded-xl">
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                              <ShieldCheck size={10} /> Optimization Suggestions
                            </p>
                            <ul className="text-[10px] text-zinc-400 list-disc list-inside">
                              {storageStats.dupsFingerCount > 0 && <li>Delete duplicate fingerprints to save {formatBytes(storageStats.dupsFingerCount * 5 * 1024 * 1024)} (estimated)</li>}
                              {storageStats.largeFiles.length > 0 && <li>Consider optimizing files over 10MB</li>}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    <button 
                      onClick={async () => {
                        if (!window.confirm("Are you sure you want to completely delete the database? This deletes all Cloudinary uploads permanently.")) return;
                        const uploadedSongs = songs.filter(s => s.id !== 0);
                        for (const s of uploadedSongs) {
                          if ((s as any).audioPublicId) await deleteFromCloudinary((s as any).audioPublicId, 'video');
                          if ((s as any).coverPublicId) await deleteFromCloudinary((s as any).coverPublicId, 'image');
                        }
                        setSongs([]);
                        if (audioRef.current) {
                          audioRef.current.pause();
                          audioRef.current.removeAttribute('src');
                        }
                        setIsPlaying(false);
                        setCurrentSong(EMPTY_SONG);
                      }}
                      className="w-full border border-red-500/20 text-red-500 hover:bg-red-500/10 hover:border-red-500/50 transition-colors font-medium py-3 rounded-xl"
                    >
                      Delete the DB
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* Recently Uploaded View */}
            {currentView === 'recent' && (
              <motion.div key="recent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8">
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Recently Uploaded</h1>
                  <p className="text-zinc-500 mb-8">Tracks recently added to the platform by administrators.</p>
                </div>
                
                {songs.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {songs.map((song, index) => {
                      const isActive = currentSong.id === song.id;
                      return (
                        <div 
                          key={song.id}
                          onClick={() => playSong(song)}
                          className={`grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-4 items-center px-4 py-3 rounded-xl cursor-pointer transition-colors group ${
                            isActive ? 'bg-emerald-400/10 border border-emerald-400/20' : 'hover:bg-zinc-800/50 border border-transparent'
                          }`}
                        >
                          <div className="w-8 text-center text-zinc-500 font-medium">
                            {isActive && isPlaying ? (
                              <div className="flex items-end justify-center gap-0.5 h-4">
                                <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                <motion.div animate={{ height: [8, 16, 8] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                <motion.div animate={{ height: [6, 10, 6] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                              </div>
                            ) : (
                              <span className={isActive ? 'text-emerald-400' : 'group-hover:hidden'}>{index + 1}</span>
                            )}
                            {!isActive && <Play size={16} className="hidden group-hover:inline-block text-zinc-100" fill="currentColor" />}
                          </div>
                          
                          <div className="flex items-center gap-4 overflow-hidden">
                            <img src={song.cover} alt={song.title} className="w-10 h-10 rounded-md object-cover shadow-md" />
                            <div className="truncate">
                              <div className={`font-medium truncate ${isActive ? 'text-emerald-400' : 'text-zinc-100'}`}>{song.title}</div>
                              <div className="text-sm text-zinc-500 truncate md:hidden">{song.artist}</div>
                            </div>
                          </div>
                          
                          <div className="hidden md:block text-sm text-zinc-400 truncate">{song.artist}</div>
                          
                          <div className="w-16 text-right flex items-center justify-end gap-4">
                            <Heart size={16} className={song.liked ? 'text-emerald-400 fill-emerald-400' : 'text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100'} />
                            <span className="text-sm text-zinc-500">{song.time}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <ListMusic size={48} className="text-zinc-800 mb-4" />
                    <h3 className="text-xl font-bold text-zinc-300">No Recent Uploads</h3>
                    <p className="text-zinc-500 mt-2">Songs uploaded from the Admin dashboard will appear here.</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Your Library View */}
            {currentView === 'library' && (
              <motion.div key="library" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Your Library</h1>
                  <div className="flex items-center gap-6 border-b border-zinc-800 pb-2">
                    <button 
                      onClick={() => setLibraryTab('liked')}
                      className={`${libraryTab === 'liked' ? 'text-emerald-400 border-emerald-400' : 'text-zinc-500 hover:text-zinc-300 border-transparent'} font-semibold border-b-2 pb-2 -mb-[10px] transition-all`}
                    >Liked Songs</button>
                    <button 
                      onClick={() => setLibraryTab('playlists')}
                      className={`${libraryTab === 'playlists' ? 'text-emerald-400 border-emerald-400' : 'text-zinc-500 hover:text-zinc-300 border-transparent'} font-semibold border-b-2 pb-2 -mb-[10px] transition-all`}
                    >Playlists</button>
                    <button 
                      onClick={() => setLibraryTab('favorites')}
                      className={`${libraryTab === 'favorites' ? 'text-emerald-400 border-emerald-400' : 'text-zinc-500 hover:text-zinc-300 border-transparent'} font-semibold border-b-2 pb-2 -mb-[10px] transition-all`}
                    >Favorites</button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  {libraryTab === 'liked' && (
                    <>
                      {songs.filter(s => s.liked).map((song, index) => {
                        const isActive = currentSong.id === song.id;
                        return (
                          <div 
                            key={song.id}
                            onClick={() => playSong(song)}
                            className={`grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-4 items-center px-4 py-3 rounded-xl cursor-pointer transition-colors group ${
                              isActive ? 'bg-emerald-400/10 border border-emerald-400/20' : 'hover:bg-zinc-800/50 border border-transparent'
                            }`}
                          >
                            <div className="w-8 text-center text-zinc-500 font-medium">
                              {isActive && isPlaying ? (
                                <div className="flex items-end justify-center gap-0.5 h-4">
                                  <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                  <motion.div animate={{ height: [8, 16, 8] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                  <motion.div animate={{ height: [6, 10, 6] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                </div>
                              ) : (
                                <span className={isActive ? 'text-emerald-400' : 'group-hover:hidden'}>{index + 1}</span>
                              )}
                              {!isActive && <Play size={16} className="hidden group-hover:inline-block text-zinc-100" fill="currentColor" />}
                            </div>
                            
                            <div className="flex items-center gap-4 overflow-hidden">
                              <img src={song.cover} alt={song.title} className="w-10 h-10 rounded-md object-cover shadow-md" />
                              <div className="truncate">
                                <div className={`font-medium truncate ${isActive ? 'text-emerald-400' : 'text-zinc-100'}`}>{song.title}</div>
                                <div className="text-sm text-zinc-500 truncate md:hidden">{song.artist}</div>
                              </div>
                            </div>
                            
                            <div className="hidden md:block text-sm text-zinc-400 truncate">{song.artist}</div>
                            
                            <div className="w-16 text-right flex items-center justify-end gap-4">
                              <Heart size={16} onClick={(e) => toggleLike(e, song.id)} className={song.liked ? 'text-emerald-400 fill-emerald-400' : 'text-zinc-500'} />
                              <span className="text-sm text-zinc-500">{song.time}</span>
                            </div>
                          </div>
                        );
                      })}
                      {songs.filter(s => s.liked).length === 0 && (
                        <div className="text-center py-20 text-zinc-500">
                          <Heart size={48} className="mx-auto text-zinc-800 mb-4" />
                          <p className="text-lg font-medium text-zinc-400">No Liked Songs Yet</p>
                          <p className="text-sm mt-1">Tap the heart on any track to add it to your library.</p>
                        </div>
                      )}
                    </>
                  )}

                  {libraryTab === 'playlists' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 py-4">
                      {playlists.map((pl) => (
                        <motion.div 
                          key={pl.firebaseId}
                          whileHover={{ y: -5 }}
                          className="flex flex-col gap-3 p-4 rounded-2xl bg-zinc-900/50 hover:bg-zinc-800 transition-colors cursor-pointer group border border-zinc-800/50"
                        >
                          <div className="aspect-square rounded-xl bg-zinc-800 flex items-center justify-center relative overflow-hidden shadow-xl">
                            <ListMusic size={48} className="text-zinc-700 group-hover:scale-110 transition-transform" />
                            <div className="absolute inset-0 bg-emerald-400/0 group-hover:bg-emerald-400/10 transition-colors flex items-center justify-center">
                              <Play size={40} className="text-emerald-400 opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100" fill="currentColor" />
                            </div>
                          </div>
                          <div>
                            <h3 className="font-bold text-zinc-100 truncate">{pl.name}</h3>
                            <p className="text-sm text-zinc-500">{pl.songs?.length || 0} tracks</p>
                          </div>
                        </motion.div>
                      ))}
                      <div 
                        onClick={() => setCurrentView('dashboard')}
                        className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-dashed border-zinc-800 hover:border-emerald-400/30 transition-colors cursor-pointer group items-center justify-center text-center py-12"
                      >
                        <PlusCircle size={32} className="text-zinc-700 group-hover:text-emerald-400 transition-colors mb-2" />
                        <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-300">Create New Playlist</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Search View */}
            {currentView === 'search' && (
              <motion.div key="search" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8 min-h-[400px]">
                <div className="md:hidden mt-4">
                  <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 focus-within:border-emerald-400 transition-colors">
                    <Search size={20} className="text-zinc-400 mr-3" />
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="What do you want to listen to?" 
                      className="bg-transparent border-none outline-none text-base w-full placeholder:text-zinc-500"
                    />
                  </div>
                </div>

                {searchQuery.trim() === '' ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500">
                    <Search size={48} className="text-zinc-800 mb-4" />
                    <h3 className="text-xl font-bold text-zinc-300">Explore Sanctuary</h3>
                    <p className="mt-2 text-sm max-w-sm mx-auto">Find your favorite tracks, artists, or algorithmic transitions across the entire synced library.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 mt-4">
                    <h2 className="text-2xl font-bold tracking-tight">Top Results for "{searchQuery}"</h2>
                    
                    <div className="flex flex-col gap-1">
                      {songs.filter(s => s.id !== 0 && (s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.artist.toLowerCase().includes(searchQuery.toLowerCase()))).length > 0 ? (
                        songs.filter(s => s.id !== 0 && (s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.artist.toLowerCase().includes(searchQuery.toLowerCase()))).map((song, index) => {
                          const isActive = currentSong.id === song.id;
                          return (
                            <div 
                              key={`search-${song.id}`}
                              onClick={() => playSong(song)}
                              className={`grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-4 items-center px-4 py-3 rounded-xl cursor-pointer transition-colors group ${
                                isActive ? 'bg-emerald-400/10 border border-emerald-400/20' : 'hover:bg-zinc-800/50 border border-transparent'
                              }`}
                            >
                              <div className="w-8 text-center text-zinc-500 font-medium">
                                {isActive && isPlaying ? (
                                  <div className="flex items-end justify-center gap-0.5 h-4">
                                    <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                    <motion.div animate={{ height: [8, 16, 8] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                    <motion.div animate={{ height: [6, 10, 6] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }} className="w-1 bg-emerald-400 rounded-t-sm" />
                                  </div>
                                ) : (
                                  <span className={isActive ? 'text-emerald-400' : 'group-hover:hidden'}>{index + 1}</span>
                                )}
                                {!isActive && <Play size={16} className="hidden group-hover:inline-block text-zinc-100" fill="currentColor" />}
                              </div>
                              
                              <div className="flex items-center gap-4 overflow-hidden">
                                <img src={song.cover} alt={song.title} className="w-10 h-10 rounded-md object-cover shadow-md" />
                                <div className="truncate">
                                  <div className={`font-medium truncate ${isActive ? 'text-emerald-400' : 'text-zinc-100'}`}>{song.title}</div>
                                  <div className="text-sm text-zinc-500 truncate md:hidden">{song.artist}</div>
                                </div>
                              </div>
                              
                              <div className="hidden md:block text-sm text-zinc-400 truncate">{song.artist}</div>
                              
                              <div className="w-16 text-right flex items-center justify-end gap-4">
                                <Heart size={16} onClick={(e) => toggleLike(e, song.id)} className={song.liked ? 'text-emerald-400 fill-emerald-400' : 'text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100'} />
                                <span className="text-sm text-zinc-500">{song.time}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-12 text-zinc-500">
                          <p>No tracks found matching your query.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* --- Persistent Bottom Player (Desktop & Mobile Mini) --- */}
      {currentSong.id !== 0 && isPlayerVisible && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-40 px-2 pb-20 md:pb-4 md:px-6 pointer-events-none">
          <div className="bg-[#121212]/95 backdrop-blur-xl border border-zinc-800/50 rounded-2xl md:rounded-3xl shadow-2xl p-2 md:p-3 flex items-center justify-between pointer-events-auto max-w-6xl mx-auto relative">
          
          <button 
            onClick={(e) => { e.stopPropagation(); handleCancel(); }}
            className="absolute -top-2 -left-2 w-6 h-6 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-all z-50 pointer-events-auto shadow-lg"
          >
            <X size={14} />
          </button>
          
          {/* Song Info (Clickable to expand) */}
          <div 
            className="flex items-center gap-3 w-[45%] md:w-[30%] min-w-[140px] cursor-pointer"
            onClick={handleExpandMobilePlayer}
          >
            <img src={currentSong.cover} alt="Cover" className="w-12 h-12 md:w-14 md:h-14 rounded-lg object-cover shadow-md shrink-0" />
            <div className="overflow-hidden flex-1 shrink-0">
              <h4 className="text-sm font-semibold text-zinc-100 truncate">{currentSong.title}</h4>
              <p className="text-xs text-zinc-400 truncate">{currentSong.artist}</p>
            </div>
          </div>

          {/* Controls (Desktop) */}
          <div className="hidden md:flex flex-col items-center justify-center flex-1 w-full px-2 max-w-[40%]">
            <div className="flex items-center gap-4 lg:gap-6 mb-2">
              <button onClick={() => setIsShuffle(!isShuffle)} className={`transition-colors shrink-0 ${isShuffle ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-100'}`}><Shuffle size={18} /></button>
              <button onClick={handlePrevSong} className="text-zinc-300 hover:text-white transition-colors shrink-0"><SkipBack size={24} fill="currentColor" /></button>
              <button 
                onClick={togglePlay}
                className="w-10 h-10 bg-emerald-400 rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform shadow-lg shadow-emerald-400/20 shrink-0"
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
              </button>
              <button onClick={handleNextSong} className="text-zinc-300 hover:text-white transition-colors shrink-0"><SkipForward size={24} fill="currentColor" /></button>
              <button onClick={() => setIsRepeat(!isRepeat)} className={`transition-colors shrink-0 ${isRepeat ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-100'}`}><Repeat size={18} /></button>
            </div>
            <div className="flex items-center gap-3 w-full text-xs text-zinc-500 font-medium">
              <span className="shrink-0 w-8 text-right">{formatTime(currentTime)}</span>
              <div 
                className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden group cursor-pointer w-full max-w-full"
                onClick={handleSeek}
              >
                <div 
                  className="h-full rounded-full relative transition-all duration-100"
                  style={{ 
                    width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #FF00CC 0%, #FF0066 15%, #FF0033 30%, #FF3300 50%, #FF6600 70%, #FF9900 85%, #FFCC00 100%)',
                    boxShadow: '0 0 6px #FF00CC, 0 0 10px #FF3300, 0 0 14px #FFCC00'
                  }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-sm" />
                </div>
              </div>
              <span className="shrink-0 w-8 text-left">{currentSong.audioUrl || duration ? formatTime(duration) : currentSong.time}</span>
            </div>
          </div>

          {/* Controls (Mobile Mini) */}
          <div className="flex md:hidden items-center gap-4 pr-2 shrink-0">
            <button onClick={togglePlay} className="text-zinc-100">
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </button>
          </div>

          {/* Extra Controls (Desktop) */}
          <div className="hidden md:flex items-center justify-end gap-6 w-[30%] min-w-[140px] text-zinc-400">
            <Heart 
              size={18} 
              onClick={toggleLike}
              className={`shrink-0 cursor-pointer transition-colors ${currentSong.liked ? 'text-emerald-400 fill-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`} 
            />
            <div className="flex flex-col items-center gap-1 group">
               <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-1.5 h-16 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-emerald-400 transition-all"
                  style={{ 
                    WebkitAppearance: 'slider-vertical',
                    writingMode: 'bt-lr' as any
                  }}
               />
               <button onClick={toggleMute} className="hover:text-zinc-100 transition-colors shrink-0 outline-none pb-1">
                 {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
               </button>
            </div>
            <button className="hover:text-zinc-100 transition-colors shrink-0"><ListMusic size={18} /></button>
            <button onClick={handleExpandMobilePlayer} className="hover:text-zinc-100 transition-colors shrink-0"><Maximize2 size={18} /></button>
          </div>
        </div>
      </div>
      )}

      {/* --- Mobile Bottom Navigation --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0a0a0a]/90 backdrop-blur-lg border-t border-zinc-800/50 z-50 flex items-center justify-around px-2 pb-safe">
        <button onClick={() => setCurrentView('home')} className={`flex flex-col items-center gap-1 ${currentView === 'home' ? 'text-emerald-400' : 'text-zinc-500'}`}>
          <Home size={22} />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        <button onClick={() => setCurrentView('recent')} className={`flex flex-col items-center gap-1 ${currentView === 'recent' ? 'text-emerald-400' : 'text-zinc-500'}`}>
          <ListMusic size={22} />
          <span className="text-[10px] font-medium">Recent</span>
        </button>
        <button onClick={() => setCurrentView('search')} className={`flex flex-col items-center gap-1 ${currentView === 'search' ? 'text-emerald-400' : 'text-zinc-500'}`}>
          <Search size={22} />
          <span className="text-[10px] font-medium">Search</span>
        </button>
        <button onClick={() => setCurrentView('library')} className={`flex flex-col items-center gap-1 ${currentView === 'library' ? 'text-emerald-400' : 'text-zinc-500'}`}>
          <Library size={22} />
          <span className="text-[10px] font-medium">Library</span>
        </button>
        <button onClick={() => setCurrentView('dashboard')} className={`flex flex-col items-center gap-1 ${currentView === 'dashboard' ? 'text-emerald-400' : 'text-zinc-500'}`}>
          <ShieldCheck size={22} />
          <span className="text-[10px] font-medium">Admin</span>
        </button>
      </nav>

      {/* --- Mobile Full Screen Player --- */}
      <AnimatePresence>
        {isMobilePlayerExpanded && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] bg-[#0a0a0a] flex flex-col"
          >
            {/* Blurred Background */}
            <div 
              className="absolute inset-0 opacity-40 blur-3xl scale-110"
              style={{ backgroundImage: `url(${currentSong.cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#0a0a0a]/80 to-[#0a0a0a]" />

            {/* Content */}
            <div className="relative z-10 flex flex-col h-full p-6 pb-12">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <button onClick={() => setIsMobilePlayerExpanded(false)} className="p-2 -ml-2 text-zinc-300">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <div className="text-center">
                  <p className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">Playing from playlist</p>
                  <p className="text-sm font-bold text-zinc-100">Midnight Sanctuary</p>
                </div>
                <button className="p-2 -mr-2 text-zinc-300"><MoreHorizontal size={24} /></button>
              </div>

              {/* Artwork */}
              <div className="flex-1 flex items-center justify-center mb-8">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="aspect-square w-full max-w-[320px] rounded-2xl overflow-hidden shadow-2xl relative"
                >
                  <img src={currentSong.cover} alt="Cover" className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 ring-1 ring-white/10 rounded-2xl pointer-events-none" />
                </motion.div>
              </div>

              {/* Info & Controls */}
              <div className="mt-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">{currentSong.title}</h2>
                    <p className="text-lg text-zinc-400 font-medium truncate">{currentSong.artist}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-2">
                       <input 
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-1.5 h-20 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-emerald-400 transition-all"
                        style={{ 
                          WebkitAppearance: 'slider-vertical',
                          writingMode: 'bt-lr' as any
                        }}
                      />
                      <button onClick={toggleMute} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                        {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                    </div>
                    <button onClick={toggleLike} className="shrink-0 p-2">
                      <Heart size={28} className={currentSong.liked ? 'text-emerald-400 fill-emerald-400' : 'text-zinc-300'} />
                    </button>
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-8">
                  <div 
                    className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2 cursor-pointer relative"
                    onClick={handleSeek}
                  >
                    <div 
                      className="h-full rounded-full transition-all duration-100 relative"
                      style={{ 
                        width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                        background: 'linear-gradient(90deg, #FF00CC 0%, #FF0066 15%, #FF0033 30%, #FF3300 50%, #FF6600 70%, #FF9900 85%, #FFCC00 100%)',
                        boxShadow: '0 0 6px #FF00CC, 0 0 10px #FF3300, 0 0 14px #FFCC00'
                      }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-400 font-medium">
                    <span>{formatTime(currentTime)}</span>
                    <span>{currentSong.audioUrl || duration ? formatTime(duration) : currentSong.time}</span>
                  </div>
                </div>

                {/* Main Controls */}
                <div className="flex items-center justify-between mb-8">
                  <button onClick={() => setIsShuffle(!isShuffle)} className={`transition-colors ${isShuffle ? 'text-emerald-400' : 'text-zinc-400'}`}><Shuffle size={24} /></button>
                  <button onClick={handlePrevSong} className="text-zinc-100 hover:text-white transition-colors"><SkipBack size={36} fill="currentColor" /></button>
                  <button 
                    onClick={togglePlay}
                    className="w-20 h-20 bg-emerald-400 rounded-full flex items-center justify-center text-black shadow-xl shadow-emerald-400/20 hover:scale-105 transition-transform"
                  >
                    {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-2" />}
                  </button>
                  <button onClick={handleNextSong} className="text-zinc-100 hover:text-white transition-colors"><SkipForward size={36} fill="currentColor" /></button>
                  <button onClick={() => setIsRepeat(!isRepeat)} className={`transition-colors ${isRepeat ? 'text-emerald-400' : 'text-zinc-400'}`}><Repeat size={24} /></button>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between text-zinc-400">
                  <button className="flex items-center gap-2 text-sm font-medium hover:text-zinc-100 bg-zinc-800/50 px-4 py-2 rounded-full transition-colors">
                    <Share2 size={16} /> Share
                  </button>
                  <div className="flex items-center gap-6">
                    <button><ListMusic size={20} className="hover:text-zinc-100 transition-colors" /></button>
                    <button onClick={toggleMute} className="outline-none hover:text-zinc-100 transition-colors">
                      {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <audio 
        ref={audioRef} 
        src={currentSong.audioUrl || ''} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleNextSong}
        autoPlay={isPlaying}
      />
    </div>
  );
}
