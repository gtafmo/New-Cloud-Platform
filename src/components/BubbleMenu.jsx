import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import './BubbleMenu.css';

// 🌟 从 PillNav 提取出的“反重力水波”高阶按钮
const LiquidToggleBtn = ({ isOpen, onClick, menuBg, menuAriaLabel }) => {
  const btnRef = useRef(null);
  const circleRef = useRef(null);
  const tlRef = useRef(null);
  const tweenRef = useRef(null);

  // 🌟 核心修复点：将最后的依赖数组改为空 []，让物理引擎只初始化一次！
  useEffect(() => {
    const btn = btnRef.current;
    const circle = circleRef.current;
    if (!btn || !circle) return;

    // 计算流体覆盖整个胶囊的精准半径
    const rect = btn.getBoundingClientRect();
    const w = rect.width || 80;
    const h = rect.height || 48;
    const R = ((w * w) / 4 + h * h) / (2 * h);
    const D = Math.ceil(2 * R) + 2;
    const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1;
    const originY = D - delta;

    circle.style.width = `${D}px`;
    circle.style.height = `${D}px`;
    circle.style.bottom = `-${delta}px`;

    gsap.set(circle, { xPercent: -50, scale: 0, transformOrigin: `50% ${originY}px` });

    const label = btn.querySelector('.pill-label');
    const white = btn.querySelector('.pill-label-hover');

    if (label) gsap.set(label, { y: 0 });
    if (white) gsap.set(white, { y: h + 12, opacity: 0 });

    const tl = gsap.timeline({ paused: true });

    tl.to(circle, { scale: 1.2, xPercent: -50, duration: 0.4, ease: 'power3.easeOut' }, 0);
    if (label) tl.to(label, { y: -(h + 8), duration: 0.4, ease: 'power3.easeOut' }, 0);
    if (white) {
      gsap.set(white, { y: Math.ceil(h + 100), opacity: 0 });
      tl.to(white, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.easeOut' }, 0);
    }
    tlRef.current = tl;

    // 组件卸载时安全销毁动画
    return () => tl.kill();
  }, []); // <-- 🌟 看这里！去掉了 isOpen 依赖，彻底切断了点击时的动画重建风暴

  const handleEnter = () => {
    if (!tlRef.current) return;
    tweenRef.current?.kill();
    tweenRef.current = tlRef.current.tweenTo(tlRef.current.duration(), { duration: 0.3, ease: 'power3.easeOut' });
  };

  const handleLeave = () => {
    if (!tlRef.current) return;
    tweenRef.current?.kill();
    tweenRef.current = tlRef.current.tweenTo(0, { duration: 0.3, ease: 'power3.easeOut' });
  };

  const text = isOpen ? '关闭' : '歌单';

  return (
    <button
      ref={btnRef}
      type="button"
      className={`bubble-pill-box menu-btn pill-liquid ${isOpen ? 'open' : ''}`}
      onClick={onClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      aria-label={menuAriaLabel}
      aria-pressed={isOpen}
      style={{ background: menuBg }}
    >
      <span className="hover-circle" aria-hidden="true" ref={circleRef} />
      <span className="label-stack">
        <span className="pill-label">{text}</span>
        <span className="pill-label-hover" aria-hidden="true">{text}</span>
      </span>
    </button>
  );
};

export default function BubbleMenu({
  logo,
  rightContent, 
  onMenuClick,
  className,
  style,
  menuAriaLabel = 'Toggle menu',
  menuBg = 'rgba(255, 255, 255, 0.02)',
  menuContentColor = '#ffffff',
  useFixedPosition = false,
  items = [],
  animationEase = 'back.out(1.5)',
  animationDuration = 0.5,
  staggerDelay = 0.1
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  const overlayRef = useRef(null);
  const bubblesRef = useRef([]);
  const labelRefs = useRef([]);

  const containerClassName = ['bubble-nav-container', useFixedPosition ? 'fixed' : 'absolute', className].filter(Boolean).join(' ');

  const handleToggle = () => {
    const nextState = !isMenuOpen;
    if (nextState) setShowOverlay(true);
    setIsMenuOpen(nextState);
    onMenuClick?.(nextState);
  };

  useEffect(() => {
    const overlay = overlayRef.current;
    const bubbles = bubblesRef.current.filter(Boolean);
    const labels = labelRefs.current.filter(Boolean);

    if (!overlay || !bubbles.length) return;

    if (isMenuOpen) {
      gsap.set(overlay, { display: 'flex' });
      gsap.killTweensOf([...bubbles, ...labels]);
      gsap.set(bubbles, { scale: 0, transformOrigin: '50% 50%' });
      gsap.set(labels, { y: 24, autoAlpha: 0 });

      bubbles.forEach((bubble, i) => {
        const delay = i * staggerDelay + gsap.utils.random(-0.03, 0.03);
        const tl = gsap.timeline({ delay });

        tl.to(bubble, { scale: 1, duration: animationDuration, ease: animationEase });
        if (labels[i]) {
          tl.to(labels[i], { y: 0, autoAlpha: 1, duration: animationDuration, ease: 'power3.out' }, `-=${animationDuration * 0.9}`);
        }
      });
    } else if (showOverlay) {
      gsap.killTweensOf([...bubbles, ...labels]);
      gsap.to(labels, { y: 24, autoAlpha: 0, duration: 0.2, ease: 'power3.in' });
      gsap.to(bubbles, {
        scale: 0, duration: 0.2, ease: 'power3.in',
        onComplete: () => {
          gsap.set(overlay, { display: 'none' });
          setShowOverlay(false);
        }
      });
    }
  }, [isMenuOpen, showOverlay, animationEase, animationDuration, staggerDelay, items]);

  useEffect(() => {
    const handleResize = () => {
      if (isMenuOpen) {
        const bubbles = bubblesRef.current.filter(Boolean);
        const isDesktop = window.innerWidth >= 900;
        bubbles.forEach((bubble, i) => {
          const item = items[i];
          if (bubble && item) gsap.set(bubble, { rotation: isDesktop ? (item.rotation ?? 0) : 0 });
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMenuOpen, items]);

  return (
    <>
      <nav className={containerClassName} style={style} aria-label="Main navigation">
        <div className="bubble-pill-box" style={{ background: menuBg }}>
          {logo}
        </div>

        <div className="flex items-center gap-4 pointer-events-auto">
          {rightContent}
          
          {/* 🌟 核心：用带有水波特效的封装组件替换原本枯燥的普通按钮 */}
          <LiquidToggleBtn 
            isOpen={isMenuOpen} 
            onClick={handleToggle} 
            menuBg={menuBg} 
            menuAriaLabel={menuAriaLabel} 
          />
        </div>
      </nav>

      {/* 气泡菜单悬浮层保持完全不变 */}
      {showOverlay && (
        <div ref={overlayRef} className={`bubble-menu-items ${useFixedPosition ? 'fixed' : 'absolute'}`} aria-hidden={!isMenuOpen}>
          <ul className="pill-list" role="menu" aria-label="Menu links">
            {items.map((item, idx) => (
              <li key={idx} role="none" className="pill-col">
                <a
                  role="menuitem" href="#" aria-label={item.ariaLabel || item.label} className="pill-link"
                  style={{
                    '--item-rot': `${item.rotation ?? 0}deg`,
                    '--pill-bg': 'rgba(25, 25, 25, 0.75)', '--pill-color': 'rgba(255, 255, 255, 0.85)',
                    '--hover-bg': item.hoverStyles?.bgColor || '#ffffff', '--hover-color': item.hoverStyles?.textColor || '#000000',
                    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)'
                  }}
                  ref={el => { if (el) bubblesRef.current[idx] = el; }}
                  onClick={(e) => {
                    e.preventDefault();
                    item.onClick?.();
                    setIsMenuOpen(false);
                  }}
                >
                  <span className="pill-label" ref={el => { if (el) labelRefs.current[idx] = el; }}>{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}