import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useMotionTemplate, useAnimationFrame } from 'framer-motion';
// 🌟 引入了 VolumeX (静音图标)
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

const parseLrc = (lrcString) => {
  const lines = lrcString.split('\n');
  const parsed = [];
  const timeExp = /\[(\d{2}):(\d{2}\.\d{2,3})\]/;
  lines.forEach(line => {
    const match = timeExp.exec(line);
    if (match) {
      const time = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
      const text = line.replace(timeExp, '').trim();
      parsed.push({ time, text: text || '\u00A0' }); 
    }
  });
  return parsed;
};
// ==========================================
// 🌟 智能走马灯组件：处理超长歌名与歌手名
// ==========================================
const AutoMarquee = ({ text = '', className, style, charLimit = 15 }) => {
  // 判断中英文字符长度，超出限制则开启滚动
  const isLong = text.length > charLimit;

  if (!isLong) {
    return (
      <div className={`text-center ${className}`} style={{ ...style, width: '100%' }}>
        {text}
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden flex items-center"
      style={{
        // 🌟 边缘羽化渐变遮罩，两端文字会柔和消失，极客质感拉满
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
        maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)'
      }}
    >
      {/* 无缝滚动容器，包含两份完全一样的内容和间距 */}
      <div
        className="inline-block whitespace-nowrap will-change-transform"
        style={{ animation: 'seamlessMarquee 12s linear infinite' }}
      >
        <span className={className} style={style}>{text}</span>
        <span className="inline-block w-16"></span> {/* 循环间距 */}
        <span className={className} style={style}>{text}</span>
        <span className="inline-block w-16"></span>
      </div>
    </div>
  );
};

// ==========================================
// 1. 3D 悬浮卡片组件 (修复缩放动画，防冲突)
// ==========================================
const InteractiveCover = ({ currentSong }) => {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const isHoveredRef = useRef(false);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  
  const springX = useSpring(rawX, { stiffness: 150, damping: 22 });
  const springY = useSpring(rawY, { stiffness: 150, damping: 22 });

  const rotateX = useTransform(springY, [-0.5, 0.5], [12, -12]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-12, 12]);

  const rimX = useTransform(springX, [-0.5, 0.5], [0, 100]);
  const rimY = useTransform(springY, [-0.5, 0.5], [0, 100]);
  
  const rimBackground = useMotionTemplate`radial-gradient(250px circle at ${rimX}% ${rimY}%, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.1) 40%, transparent 100%)`;

  const shadowX = useTransform(springX, [-0.5, 0.5], [-15, 15]);
  const shadowY = useTransform(springY, [-0.5, 0.5], [-15, 15]);
  const shadowAlpha = useTransform(springX, () => isHoveredRef.current ? 0.2 : 0.1);
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 40px rgba(255, 255, 255, ${shadowAlpha}), 0 20px 50px rgba(0, 0, 0, 0.8)`;

  useAnimationFrame((time) => {
    if (isHoveredRef.current) return; 
    const tX = time * 0.001;
    const tY = time * 0.0013;
    rawX.set(Math.cos(tX) * 0.4);
    rawY.set(Math.sin(tY) * 0.4);
  });

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    rawX.set(mouseX / rect.width - 0.5);
    rawY.set(mouseY / rect.height - 0.5);

    cardRef.current.style.setProperty('--mouse-x', `${mouseX}px`);
    cardRef.current.style.setProperty('--mouse-y', `${mouseY}px`);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    isHoveredRef.current = true;
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    isHoveredRef.current = false;
    rawX.set(0);
    rawY.set(0);
  };

  return (
    /* 🌟 外层占位容器：确保卡片无论怎么缩放，都不会挤压下方状态栏 */
    <div className="w-[360px] h-[360px] flex items-center justify-center perspective-[1200px]">
      <motion.div
        ref={cardRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        /* 🌟 恢复卡片缩放：离开时 85% 大小，触碰时 100% 满血复活 */
        initial={{ scale: 0.80 }}
        animate={{ scale: isHovered ? 1 : 0.80 }}
        transition={{ scale: { type: "spring", stiffness: 240, damping: 22 } }}
        style={{ rotateX, rotateY, boxShadow, willChange: "transform" }}
        className="relative w-full h-full shrink-0 rounded-[32px] p-[2.5px] bg-white/5 overflow-hidden group z-10"
      >
        <motion.div style={{ background: rimBackground }} className="absolute inset-0 rounded-[32px] pointer-events-none z-0" />
        <div className="w-full h-full rounded-[31px] overflow-hidden relative bg-[#0a0a0a] z-10 select-none pointer-events-none">
          {currentSong?.al?.picUrl ? (
            <img src={`${currentSong.al.picUrl}?param=800y800`} alt="cover" className="w-full h-full object-cover opacity-90" />
          ) : (
            <div className="w-full h-full bg-transparent" />
          )}
          <div
            className="absolute inset-0 z-20 transition-opacity duration-300"
            style={{ opacity: isHovered ? 1 : 0, background: 'radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.15) 0%, transparent 50%)' }}
          />
        </div>
      </motion.div>
    </div>
  );
};

// ==========================================
// 2. 玻璃态磁吸 Dock 组件
// ==========================================
function DockItem({ children, onClick, mouseX, baseSize = 48, magnification = 72, distance = 150 }) {
  const ref = useRef(null);
  const mouseDistance = useTransform(mouseX, val => {
    const rect = ref.current?.getBoundingClientRect() ?? { x: 0, width: baseSize };
    return val - rect.x - baseSize / 2;
  });

  const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseSize, magnification, baseSize]);
  const size = useSpring(targetSize, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <motion.button
      ref={ref}
      style={{ width: size, height: size }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      /* 🌟 加上 cursor-pointer 修复手势 */
      className="relative flex items-center justify-center cursor-pointer rounded-2xl bg-white/5 hover:bg-white/20 border border-white/10 shadow-lg backdrop-blur-md text-white transition-colors"
    >
      {children}
    </motion.button>
  );
}

// 🌟 新增：独立悬浮音量调节模块
function VolumeControl({ mouseX, audioRef }) {
  const [isHovered, setIsHovered] = useState(false);
  const [volume, setVolume] = useState(1);

  // 初始化时读取当前音量
  useEffect(() => {
    if (audioRef?.current) setVolume(audioRef.current.volume);
  }, [audioRef]);

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
  };

  return (
    <div 
      className="relative flex items-center justify-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            /* 纵向音量面板弹出区 */
            className="absolute bottom-[110%] mb-2 w-12 h-36 bg-black/50 backdrop-blur-3xl border border-white/10 rounded-2xl flex items-center justify-center py-4 shadow-2xl z-50 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="range" min="0" max="1" step="0.01" value={volume}
              onChange={handleVolumeChange}
              /* 将滑块旋转 90 度变成垂直 */
              className="w-24 h-1.5 -rotate-90 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,255,255,0.9)] hover:[&::-webkit-slider-thumb]:scale-125 [&::-webkit-slider-thumb]:transition-transform"
            />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* 底部触发图标：动态切换静音和喇叭 */}
      <DockItem mouseX={mouseX} onClick={() => {
         const newVol = volume === 0 ? 1 : 0;
         setVolume(newVol);
         if (audioRef.current) audioRef.current.volume = newVol;
      }}>
        {volume === 0 ? <VolumeX size={22} fill="currentColor" /> : <Volume2 size={22} fill="currentColor" />}
      </DockItem>
    </div>
  );
}

function ControlDock({ isPlaying, onTogglePlay, onPrev, onNext, audioRef }) {
  const mouseX = useMotionValue(Infinity);
  
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className="flex items-end justify-center gap-4 p-3 rounded-[2rem] bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl"
      style={{ height: 80 }}
    >
       <DockItem mouseX={mouseX} onClick={onPrev}><SkipBack size={22} fill="currentColor" /></DockItem>
       <DockItem mouseX={mouseX} onClick={onTogglePlay} baseSize={56} magnification={80}>
          {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
       </DockItem>
       <DockItem mouseX={mouseX} onClick={onNext}><SkipForward size={22} fill="currentColor" /></DockItem>
       {/* 🌟 接入全新独立音量控制面板 */}
       <VolumeControl mouseX={mouseX} audioRef={audioRef} />
    </motion.div>
  )
}

// ==========================================
// 3. 极简进度条组件 (修复缩放动画和手势)
// ==========================================
function ProgressBar({ audioRef }) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio) return;
    const update = () => {
       if (!isDragging) setProgress(audio.currentTime);
       setDuration(audio.duration || 0);
       requestAnimationFrame(update);
    };
    const id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [audioRef, isDragging]);

  const formatTime = (time) => {
    if (isNaN(time)) return "00:00";
    const m = Math.floor(time / 60).toString().padStart(2, '0');
    const s = Math.floor(time % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    setProgress(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  };

  return (
    <div className="flex items-center w-full max-w-4xl mx-auto gap-4 mt-8 group" onClick={(e) => e.stopPropagation()}>
       <span className="text-white/60 text-sm font-mono w-12 text-right transition-colors group-hover:text-white/90">{formatTime(progress)}</span>
       
       <div className="flex-1 relative flex items-center h-4 cursor-pointer">
         <input 
           type="range" min={0} max={duration || 100} step="0.01" value={progress}
           onChange={handleSeek}
           onMouseDown={() => setIsDragging(true)} onMouseUp={() => setIsDragging(false)}
           onTouchStart={() => setIsDragging(true)} onTouchEnd={() => setIsDragging(false)}
           /* 🌟 修复进度条交互：hover 时轨道变粗 (h-1.5 变成 h-2.5)，拖动点放大 */
           className="w-full h-1.5 group-hover:h-2.5 transition-[height] duration-300 ease-out bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.8)] group-hover:[&::-webkit-slider-thumb]:scale-[1.3] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-300"
         />
       </div>

       <span className="text-white/60 text-sm font-mono w-12 text-left transition-colors group-hover:text-white/90">{formatTime(duration)}</span>
    </div>
  )
}

// ==========================================
// 主歌词模态框
// ==========================================
export default function LyricsOverlay({ 
  isOpen, onClose, currentSong, rawLyric, audioRef,
  isPlaying, onTogglePlay, onPrev, onNext 
}) {
  const [lyrics, setLyrics] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (rawLyric) {
      setLyrics(parseLrc(rawLyric));
      setCurrentIndex(0);
    } else {
      setLyrics([{ time: 0, text: '纯音乐，请欣赏...' }]);
    }
  }, [rawLyric]);

  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio || lyrics.length === 0 || !isOpen) return;

    let animationFrameId;
    let localIndex = 0; 

    const checkLyricProgress = () => {
      const time = audio.currentTime;
      let activeIdx = -1;
      
      for (let i = 0; i < lyrics.length; i++) {
        if (time >= lyrics[i].time) {
          activeIdx = i;
        } else { break; }
      }
      
      if (activeIdx !== -1 && activeIdx !== localIndex) {
        localIndex = activeIdx;
        setCurrentIndex(activeIdx);
      }
      animationFrameId = requestAnimationFrame(checkLyricProgress);
    };

    animationFrameId = requestAnimationFrame(checkLyricProgress);
    return () => cancelAnimationFrame(animationFrameId);
  }, [audioRef, lyrics, isOpen]);

  const visibleLyrics = [-2, -1, 0, 1, 2].map(offset => {
    const idx = currentIndex + offset;
    return {
      offset,
      item: lyrics[idx] || { text: '\u00A0' },
      key: lyrics[idx] ? `${lyrics[idx].time}-${idx}` : `empty-${offset}`
    };
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          animate={{ opacity: 1, backdropFilter: 'blur(40px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 cursor-pointer"
          onClick={onClose} 
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 80 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 80 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="flex flex-col w-full max-w-6xl px-12 cursor-default"
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="flex flex-row items-center justify-center w-full gap-20">
              
              {/* 🌟 强制锁定左侧宽度为 360px，绝对防止超长文字撑破布局 */}
              <div className="flex flex-col items-center justify-center gap-1 w-[360px]">
                <InteractiveCover currentSong={currentSong} />
                
                {/* 🌟 注入走马灯动画的关键帧 */}
                <style>{`
                  @keyframes seamlessMarquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                  }
                `}</style>

                {/* 🌟 替换为智能走马灯模块 */}
                <div className="flex flex-col items-center justify-center w-full mt-2 mb-2 overflow-hidden">
                  <AutoMarquee
                    text={currentSong?.name || '未知歌曲'}
                    charLimit={11} // 歌名超过 11 个字符自动滚动
                    className="text-white drop-shadow-2xl"
                    style={{ 
                      fontFamily: "'青鸟华光繁仿宋', '华文仿宋', STFangsong, '仿宋', FangSong, serif", 
                      fontSize: '32px',
                      fontWeight: 'bold',
                      textShadow: '0 0 15px rgba(255, 255, 255, 0.8)' 
                    }}
                  />
                  
                  <AutoMarquee
                    text={currentSong?.ar?.map(a => a.name).join('      ') || '未知歌手'}
                    charLimit={15} // 歌手名字超过 15 个字符自动滚动
                    className="text-white mt-1"
                    style={{ 
                      fontFamily: "'青鸟华光繁仿宋', '华文仿宋', STFangsong, '仿宋', FangSong, serif", 
                      fontSize: '22px', 
                      letterSpacing: '0.15em', 
                      textShadow: '0 0 15px rgba(255, 255, 255, 0.8)'
                    }}
                  />
                </div>

                <ControlDock 
                  isPlaying={isPlaying} 
                  onTogglePlay={onTogglePlay} 
                  onPrev={onPrev} 
                  onNext={onNext} 
                  audioRef={audioRef} 
                />
              </div>

              <div className="flex-1 flex flex-col justify-center h-[500px] overflow-hidden">
                <ul className="flex flex-col gap-6 w-full items-center relative px-4">
                  <AnimatePresence>
                    {visibleLyrics.map(({ offset, item, key }) => {
                      const textLen = item.text.length;
                      const baseFontSize = textLen > 25 ? "24px" : "32px";
                      let scale = 1, opacity = 1;

                      if (offset === 0) { scale = 1.1; opacity = 1; } 
                      else if (Math.abs(offset) === 1) { scale = 0.9; opacity = 0.4; } 
                      else { scale = 0.75; opacity = 0.15; }

                      return (
                        <motion.li
                          key={key}
                          layout="position"
                          initial={{ opacity: 0, y: offset > 0 ? 30 : -30 }}
                          animate={{ opacity, scale, y: 0 }}
                          exit={{ opacity: 0, y: offset < 0 ? -30 : 30 }}
                          transition={{ type: "spring", damping: 25, stiffness: 180, mass: 0.8 }}
                          className="will-change-transform origin-center text-white font-bold w-full max-w-[95%] text-center drop-shadow-md"
                          style={{ 
                            fontFamily: "'Playfair Display', sans-serif",
                            fontSize: baseFontSize, lineHeight: 1.4,
                            display: "-webkit-box", WebkitLineClamp: 3, 
                            WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word"
                          }}
                        >
                          {item.text}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>
            </div>

            <ProgressBar audioRef={audioRef} />

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}