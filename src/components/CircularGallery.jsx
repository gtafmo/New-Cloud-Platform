import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from 'ogl';
import { useEffect, useRef } from 'react';
import './CircularGallery.css';

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function lerp(p1, p2, t) {
  return p1 + (p2 - p1) * t;
}

class Media {
  constructor({ geometry, gl, image, index, length, scene, screen, songName, artistName, viewport, bend, borderRadius = 0 }) {
    this.geometry = geometry;
    this.gl = gl;
    this.image = image;
    this.index = index;
    this.length = length;
    this.scene = scene;
    this.screen = screen;
    this.songName = songName;
    this.artistName = artistName;
    this.viewport = viewport;
    this.bend = bend; // 🌟 恢复曲面参数
    this.borderRadius = borderRadius;
    
    this.hoverState = 0;
    
    this.createShader();
    this.createMesh();
    this.onResize();
  }

  createShader() {
    const texture = new Texture(this.gl, { generateMipmaps: true });
    this.program = new Program(this.gl, {
      depthTest: false, depthWrite: false,
      vertex: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uTime;
        uniform float uSpeed;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * (0.1 + uSpeed * 0.5);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform vec2 uImageSizes;
        uniform vec2 uPlaneSizes;
        uniform vec2 uViewportSizes;
        uniform sampler2D tMap;
        uniform float uBorderRadius;
        
        uniform vec2 uMouse;
        uniform float uHover;
        uniform float uCardX; 
        
        varying vec2 vUv;
        
        float roundedBoxSDF(vec2 p, vec2 b, float r) {
          vec2 d = abs(p) - b;
          return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
        }
        
        void main() {
          vec2 ratio = vec2(
            min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
            min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
          );
          vec2 uv = vec2(
            vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
          );
          vec4 color = texture2D(tMap, uv);
          
          float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
          float edgeSmooth = 0.002;
          float alpha = 1.0 - smoothstep(-edgeSmooth, edgeSmooth, d);
          
          vec2 pixelWorldPos = vec2(
            uCardX + (vUv.x - 0.5) * uPlaneSizes.x,
            (vUv.y - 0.5) * uPlaneSizes.y
          );
          
          vec2 topLightPos = vec2(0.0, uViewportSizes.y * 0.45);
          float distToTopLight = distance(pixelWorldPos, topLightPos);
          float lightRadius = uPlaneSizes.x * 2.8; 
          float globalLight = smoothstep(lightRadius, 0.0, distToTopLight) * 1.1;
          
          vec2 aspectUv = vUv;
          aspectUv.y *= (uPlaneSizes.y / uPlaneSizes.x);
          vec2 aspectMouse = uMouse;
          aspectMouse.y *= (uPlaneSizes.y / uPlaneSizes.x);
          
          float distToMouse = distance(aspectUv, aspectMouse);
          float mouseSpot = smoothstep(0.9, 0.0, distToMouse) * uHover * 0.8;
          
          float ambient = 0.4; 
          float totalLight = clamp(ambient + globalLight + mouseSpot, 0.0, 1.3);
          
          float innerShadow = smoothstep(0.0, -0.06, d); 
          totalLight *= mix(0.7, 1.0, innerShadow);
          
          gl_FragColor = vec4(color.rgb * totalLight, color.a * alpha);
        }
      `,
      uniforms: {
        tMap: { value: texture },
        uPlaneSizes: { value: [0, 0] },
        uViewportSizes: { value: [this.viewport?.width || 0, this.viewport?.height || 0] },
        uImageSizes: { value: [0, 0] },
        uSpeed: { value: 0 },
        uTime: { value: 100 * Math.random() },
        uBorderRadius: { value: this.borderRadius },
        
        uMouse: { value: [0.5, 0.5] },
        uHover: { value: 0.0 },
        uCardX: { value: 0.0 } 
      },
      transparent: true
    });

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = this.image;
    
    img.onload = () => {
      // 🌟 保留瀑布式渲染引擎：防卡顿核心
      setTimeout(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1000;
        canvas.height = 1400; 
  
        ctx.clearRect(0, 0, canvas.width, canvas.height);
  
        ctx.globalAlpha = 0.6; 
        ctx.filter = 'blur(80px) saturate(1.2)';
        ctx.drawImage(img, -100, -100, 1200, 1600);
        ctx.filter = 'none';
        ctx.globalAlpha = 1.0;
  
        const cardGrad = ctx.createLinearGradient(0, 0, 0, 1400);
        cardGrad.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
        cardGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
        ctx.fillStyle = cardGrad;
        ctx.fillRect(0, 0, 1000, 1400);
  
        const p = 50, s = 900, r = 40;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p + r, p);
        ctx.lineTo(p + s - r, p);
        ctx.quadraticCurveTo(p + s, p, p + s, p + r);
        ctx.lineTo(p + s, p + s - r);
        ctx.quadraticCurveTo(p + s, p + s, p + s - r, p + s);
        ctx.lineTo(p + r, p + s);
        ctx.quadraticCurveTo(p, p + s, p, p + s - r);
        ctx.lineTo(p, p + r);
        ctx.quadraticCurveTo(p, p, p + r, p);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, p, p, s, s);
        ctx.restore();
  
        const fontStack = "'青鸟华光繁仿宋', '华文仿宋', STFangsong, '仿宋', FangSong, serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 20; 
  
        ctx.fillStyle = '#ffffff'; 
        ctx.font = `bold 68px ${fontStack}`;
        ctx.fillText(this.songName, 500, 1140, 900); //歌名字体
  
        ctx.font = `60px ${fontStack}`;
        const safeArtistName = this.artistName || '';
        const formattedArtist = safeArtistName.split(' / ').join('      '); 
        ctx.fillText(formattedArtist, 500, 1260, 900);
  
        ctx.shadowBlur = 0; 
        ctx.font = `bold 68px ${fontStack}`;
        ctx.fillText(this.songName, 500, 1140, 900);//歌手字体
        
        ctx.font = `60px ${fontStack}`;
        ctx.fillText(formattedArtist, 500, 1260, 900);
  
        texture.image = canvas;
        this.program.uniforms.uImageSizes.value = [canvas.width, canvas.height];
      }, this.index * 35); // 第一张 0ms, 第二张 35ms... 完美错开 CPU 峰值
    };
  }

  createMesh() {
    this.plane = new Mesh(this.gl, { geometry: this.geometry, program: this.program });
    this.plane.setParent(this.scene);
  }

  update(scroll, mouse) {
    // 🌟 不循环排布，仅根据 scroll.current 设置 X
    this.plane.position.x = this.x - scroll.current;
    const x = this.plane.position.x;
    const H = this.viewport.width / 2;
    
    this.program.uniforms.uCardX.value = x;

    // 🌟 恢复标志性的弧形曲面逻辑
    if (this.bend === 0) {
      this.plane.position.y = 0;
      this.plane.rotation.z = 0;
    } else {
      const B_abs = Math.abs(this.bend);
      const R = (H * H + B_abs * B_abs) / (2 * B_abs);
      const effectiveX = Math.min(Math.abs(x), H);
      const arc = R - Math.sqrt(R * R - effectiveX * effectiveX);
      if (this.bend > 0) {
        this.plane.position.y = -arc;
        this.plane.rotation.z = -Math.sign(x) * Math.asin(effectiveX / R);
      } else {
        this.plane.position.y = arc;
        this.plane.rotation.z = Math.sign(x) * Math.asin(effectiveX / R);
      }
    }

    let isHover = false;
    let targetUvX = 0.5;
    let targetUvY = 0.5;

    if (mouse) {
      const px = this.plane.position.x;
      const py = this.plane.position.y; 
      const dx = mouse.glX - px;
      const dy = mouse.glY - py;
      
      const halfW = (this.baseScaleX || this.plane.scale.x) / 2;
      const halfH = (this.baseScaleY || this.plane.scale.y) / 2;
      
      let targetRotX = 0;
      let targetRotY = 0;
      
      if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) {
        isHover = true; 
        targetUvX = (dx / this.plane.scale.x) + 0.5;
        targetUvY = (dy / this.plane.scale.y) + 0.5;

        const relX = dx / halfW;
        const relY = dy / halfH;
        const maxTilt = 0.25; 
        targetRotX = relY * maxTilt;
        targetRotY = -relX * maxTilt;
      }
      this.plane.rotation.x = lerp(this.plane.rotation.x, targetRotX, 0.08);
      this.plane.rotation.y = lerp(this.plane.rotation.y, targetRotY, 0.08);
    }

    this.hoverState = lerp(this.hoverState, isHover ? 1.0 : 0.0, 0.08);
    this.program.uniforms.uHover.value = this.hoverState;

    // 音阶弹起效果
    const targetHoverScale = isHover ? 1.06 : 1.0;  
    const targetHoverY = isHover ? 0.35 : 0.0;      
    const targetHoverZ = isHover ? 0.6 : 0.0;       

    this.hoverScale = lerp(this.hoverScale || 1.0, targetHoverScale, 0.15);
    this.hoverYOffset = lerp(this.hoverYOffset || 0.0, targetHoverY, 0.15);
    this.hoverZOffset = lerp(this.hoverZOffset || 0.0, targetHoverZ, 0.15);

    if (this.baseScaleX && this.baseScaleY) {
      this.plane.scale.x = this.baseScaleX * this.hoverScale;
      this.plane.scale.y = this.baseScaleY * this.hoverScale;
    }
    this.plane.position.y += this.hoverYOffset;
    this.plane.position.z = this.hoverZOffset; 

    if (isHover) {
      this.program.uniforms.uMouse.value[0] = lerp(this.program.uniforms.uMouse.value[0], targetUvX, 0.2);
      this.program.uniforms.uMouse.value[1] = lerp(this.program.uniforms.uMouse.value[1], targetUvY, 0.2);
    }

    this.speed = scroll.current - scroll.last;
    this.program.uniforms.uTime.value += 0.04;
    this.program.uniforms.uSpeed.value = this.speed;
  }
  
  onResize({ screen, viewport } = {}) {
    if (screen) this.screen = screen;
    if (viewport) {
      this.viewport = viewport;
      if (this.plane.program.uniforms.uViewportSizes) {
        this.plane.program.uniforms.uViewportSizes.value = [this.viewport.width, this.viewport.height];
      }
    }
    
    this.scale = (this.screen.height / 1500) * 0.75; 
    
    this.baseScaleX = (this.viewport.width * (700 * this.scale)) / this.screen.width;
    this.baseScaleY = (this.viewport.height * (980 * this.scale)) / this.screen.height;

    this.hoverScale = this.hoverScale || 1.0;
    this.plane.scale.x = this.baseScaleX * this.hoverScale;
    this.plane.scale.y = this.baseScaleY * this.hoverScale;
    
    this.plane.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];
    
    this.padding = 2 * 0.75; 
    this.width = this.baseScaleX + this.padding;
    this.x = this.width * this.index;
  }
}

class App {
  constructor(container, { items, bend = 3, borderRadius = 0, scrollSpeed = 2, scrollEase = 0.05, onItemClick } = {}) {
    document.documentElement.classList.remove('no-js');
    this.container = container;
    this.scrollSpeed = scrollSpeed;
    this.scroll = { ease: scrollEase, current: 0, target: 0, last: 0 };
    this.onCheckDebounce = debounce(this.onCheck, 200);
    this.onItemClick = onItemClick; 
    this.mouse = { glX: 0, glY: 0 }; 
    
    this.createRenderer();
    this.createCamera();
    this.createScene();
    this.onResize();
    this.createGeometry();
    this.createMedias(items, bend, borderRadius);
    this.update();
    this.addEventListeners();
  }
  
  createRenderer() {
    this.renderer = new Renderer({ alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);
    this.container.appendChild(this.gl.canvas);
  }
  
  createCamera() {
    this.camera = new Camera(this.gl);
    this.camera.fov = 45;
    this.camera.position.z = 20;
  }
  
  createScene() { this.scene = new Transform(); }
  createGeometry() { 
    // 🌟 性能绝杀：将单张卡片的多边形分段从 50x100 暴降至 10x30
    // 30 的横向分段足够支撑平滑的弧度，肉眼看不出画质区别，但显卡会感谢你！
    this.planeGeometry = new Plane(this.gl, { heightSegments: 10, widthSegments: 30 }); 
  }
  
  createMedias(items, bend, borderRadius) {
    // 🌟 数据截断：不管传进来多少首，强行只取前 30 首进行渲染！
    const limitedItems = items && items.length > 0 ? items.slice(0, 30) : []; 
    
    this.mediasImages = limitedItems; 
    this.medias = this.mediasImages.map((data, index) => {
      return new Media({
        geometry: this.planeGeometry, gl: this.gl, image: data.image, index, length: this.mediasImages.length,
        scene: this.scene, screen: this.screen, songName: data.songName, artistName: data.artistName,
        viewport: this.viewport, bend, borderRadius
      });
    });
  }

  onPointerMove(e) {
    if (!this.screen || !this.viewport) return;
    const x = e.clientX;
    const y = e.clientY;
    this.mouse.glX = (x / this.screen.width - 0.5) * this.viewport.width;
    this.mouse.glY = -(y / this.screen.height - 0.5) * this.viewport.height;
  }

  onTouchDown(e) {
    this.isDown = true;
    this.scroll.position = this.scroll.current;
    this.start = e.touches ? e.touches[0].clientX : e.clientX;
    this.clickStartTime = Date.now();
    this.clickStartX = this.start;
  }

  onTouchMove(e) {
    if (!this.isDown) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const distance = (this.start - x) * (this.scrollSpeed * 0.025);
    this.scroll.target = this.scroll.position + distance;
  }

  onTouchUp(e) {
    if (!this.isDown) return; 
    this.isDown = false;
    const endX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const endY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const timeDiff = Date.now() - this.clickStartTime;

    if (timeDiff < 250 && Math.abs(this.clickStartX - endX) < 10) {
      const clickX_WebGL = (endX / this.screen.width - 0.5) * this.viewport.width;
      const clickY_WebGL = -(endY / this.screen.height - 0.5) * this.viewport.height;
      let clickedMedia = null;
      let minDistance = Infinity;

      for (let i = 0; i < this.medias.length; i++) {
        const media = this.medias[i];
        const px = media.x - this.scroll.current;
        const py = media.plane.position.y - (media.hoverYOffset || 0); 
        const dx = clickX_WebGL - px;
        const dy = clickY_WebGL - py;
        const halfW = ((media.baseScaleX || media.plane.scale.x) / 2) * 1.1;
        const halfH = ((media.baseScaleY || media.plane.scale.y) / 2) * 1.1;

        if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) {
          const dist = dx * dx + dy * dy;
          if (dist < minDistance) {
            minDistance = dist;
            clickedMedia = media;
          }
        }
      }

      if (clickedMedia) {
        if (this.onItemClick) this.onItemClick(clickedMedia.index);
        this.scroll.target = clickedMedia.x; 
        return; 
      }
    }
    this.onCheck();
  }

  onWheel(e) {
    const delta = e.deltaY || e.wheelDelta || e.detail;
    this.scroll.target += (delta > 0 ? this.scrollSpeed : -this.scrollSpeed) * 0.2;
    this.onCheckDebounce();
  }

  onCheck() {
    if (!this.medias || !this.medias[0]) return;
    const width = this.medias[0].width;
    const itemIndex = Math.round(Math.abs(this.scroll.target) / width);
    const item = width * itemIndex;
    
    this.scroll.target = this.scroll.target < 0 ? -item : item;
  }

  onResize() {
    this.screen = { width: this.container.clientWidth, height: this.container.clientHeight };
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.camera.perspective({ aspect: this.screen.width / this.screen.height });
    const fov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
    const width = height * this.camera.aspect;
    this.viewport = { width, height };
    if (this.medias) this.medias.forEach(media => media.onResize({ screen: this.screen, viewport: this.viewport }));
  }

  update() {
    // 🌟 硬边界阻尼限制：划到两端时稳稳停住，防止穿模
    if (this.medias && this.medias.length > 0) {
      const maxScroll = (this.medias.length - 1) * this.medias[0].width;
      if (this.scroll.target < 0) this.scroll.target = 0; 
      if (this.scroll.target > maxScroll) this.scroll.target = maxScroll;
    }

    this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
    
    if (this.medias) this.medias.forEach(media => media.update(this.scroll, this.mouse));
    this.renderer.render({ scene: this.scene, camera: this.camera });
    this.scroll.last = this.scroll.current;
    this.raf = window.requestAnimationFrame(this.update.bind(this));
  }

  addEventListeners() {
    this.boundOnResize = this.onResize.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnTouchDown = this.onTouchDown.bind(this);
    this.boundOnTouchMove = this.onTouchMove.bind(this);
    this.boundOnTouchUp = this.onTouchUp.bind(this);
    this.boundOnPointerMove = this.onPointerMove.bind(this); 
    
    window.addEventListener('resize', this.boundOnResize);
    window.addEventListener('mousemove', this.boundOnPointerMove); 
    
    const canvas = this.gl.canvas;
    canvas.addEventListener('mousewheel', this.boundOnWheel);
    canvas.addEventListener('wheel', this.boundOnWheel);
    canvas.addEventListener('mousedown', this.boundOnTouchDown);
    canvas.addEventListener('touchstart', this.boundOnTouchDown);
    
    window.addEventListener('mousemove', this.boundOnTouchMove);
    window.addEventListener('mouseup', this.boundOnTouchUp);
    window.addEventListener('touchmove', this.boundOnTouchMove);
    window.addEventListener('touchend', this.boundOnTouchUp);
  }

  destroy() {
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.boundOnResize);
    window.removeEventListener('mousemove', this.boundOnPointerMove); 
    
    const canvas = this.gl.canvas;
    if (canvas) {
      canvas.removeEventListener('mousewheel', this.boundOnWheel);
      canvas.removeEventListener('wheel', this.boundOnWheel);
      canvas.removeEventListener('mousedown', this.boundOnTouchDown);
      canvas.removeEventListener('touchstart', this.boundOnTouchDown);
    }
    
    window.removeEventListener('mousemove', this.boundOnTouchMove);
    window.removeEventListener('mouseup', this.boundOnTouchUp);
    window.removeEventListener('touchmove', this.boundOnTouchMove);
    window.removeEventListener('touchend', this.boundOnTouchUp);
    
    if (this.renderer && this.renderer.gl && this.renderer.gl.canvas.parentNode) {
      this.renderer.gl.canvas.parentNode.removeChild(this.renderer.gl.canvas);
    }
  }
}

export default function CircularGallery({
  items, bend = 3, borderRadius = 0.05, scrollSpeed = 2, scrollEase = 0.05, onItemClick
}) {
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current || !items || items.length === 0) return;
    let app = new App(containerRef.current, {
      items, bend, borderRadius, scrollSpeed, scrollEase, onItemClick
    });
    return () => {
      if (app) app.destroy();
    };
  }, [items, bend, borderRadius, scrollSpeed, scrollEase]);
  return <div className="circular-gallery" ref={containerRef} />;
}