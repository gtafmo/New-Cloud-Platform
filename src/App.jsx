import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Play, Pause, SkipForward, SkipBack, Repeat, Repeat1, Shuffle, Volume2, Volume1, VolumeX, ListMusic, Heart, X, Search } from 'lucide-react';
import BubbleMenu from './components/BubbleMenu'; 
import Hls from 'hls.js';
import { 
  getQRKey, createQRCode, checkQRStatus, getUserAccount, 
  getUserPlaylists, getPlaylistSongs, getSongUrl, updatePlaylistTrack 
} from './services/api';
import CircularGallery from './components/CircularGallery';
import LyricsOverlay from './components/LyricsOverlay';
import { getSongLyric } from './services/api';

export default function App() {
  // --- 🌟 播放器核心状态（已彻底解耦） ---
  const [playingPlaylist, setPlayingPlaylist] = useState([]); // 🎵 唱片机：底层真实的播放队列
  const [playingIndex, setPlayingIndex] = useState(-1);       // 🎵 唱片机：当前正在播放的真实序号
  const [viewingPlaylist, setViewingPlaylist] = useState([]); // 👁️ 展示柜：当前舞台正在显示的歌单
  
  const [isPlaying, setIsPlaying] = useState(false);     
  const [playMode, setPlayMode] = useState(0);           
  const [volume, setVolume] = useState(1);               
  const [currentTime, setCurrentTime] = useState(0);     
  const [duration, setDuration] = useState(0);           

  // --- 用户状态与缓存 ---
  const [cookie, setCookie] = useState(localStorage.getItem('netease_cookie') || '');
  const [profile, setProfile] = useState(null);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState('');
  
  // --- 搜索框状态 ---
  const [searchQuery, setSearchQuery] = useState('');
  
  // --- 弹窗显隐控制 ---
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [qrCodeImg, setQrCodeImg] = useState('');
  const [qrStatusText, setQrStatusText] = useState('');
  const [showQueue, setShowQueue] = useState(false);
  const [showFavPopup, setShowFavPopup] = useState(false);

  // --- 硬件引用 ---
  const audioRef = useRef(null);
  const bgVideoRef = useRef(null); 
  const scrollContainerRef = useRef(null);
  const pollingTimerRef = useRef(null);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [currentLyric, setCurrentLyric] = useState(''); 
  const activePlaylistIdRef = useRef(null);

  const triggerToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  // 🌟 强行接管背景视频控制权，专治老旧/套壳浏览器拦截
  useEffect(() => {
    const video = bgVideoRef.current;
    if (video) {
      // 1. 强制注入底层静音属性，防止被识别为有声广告
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;

      // 2. 强行用代码触发播放
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("浏览器自动播放拦截拦截了视频，正等待用户交互恢复:", error);
        });
      }
    }
  }, []);

  const handleTimeUpdate = () => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); };
  const handleLoadedMetadata = () => { if (audioRef.current) setDuration(audioRef.current.duration); };

  const handleAudioEnded = () => {
    if (playMode === 1) {
      if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); }
    } else {
      triggerNextSong();
    }
  };

  // 🌟 静音白名单解锁引擎
  useEffect(() => {
    const unlockAudio = () => {
      if (audioRef.current && !audioRef.current.getAttribute('data-unlocked')) {
        audioRef.current.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        audioRef.current.play().then(() => {
          audioRef.current.pause();
          audioRef.current.src = ''; 
          audioRef.current.setAttribute('data-unlocked', 'true'); 
        }).catch(() => {});
      }
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const loadAppData = async (currentCookie) => {
    try {
      const cookieParam = encodeURIComponent(currentCookie);
      const account = await getUserAccount(cookieParam);
      if (!account.profile) throw new Error('凭证失效');
      
      setProfile(account.profile);
      const playlistsData = await getUserPlaylists(account.profile.userId, cookieParam);
      if (playlistsData.playlist?.length > 0) {
        setUserPlaylists(playlistsData.playlist);
        await fetchPlaylistTracksWithCache(playlistsData.playlist[0].id, currentCookie);
      }
    } catch (err) {
      localStorage.removeItem('netease_cookie');
      setCookie('');
      setProfile(null);
    }
  };

  // 🌟 100首并发极速缓存引擎 (修改为更新 viewingPlaylist)
  const fetchPlaylistTracksWithCache = async (pid, currentCookie) => {
    setIsLoading(true);
    setSearchQuery(''); 
    activePlaylistIdRef.current = pid; 
    
    const cookieParam = encodeURIComponent(currentCookie);
    try {
      const songsData = await getPlaylistSongs(pid, cookieParam);
      const songs = songsData.songs || [];
      
      if (songs.length === 0) {
        setViewingPlaylist([]); // 只更新视图，不影响播放！
        setIsLoading(false);
        return;
      }

      const firstBatch = songs.slice(0, 100);
      const firstBatchIds = firstBatch.map(s => s.id).join(',');
      
      try {
        const urlData = await getSongUrl(firstBatchIds, cookieParam);
        const urlMap = {};
        urlData.data?.forEach(item => { urlMap[item.id] = item.url; });
        firstBatch.forEach(s => { s.mp3Url = urlMap[s.id] || null; });
      } catch (e) {
        console.error("首屏先锋队 URL 拉取失败:", e);
      }
      
      // 🌟 视图渲染：数据进入展示柜。不暂停 audio，不重置 playingIndex！
      setViewingPlaylist(firstBatch); 
      setIsLoading(false); 

      if (songs.length > 100) {
        const remainingSongs = songs.slice(100);
        (async () => {
          const chunkSize = 100;
          const silentlyProcessedSongs = [];
          
          for (let i = 0; i < remainingSongs.length; i += chunkSize) {
            if (activePlaylistIdRef.current !== pid) return; 

            const chunk = remainingSongs.slice(i, i + chunkSize);
            const batchIds = chunk.map(s => s.id).join(',');
            try {
              const urlData = await getSongUrl(batchIds, cookieParam);
              const urlMap = {};
              urlData.data?.forEach(item => { urlMap[item.id] = item.url; });
              chunk.forEach(s => { s.mp3Url = urlMap[s.id] || null; });
              silentlyProcessedSongs.push(...chunk);
            } catch (e) {}
          }
          
          if (activePlaylistIdRef.current === pid) {
            setViewingPlaylist(prev => [...prev, ...silentlyProcessedSongs]);
          }
        })();
      }
    } catch (e) {
      triggerToast('加载歌单失败');
      setIsLoading(false);
    }
  };

  useEffect(() => { if (cookie) loadAppData(cookie); }, [cookie]);

  const handleStartLogin = async () => {
    setShowLoginModal(true);
    setQrStatusText('正在获取授权码...');
    try {
      const keyData = await getQRKey();
      const unikey = keyData.data.unikey;
      const qrData = await createQRCode(unikey);
      setQrCodeImg(qrData.data.qrimg);
      setQrStatusText('请打开网易云 APP 扫码');

      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = setInterval(async () => {
        const check = await checkQRStatus(unikey);
        if (check.code === 800) {
          setQrStatusText('二维码已过期'); clearInterval(pollingTimerRef.current);
        } else if (check.code === 802) { setQrStatusText('扫描成功，请在手机确认');
        } else if (check.code === 803) {
          clearInterval(pollingTimerRef.current);
          localStorage.setItem('netease_cookie', check.cookie);
          setCookie(check.cookie); setShowLoginModal(false); triggerToast('登录成功！');
        }
      }, 3000);
    } catch (e) { setQrStatusText('生成二维码失败'); }
  };

  // 🌟 核心播放引擎：加载并播放特定的音频流
  const loadAndPlayAudio = async (song) => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = ""; 
      audio.load();   
    }

    if (song.mp3Url && audioRef.current) {
      audioRef.current.src = song.mp3Url;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        if (err.name === 'NotAllowedError') {
          triggerToast('高版本浏览器限制，请手动点击播放');
          setIsPlaying(false);
        }
      });

      try {
        const lyricData = await getSongLyric(song.id, encodeURIComponent(cookie));
        setCurrentLyric(lyricData?.lrc?.lyric || '');
      } catch (e) {
        setCurrentLyric('');
      }
    } else {
      triggerToast('歌曲无可用播放源，自动跳过'); 
      setTimeout(triggerNextSong, 1000);
    }
  };

  // 🌟 交互 1：从 3D 舞台点击歌曲 (覆盖底层播放列表)
  const playFromGallery = async (index) => {
    if (index < 0 || index >= viewingPlaylist.length) return;
    setPlayingPlaylist([...viewingPlaylist]); // 拷贝视图队列到播放队列
    setPlayingIndex(index);
    await loadAndPlayAudio(viewingPlaylist[index]);
  };

  // 🌟 交互 2：从播放列表/上一首/下一首 切歌 (不影响 3D 舞台)
  const playFromQueue = async (index) => {
    if (index < 0 || index >= playingPlaylist.length) return;
    setPlayingIndex(index);
    await loadAndPlayAudio(playingPlaylist[index]);
  };

  const triggerNextSong = () => {
    if (playingPlaylist.length === 0) return;
    let nextIdx;
    if (playMode === 2) {
      do { nextIdx = Math.floor(Math.random() * playingPlaylist.length); } while (nextIdx === playingIndex && playingPlaylist.length > 1);
    } else { nextIdx = (playingIndex + 1) % playingPlaylist.length; }
    playFromQueue(nextIdx); // 操作队列
  };

  const triggerPrevSong = () => {
    if (playingPlaylist.length === 0) return;
    let prevIdx;
    if (playMode === 2) { prevIdx = Math.floor(Math.random() * playingPlaylist.length);
    } else { prevIdx = (playingIndex - 1 + playingPlaylist.length) % playingPlaylist.length; }
    playFromQueue(prevIdx); // 操作队列
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || playingPlaylist.length === 0) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => { audio.load(); audio.play(); });
    } else {
      audio.pause(); setIsPlaying(false);
    }
  };

  // 🌟 全局监听：点击空白处自动关闭弹窗
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (event.target.closest('.ignore-click-outside')) return;
      if (showQueue && !event.target.closest('.queue-popup-container')) setShowQueue(false);
      // 🌟 修复了这里的类名识别，原本你错写成了 queue-popup-container
      if (showFavPopup && !event.target.closest('.fav-popup-container')) setShowFavPopup(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showQueue, showFavPopup]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault(); togglePlay(); 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]); // 确保获取最新的 togglePlay 逻辑

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val); if (audioRef.current) audioRef.current.volume = val;
  };
  const handleProgressChange = (clickPercent) => {
    if (audioRef.current && duration) audioRef.current.currentTime = clickPercent * duration;
  };

  const handleAddToFavPlaylist = async (pid, playlistName) => {
    if (playingIndex === -1) return;
    const currentSong = playingPlaylist[playingIndex];
    try {
      setShowFavPopup(false); triggerToast('正在同步至云端...');
      const res = await updatePlaylistTrack('add', pid, currentSong.id, encodeURIComponent(cookie));
      if (res.status === 200 || res.code === 200) triggerToast(`成功添加至歌单：${playlistName}`);
      else if (res.body?.code === 502) triggerToast('歌曲已存在于该歌单中');
      else triggerToast('添加失败，受版权限制');
    } catch { triggerToast('云端同步失败'); }
  };

  const handleLogout = () => {
    if (window.confirm('确定要退出登录并清除本地缓存吗？')) {
      localStorage.removeItem('netease_cookie'); window.location.reload();
    }
  };

  // 🌟 3D 舞台使用的数据源 (viewingPlaylist)
  const displayPlaylist = useMemo(() => {
    if (searchQuery.trim() === '') {
      return viewingPlaylist.slice(0, 100);
    }
    const query = searchQuery.trim().toLowerCase();
    return viewingPlaylist.filter(song => {
      const songName = String(song?.name || '').toLowerCase();
      const artistNames = String(song?.ar?.map(a => a?.name || '').join(' ') || '').toLowerCase();
      return songName.includes(query) || artistNames.includes(query);
    });
  }, [viewingPlaylist, searchQuery]);

  // 获取当前正在播放的歌曲对象 (提供给底栏和歌词使用)
  const currentSong = playingIndex !== -1 && playingPlaylist.length > 0 ? playingPlaylist[playingIndex] : null;

  const bubbleMenuItems = useMemo(() => {
    return userPlaylists.map((list, idx) => ({
      label: list.name,
      rotation: idx % 2 === 0 ? -6 : 6, 
      hoverStyles: { bgColor: '#ffffff', textColor: '#000000' },
      onClick: () => fetchPlaylistTracksWithCache(list.id, cookie)
    }));
  }, [userPlaylists, cookie]);
    
  const galleryItems = useMemo(() => {
    return displayPlaylist.map(song => ({
      image: `${song.al.picUrl}?param=1000y1000`, 
      songName: song.name,
      artistName: song.ar.map(a => a.name).join(' / '),
      originalId: song.id
    }));
  }, [displayPlaylist]);

  return (
    <main className="relative bg-black h-screen w-screen flex flex-col overflow-hidden selection:bg-white selection:text-black shrink-0">
      <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={handleAudioEnded} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      <video 
  ref={bgVideoRef} 
  src="/videos/bg2.mp4" 
  autoPlay 
  muted 
  loop 
  playsInline 
  className="w-full h-full object-cover" 
/>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[4px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,0,0,0.1)_0%,_rgba(0,0,0,0.7)_100%)] pointer-events-none" />
      </div>

      <BubbleMenu
        useFixedPosition={false}
        logo={
          <div className="flex items-center gap-4 !overflow-visible">
            <div className="flex items-center gap-2 group cursor-pointer">
              <img 
                src="/images/icon.png" 
                alt="MusicSpace Icon" 
                className="w-10 h-10 transition-transform duration-700 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] group-hover:rotate-[360deg]" 
              />
              <span className="text-white font-semibold tracking-wider text-base hidden sm:block transition-colors duration-400">MusicSpace</span>
            </div>
            
            {profile && viewingPlaylist.length > 0 && (
              <div className="liquid-hover-container group flex items-center border border-white/20 rounded-full px-3 py-1.5 transition-all focus-within:border-white/50" onClick={(e) => e.stopPropagation()}>
                <Search className="w-4 h-4 text-white/50 group-hover:text-black/70 transition-colors duration-400" />
                <input
                  type="text"
                  placeholder="搜索当前歌单..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-white group-hover:text-black text-xs ml-2 w-24 sm:w-32 focus:w-40 transition-all placeholder:text-white/30 group-hover:placeholder:text-black/50"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-white/40 hover:text-black ml-1 bg-transparent border-none cursor-pointer flex items-center transition-colors duration-400">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        }
        
        rightContent={
          profile ? (
            <div onClick={handleLogout} className="liquid-hover-container group flex items-center gap-3 cursor-pointer px-4 py-1.5 rounded-full border border-white/20 transition-all" title="点击退出登录">
              <img src={profile.avatarUrl} alt="Avatar" className="w-6 h-6 rounded-full object-cover border border-white/20 group-hover:border-black/20 transition-colors duration-400" />
              <span className="text-white group-hover:text-black text-sm font-medium tracking-wide transition-colors duration-400">{profile.nickname}</span>
            </div>
          ) : (
            <button onClick={handleStartLogin} className="liquid-hover-container group rounded-full px-6 py-2 border border-white/20 transition-all cursor-pointer">
              <span className="relative z-10 text-white group-hover:text-black text-sm font-medium transition-colors duration-400">网易云登录</span>
            </button>
          )
        }
        items={bubbleMenuItems}
        menuAriaLabel="展开歌单分类大幕"
      />

      <section className="relative flex-1 w-full h-full z-10 overflow-hidden flex flex-col justify-center items-center">
        <AnimatePresence>
          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
              <div className="flex gap-2">
                <div className="loader-dot" /><div className="loader-dot" /><div className="loader-dot" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {viewingPlaylist.length === 0 && !isLoading ? (
          <div className="text-center max-w-2xl px-6 relative z-20">
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-white/60 text-xs tracking-[0.2em] uppercase mb-4">
              IMMERSIVE MUSIC PAVILION
            </motion.p>
            <motion.h1 style={{ fontFamily: "'Instrument Serif', serif" }} className="text-4xl md:text-[54px] font-medium leading-[1.2] bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
              请在右上角登录网易云，<br />开启你的沉浸式个人音乐空间。
            </motion.h1>
          </div>
        ) : galleryItems.length === 0 && searchQuery ? (
          <div className="text-center text-white/50 text-sm tracking-widest px-6 relative z-20">
            未找到与 "{searchQuery}" 相关的歌曲
          </div>
        ) : (
          <div className="absolute inset-0 w-full h-full z-10">
            {galleryItems.length > 0 && (
              <CircularGallery
                items={galleryItems}
                bend={-1.5}
                textColor="#ffffff"
                borderRadius={0.06}
                font="700 24px 'Playfair Display', serif"
                fontUrl="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap"
                scrollSpeed={2}
                scrollEase={0.05}
                onItemClick={(centeredIndex) => {
                  // 🌟 从舞台点击：触发 playFromGallery，覆盖播放列表
                  const clickedSongId = galleryItems[centeredIndex].originalId;
                  const actualIdx = viewingPlaylist.findIndex(s => s.id === clickedSongId);
                  if (actualIdx !== -1) playFromGallery(actualIdx);
                }}
              />
            )}
          </div>
        )}
      </section>

      <div className="relative z-30 w-full h-[88px] bg-black/60 backdrop-blur-2xl border-t border-white/10 flex justify-between items-center px-8">
        <div className="flex items-center gap-6 w-[30%]">
          <div className="flex items-center gap-3">
            <button onClick={triggerPrevSong} className="text-white/70 hover:text-white transition-transform active:scale-95 bg-transparent border-none cursor-pointer"><SkipBack className="w-5 h-5" /></button>
            <button onClick={togglePlay} className="text-white hover:scale-105 transition-transform active:scale-95 bg-transparent border-none cursor-pointer">
              {isPlaying ? <Pause className="w-9 h-9 fill-white" /> : <Play className="w-9 h-9 fill-white" />}
            </button>
            <button onClick={triggerNextSong} className="text-white/70 hover:text-white transition-transform active:scale-95 bg-transparent border-none cursor-pointer"><SkipForward className="w-5 h-5" /></button>
          </div>
          {currentSong && (
            <div className="flex items-center gap-3 max-w-[180px]">
              <div className="relative cursor-pointer group shrink-0" onClick={() => setIsLyricsOpen(true)} title="展开沉浸式歌词">
                <img src={currentSong.al.picUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-white/10 transition-transform group-active:scale-95" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg transition-colors duration-300 pointer-events-none" />
              </div>
              <div className="overflow-hidden">
                <div className="text-white text-sm font-medium truncate">{currentSong.name}</div>
                <div className="text-white/60 text-xs truncate mt-0.5">{currentSong.ar.map(a => a.name).join(' / ')}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 w-[40%] font-mono text-xs text-white/60">
          <span>{Math.floor(currentTime / 60).toString().padStart(2, '0')}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')}</span>
          <div onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); handleProgressChange((e.clientX - rect.left) / rect.width); }} className="flex-1 h-1.5 bg-white/20 rounded-full cursor-pointer relative group">
            <div style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} className="absolute h-full bg-white rounded-full relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md shadow-black" />
            </div>
          </div>
          <span>{Math.floor(duration / 60).toString().padStart(2, '0')}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}</span>
        </div>

        <div className="flex items-center justify-end gap-5 w-[30%]">
          <button onClick={() => setShowFavPopup(!showFavPopup)} className="ignore-click-outside text-white/70 hover:text-white transition-colors bg-transparent border-none cursor-pointer relative">
            <Heart className={`w-5 h-5 ${currentSong ? 'text-white/70' : 'opacity-30'}`} />
          </button>
          <button onClick={() => setPlayMode((prev) => (prev + 1) % 3)} className="text-white/70 hover:text-white transition-colors bg-transparent border-none cursor-pointer">
            {playMode === 0 && <Repeat className="w-5 h-5" title="列表循环" />}
            {playMode === 1 && <Repeat1 className="w-5 h-5" title="单曲循环" />}
            {playMode === 2 && <Shuffle className="w-5 h-5" title="随机播放" />}
          </button>
          <button onClick={() => setShowQueue(!showQueue)} className="ignore-click-outside text-white/70 hover:text-white transition-colors bg-transparent border-none cursor-pointer">
            <ListMusic className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <button className="text-white/70 bg-transparent border-none">
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : volume < 0.5 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolumeChange} className="w-16 h-1 bg-white/20 rounded-full appearance-none outline-none accent-white cursor-pointer" />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {/* 🌟 队列弹窗：显示底层播放队列 (playingPlaylist) */}
        {showQueue && (
          <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }} className="queue-popup-container absolute bottom-[98px] right-6 w-72 max-h-[400px] bg-black/90 border border-white/10 rounded-2xl p-4 flex flex-col z-40 backdrop-blur-xl shadow-2xl">
            <div className="text-white font-semibold text-sm mb-3 pb-2 border-b border-white/10">当前展示 ({displayPlaylist.length}首)</div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 p-1">
              {displayPlaylist.map((song) => {
                // 1. 找到这首歌在“展示柜(viewingPlaylist)”中的真实位置
                const actualIdx = viewingPlaylist.findIndex(s => s.id === song.id);
                // 2. 精准判断：这首歌是否正是后台“唱片机”里正在播放的那首
                const isPlayingThisSong = currentSong && currentSong.id === song.id;

                return (
                  <div 
  key={song.id} 
  onClick={() => playFromGallery(actualIdx)} 
  /* 🌟 核心优化：去掉小白条，改为通过 opacity 精准控制视觉优先级 */
  className={`flex justify-between items-center px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-300 
    ${isPlayingThisSong 
      ? 'bg-white/10 text-white shadow-[0_4px_20px_rgba(0,0,0,0.3)]' // 播放中的歌曲稍微加点深度，不加小白条
      : 'text-white/40 hover:text-white hover:bg-white/5' // 未播放的歌曲保持极简的 40% 透明度
    }`}
>
  <span className="text-xs truncate flex-1 mr-3 leading-[1.6] py-0.5">{song.name}</span>
  <span className="text-[10px] opacity-60 truncate max-w-[80px] text-right leading-[1.6] py-0.5">{song.ar[0].name}</span>
  
  {/* 🌟 额外增加：如果你需要更明显的标识，可以在最右侧加一个小圆点 */}
  {isPlayingThisSong && (
    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
  )}
</div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* 🌟 收藏弹窗：修复了类名为 fav-popup-container */}
        {showFavPopup && currentSong && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="fav-popup-container absolute bottom-[98px] right-24 w-64 max-h-56 bg-black/95 border border-white/10 rounded-xl p-2 flex flex-col z-40 backdrop-blur-xl shadow-2xl overflow-y-auto no-scrollbar">
            <div className="text-[11px] text-white/40 text-center py-2 border-b border-white/5 mb-2">同步添加至云端歌单...</div>
            <div className="flex flex-col space-y-0.5 px-1">
              {userPlaylists.map(list => (
                <div key={list.id} onClick={() => handleAddToFavPlaylist(list.id, list.name)} className="w-full text-left px-3 py-2.5 rounded-md flex items-center text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
                  <span className="text-xs truncate w-full leading-[1.6] py-0.5">{list.name}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {showLoginModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex justify-center items-center z-50">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white/10 border border-white/20 rounded-2xl p-8 w-80 text-center shadow-2xl relative backdrop-blur-2xl">
              <button onClick={() => { setShowLoginModal(false); clearInterval(pollingTimerRef.current); }} className="absolute top-4 right-4 text-white/60 hover:text-white bg-transparent border-none cursor-pointer"><X className="w-5 h-5" /></button>
              <div className="text-white font-medium mb-5 text-base">网易云 APP 扫码登录</div>
              <div className="w-48 h-48 bg-white rounded-xl mx-auto p-2 flex justify-center items-center overflow-hidden mb-4 shadow-inner">
                {qrCodeImg ? <img src={qrCodeImg} alt="QR Code" className="w-full h-full object-contain" /> : <div className="text-black/40 text-xs">加载中...</div>}
              </div>
              <div className="text-white/70 text-xs">{qrStatusText}</div>
            </motion.div>
          </div>
        )}

        {toast && (
          <motion.div initial={{ y: -20, opacity: 0, x: '-50%' }} animate={{ y: 0, opacity: 1, x: '-50%' }} exit={{ y: -20, opacity: 0, x: '-50%' }} className="fixed top-24 left-1/2 bg-white text-black font-semibold text-xs px-6 py-2.5 rounded-full shadow-2xl z-50 tracking-wide">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <LyricsOverlay 
        isOpen={isLyricsOpen} 
        onClose={() => setIsLyricsOpen(false)} 
        currentSong={currentSong}
        rawLyric={currentLyric}
        audioRef={audioRef}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onPrev={triggerPrevSong} 
        onNext={triggerNextSong} 
      />
    </main>
  );
}