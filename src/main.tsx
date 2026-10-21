import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MotionArtwork, type MotionSlide } from './MotionArtwork';
import './styles.css';
import './motion.css';

type Slide = { id: number; title: string; section: string; image: string; thumbnail: string; width: number; height: number; text: string };
type Deck = { title: string; sourceUrl: string; slides: Slide[] };
type IconName = 'left' | 'right' | 'arrow' | 'download' | 'grid' | 'focus' | 'expand' | 'close' | 'search' | 'link' | 'text' | 'replay' | 'motion' | 'chevron' | 'menu' | 'check' | 'play' | 'pause';
const paths: Record<IconName, React.ReactNode> = {
  left: <path d="m14 5-7 7 7 7M7 12h14" />, right: <path d="m10 5 7 7-7 7M3 12h14" />,
  arrow: <path d="M6 18 18 6M6 6h12v12" />, download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  focus: <><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
  expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />, close: <path d="m6 6 12 12M6 18 18 6" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  link: <><path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 4 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0) scale(.95)" /></>,
  text: <path d="M4 5h16M12 5v15m-4 0h8M4 9V5m16 4V5" />,
  replay: <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />,
  motion: <><path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z" /><path d="M21 3v4m-2-2h4" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />, check: <path d="m5 12 4 4L19 6" />,
  play: <path d="m8 5 11 7-11 7V5Z" />, pause: <path d="M8 5v14M16 5v14" />,
};
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function IconButton({ icon, label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}><Icon name={icon} />{children}</button>;
}
const padded = (n: number) => String(n).padStart(2, '0');
function hashIndex(slides: Slide[]) {
  const id = Number(window.location.hash.match(/^#slide-(\d+)$/)?.[1]);
  const found = slides.findIndex(s => s.id === id);
  return found < 0 ? 0 : found;
}

function DurationPicker({ value, onChange, open, onOpenChange }: { value: number; onChange: (value: number) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, bottom: 0 });
  const durations = [5, 8, 12];

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPosition({ left: Math.max(12, Math.min(rect.right - 216, window.innerWidth - 228)), bottom: window.innerHeight - rect.top + 10 });
    };
    place();
    const frame = requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !menu.current?.contains(e.target) && !trigger.current?.contains(e.target)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, onOpenChange]);

  function closeAndFocus() { onOpenChange(false); trigger.current?.focus(); }

  return <>
    <button ref={trigger} type="button" className={`duration-trigger ${open ? 'is-open' : ''}`} aria-label="Autoplay slide duration" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'duration-menu' : undefined} onClick={() => onOpenChange(!open)} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); onOpenChange(true); } }}><span>{value}s</span><Icon name="chevron" size={12} /></button>
    {open && createPortal(<div ref={menu} id="duration-menu" className="duration-menu" role="menu" aria-label="Time per slide" style={position} onKeyDown={e => {
      const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
      const selected = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAndFocus(); }
      if (e.key === 'Tab') {
        e.preventDefault();
        const focusable = [...document.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(element => !menu.current?.contains(element) && !element.matches(':disabled,[aria-disabled="true"]') && !element.closest('[hidden],[inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
        const current = focusable.indexOf(trigger.current!);
        const next = focusable[current + (e.shiftKey ? -1 : 1)];
        onOpenChange(false);
        next?.focus();
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}><p className="duration-menu-label">TIME PER SLIDE</p>{durations.map((seconds, i) => <button type="button" key={seconds} role="menuitemradio" aria-checked={value === seconds} onClick={() => { onChange(seconds); closeAndFocus(); }}><span><strong>{seconds} seconds</strong><small>{['A quick look', 'A little room to read', 'Take your time'][i]}</small></span>{value === seconds && <Icon name="check" size={16} />}</button>)}<div className="duration-menu-note">Playback pauses while you choose.</div></div>, document.body)}
  </>;
}

function Dialog({ title, subtitle, onClose, children, kind = '' }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; kind?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex="0"]') ?? [])];
    (ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0])?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab') return;
      const items = focusable(); const first = items[0]; const last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown, true); previous?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} className={`dialog ${kind}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-heading"><div><p className="eyebrow">THE ORBIX DECK</p><h2 id="dialog-title">{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div><IconButton icon="close" label="Close dialog" onClick={onClose} /></div>
      {children}
    </div>
  </div>;
}

function App() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [motionSlides, setMotionSlides] = useState<MotionSlide[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [overview, setOverview] = useState(false);
  const [readCopy, setReadCopy] = useState(false);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [motionEnabled, setMotionEnabled] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [replay, setReplay] = useState(0);
  const [loaded, setLoaded] = useState('');
  const [imageError, setImageError] = useState('');
  const [imageRetry, setImageRetry] = useState({ image: '', count: 0 });
  const [playing, setPlaying] = useState(true);
  const [duration, setDuration] = useState(5);
  const [timingOpen, setTimingOpen] = useState(false);
  const [autoplayProgress, setAutoplayProgress] = useState(0);
  const [notice, setNotice] = useState('');
  const selectedRef = useRef<HTMLButtonElement>(null);
  const previousIndex = useRef(index);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const autoHash = useRef('');
  const slides = deck?.slides ?? [];
  const slide = slides[index];
  const imageSrc = slide && imageRetry.image === slide.image ? `${slide.image}${slide.image.includes('?') ? '&' : '?'}retry=${imageRetry.count}` : slide?.image ?? '';
  const activeMotion = motionEnabled && !reducedMotion;
  const artworkKey = `${imageSrc}:${replay}:${activeMotion}`;
  const sections = [...new Set(slides.map(s => s.section))];
  const closeOverview = React.useCallback(() => setOverview(false), []);
  const closeReadCopy = React.useCallback(() => setReadCopy(false), []);

  useLayoutEffect(() => { setLoaded(''); setImageError(''); }, [artworkKey]);
  useLayoutEffect(() => {
    if (index !== previousIndex.current) setDirection(index < previousIndex.current ? 'backward' : 'forward');
    previousIndex.current = index;
  }, [index]);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    const deckRequest = fetch('/deck.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('The deck could not be loaded.'); return r.json() as Promise<Deck>; });
    const motionRequest = fetch('/motion.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('Motion is unavailable.'); return r.json() as Promise<{ slides: MotionSlide[] }>; }).then(data => Array.isArray(data.slides) ? data.slides : []).catch(e => { if (e.name !== 'AbortError') setNotice('Animation assets are unavailable. Showing original slide artwork.'); return []; });
    Promise.all([deckRequest, motionRequest]).then(([data, motion]) => {
      if (!Array.isArray(data.slides) || !data.slides.length) throw new Error('The deck is currently unavailable.');
      setMotionSlides(motion); setDeck(data); setIndex(hashIndex(data.slides));
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReducedMotion(preference.matches); setMotionEnabled(!preference.matches); };
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => { if (timingOpen) setPlaying(false); }, [timingOpen]);

  useEffect(() => {
    if (!deck) return;
    const sync = () => {
      if (window.location.hash === autoHash.current) autoHash.current = '';
      else setPlaying(false);
      if (!window.location.hash || /^#slide-\d+$/.test(window.location.hash)) setIndex(hashIndex(deck.slides));
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [deck]);
  const goTo = React.useCallback((next: number, automatic = false) => {
    if (!slides.length) return;
    if (!automatic) setPlaying(false);
    const bounded = Math.max(0, Math.min(slides.length - 1, next));
    setIndex(bounded); setOverview(false); setTimingOpen(false);
    const hash = `#slide-${slides[bounded].id}`;
    if (window.location.hash !== hash) { autoHash.current = automatic ? hash : ''; window.location.hash = hash; }
  }, [slides]);

  useEffect(() => {
    setAutoplayProgress(0);
    if (!playing || !slides.length) return;
    if (overview || readCopy || timingOpen || document.hidden || imageError === artworkKey || index >= slides.length - 1) { setPlaying(false); return; }
    if (loaded !== artworkKey) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      if (document.hidden) { setPlaying(false); return; }
      const progress = Math.min((performance.now() - started) / (duration * 1000), 1);
      setAutoplayProgress(progress);
      if (progress >= 1) { window.clearInterval(timer); goTo(index + 1, true); }
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, duration, index, slides.length, overview, readCopy, timingOpen, goTo, loaded, artworkKey, imageError]);
  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  useEffect(() => {
    if (!slide) return;
    document.title = `${slide.title} — Orbix Studio Pitch Deck`;
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    [slides[index - 1], slides[index + 1]].filter(Boolean).forEach(s => {
      const motion = motionSlides.find(item => item.id === s.id);
      const sources = activeMotion && motion?.animated ? [motion.background, ...motion.layers.map(layer => layer.src)] : [s.image];
      sources.forEach(src => { const image = new Image(); image.decoding = 'async'; image.fetchPriority = 'low'; image.src = src; });
    });
  }, [index, slide, slides, motionSlides, activeMotion]);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setTimingOpen(false); if (!readCopy) setOverview(v => !v); return; }
      if (overview || readCopy || timingOpen || e.altKey || e.ctrlKey || e.metaKey || (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      if (e.key === ' ' && e.target instanceof HTMLElement && e.target.closest('button,a')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); goTo(index + 1); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); goTo(index - 1); }
      if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      if (e.key === 'End') { e.preventDefault(); goTo(slides.length - 1); }
      if (e.key.toLowerCase() === 'f') setFocus(v => !v);
      if (e.key === 'Escape') setFocus(false);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [index, slides.length, goTo, overview, readCopy, timingOpen]);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => { if (!notice) return; const timeout = window.setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timeout); }, [notice]);

  async function copyLink() {
    const url = new URL(window.location.href); url.hash = `slide-${slide.id}`;
    try { await navigator.clipboard.writeText(url.href); setNotice('Slide link copied.'); }
    catch { setNotice('Copy is unavailable. The current slide link is in your address bar.'); if (window.location.hash !== url.hash) window.location.hash = url.hash; }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setNotice('Fullscreen is unavailable in this browser. Try focus mode.');
    } catch { setNotice('Fullscreen could not open. Try focus mode.'); }
  }
  const filtered = slides.filter(s => `${s.title} ${s.section} ${s.text}`.toLowerCase().includes(query.toLowerCase().trim()));

  if (!deck) return <div className="loading-screen"><img src="/assets/orbix-logo.svg" alt="Orbix" width="185" height="30" />{error ? <><h1>The deck needs a moment.</h1><p>{error}</p><button className="pill dark" onClick={() => setAttempt(a => a + 1)}>Try again <Icon name="right" /></button></> : <><span className="loader" /><p>Opening the studio deck</p></>}</div>;

  return <div className={`app ${focus ? 'is-focused' : ''} ${activeMotion ? 'has-motion' : ''}`}>
    <a className="skip-link" href="#slide-viewer" onClick={e => { e.preventDefault(); document.getElementById('slide-viewer')?.focus(); }}>Skip to slides</a>
    <header className="site-header">
      <a className="brand" href="https://www.orbix.studio" target="_blank" rel="noreferrer" aria-label="Orbix studio website"><img src="/assets/orbix-logo.svg" alt="Orbix" width="185" height="30" /></a>
      <span className="header-context"><span className="status-dot" /> Studio introduction</span>
      <div className="header-actions"><a className="download-link" href="/assets/orbix-pitch-deck.pdf" download aria-label="Download deck"><Icon name="download" /> <span>Download deck</span></a><a className="pill dark" href="https://cal.com/orbixstudiollc/free-ux-strategy-book-now-call" target="_blank" rel="noreferrer">Book a call <Icon name="arrow" size={16} /></a></div>
    </header>

    <div className="deck-layout">
      <aside className="sidebar" aria-label="Deck navigation">
        <div className="sidebar-heading"><p className="eyebrow">A LOOK INSIDE ORBIX</p><div className="sidebar-title">Studio deck <span>{slides.length} slides</span></div></div>
        <button className="outline-button browse-button" onClick={() => { setTimingOpen(false); setOverview(true); }}><Icon name="grid" size={16} /> Browse all slides <span>Ctrl / ⌘ K</span></button>
        <nav className="slide-navigation" aria-label="Slides">{sections.map(section => <div className="nav-section" key={section}><h2>{section}<span>{slides.filter(s => s.section === section).length}</span></h2>{slides.map((s, i) => s.section === section && <button key={s.id} ref={i === index ? selectedRef : undefined} className={`slide-nav-item ${index === i ? 'active' : ''}`} onClick={() => goTo(i)} aria-current={index === i ? 'step' : undefined} aria-label={`Slide ${i + 1}: ${s.title}`}><span className="nav-thumbnail"><img src={s.thumbnail} alt="" width="96" height="54" loading="lazy" /></span><span className="nav-slide-label"><span className="nav-number">{padded(i + 1)}</span><span>{s.title}</span></span>{i === index && <span className="active-indicator" />}</button>)}</div>)}</nav>
        <div className="sidebar-bottom"><span className="status-dot" /><span>A little clarity. A lot of possibility.</span><a href="https://www.orbix.studio" target="_blank" rel="noreferrer" aria-label="Visit Orbix studio"><Icon name="arrow" size={14} /></a></div>
      </aside>

      <main className="viewer" id="slide-viewer" tabIndex={-1}>
        <div className="viewer-topline"><div key={`location-${slide.id}`} className="slide-location"><span className="mobile-brand">ORBIX</span><span className="eyebrow">{slide.section}</span><span className="location-divider">/</span><span>Slide {padded(index + 1)}</span></div><div className="view-tools"><button className="text-button overview-shortcut" aria-label="Overview" onClick={() => { setTimingOpen(false); setOverview(true); }}><Icon name="grid" size={16} /><span>Overview</span></button><span className="tool-divider" /><button type="button" className="icon-button motion-toggle" aria-label={reducedMotion ? 'Animation follows reduced motion preference' : 'Slide animation'} title={reducedMotion ? 'Reduced motion is enabled on your device' : activeMotion ? 'Turn slide animation off' : 'Turn slide animation on'} aria-pressed={activeMotion} disabled={reducedMotion} onClick={() => { setPlaying(false); setMotionEnabled(v => !v); }}><Icon name="motion" /></button><IconButton icon={focus ? 'close' : 'focus'} label={focus ? 'Exit focus mode' : 'Enter focus mode'} aria-pressed={focus} onClick={() => setFocus(v => !v)} /><IconButton icon="expand" label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-pressed={fullscreen} onClick={toggleFullscreen} /></div></div>

        <div className="slide-stage" style={{ '--slide-ratio': slide.width / slide.height } as React.CSSProperties} role="region" aria-label="Slide artwork" onTouchStart={e => { if (e.touches.length !== 1) { touch.current = null; return; } const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={e => { if (!touch.current || e.changedTouches.length !== 1) return; const t = e.changedTouches[0]; const dx = t.clientX - touch.current.x; const dy = t.clientY - touch.current.y; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.7) goTo(index + (dx < 0 ? 1 : -1)); touch.current = null; }}>
          <div className="slide-image-wrap" style={{ aspectRatio: `${slide.width} / ${slide.height}` }}>
            <MotionArtwork key={artworkKey} imageSrc={imageSrc} motion={motionSlides.find(s => s.id === slide.id)} enabled={activeMotion} direction={direction} alt={`Slide ${index + 1}: ${slide.title}. Use Read slide for the original slide text.`} width={slide.width} height={slide.height} onReady={() => setLoaded(artworkKey)} onError={() => setImageError(artworkKey)} onFallback={() => setNotice('Animation unavailable for this slide. Showing original artwork.')} />
            {loaded !== artworkKey && imageError !== artworkKey && <span className="slide-loader" role="status"><span className="loader" /><span>Loading slide {index + 1}</span></span>}
            {imageError === artworkKey && <div className="slide-failure"><p>This slide could not load.</p><button className="outline-button" onClick={() => setImageRetry(previous => ({ image: slide.image, count: previous.count + 1 }))}>Retry slide</button></div>}
          </div>
        </div>

        <div className="slide-progress" role="progressbar" aria-label="Deck progress" aria-valuemin={1} aria-valuemax={slides.length} aria-valuenow={index + 1}><span style={{ width: `${((index + 1) / slides.length) * 100}%` }} /></div>
        <div className="slide-toolbar"><div key={`information-${slide.id}`} className="slide-information"><span className="slide-counter">{padded(index + 1)}<span> / {padded(slides.length)}</span></span><h1>{slide.title}</h1></div><div className="slide-controls"><div className="secondary-controls"><button className="text-button read-button" aria-label="Read slide" onClick={() => { setTimingOpen(false); setReadCopy(true); }}><Icon name="text" size={16} /><span>Read slide</span></button><IconButton icon={notice === 'Slide link copied.' ? 'check' : 'link'} label="Copy link to this slide" onClick={copyLink} /><IconButton icon="replay" label="Replay slide animation" disabled={!activeMotion} onClick={() => { setPlaying(false); setReplay(v => v + 1); }} /></div><div className="page-controls"><IconButton icon="left" label="Previous slide" disabled={index === 0} onClick={() => goTo(index - 1)} /><IconButton icon="right" label="Next slide" disabled={index === slides.length - 1} onClick={() => goTo(index + 1)} /></div></div></div>
        <footer className="viewer-footer"><span className="keyboard-hint"><kbd>←</kbd><kbd>→</kbd> to explore <span className="hint-dot">·</span> <kbd>F</kbd> to focus</span><div className={`autoplay-controls ${playing ? 'is-playing' : ''}`}><button className="autoplay-button" aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} aria-pressed={playing} disabled={index === slides.length - 1} onClick={() => { setTimingOpen(false); setPlaying(v => !v); }}><Icon name={playing ? 'pause' : 'play'} size={14} /><span>{playing ? 'Pause' : 'Play slides'}</span></button><DurationPicker value={duration} onChange={setDuration} open={timingOpen} onOpenChange={setTimingOpen} /><span className="autoplay-progress" aria-hidden="true" style={{ width: `${autoplayProgress * 100}%` }} /></div><span className="mobile-hint">Swipe to explore</span><a href="/read/" target="_blank" rel="noreferrer">Read the full deck. <Icon name="arrow" size={13} /></a></footer>
      </main>
    </div>

    {overview && <Dialog title="Find your next perspective." subtitle={`${slides.length} slides. Explore at your own pace.`} onClose={closeOverview} kind="overview-dialog"><label className="search-box"><Icon name="search" /><input data-autofocus type="search" placeholder="Search slides, projects, or a phrase…" aria-label="Search slides" value={query} onChange={e => setQuery(e.target.value)} /><span>{filtered.length} slides</span></label><div className="overview-grid">{filtered.map(s => { const i = slides.indexOf(s); return <button key={s.id} className={`overview-card ${i === index ? 'selected' : ''}`} onClick={() => goTo(i)} aria-label={`Open slide ${i + 1}: ${s.title}`}><div className="overview-image" style={{ aspectRatio: `${s.width} / ${s.height}` }}><img src={s.thumbnail} alt="" loading="lazy" width={s.width} height={s.height} />{i === index && <span className="viewing-label">You’re here</span>}</div><div className="overview-card-caption"><span>{padded(i + 1)}</span><strong>{s.title}</strong></div></button>; })}{filtered.length === 0 && <div className="empty-search"><h3>No slides found.</h3><p>Try a different word or phrase.</p><button className="outline-button" onClick={() => setQuery('')}>Clear search</button></div>}</div></Dialog>}
    {readCopy && <Dialog title={slide.title} subtitle={`Slide ${padded(index + 1)} / ${padded(slides.length)} · ${slide.section}`} onClose={closeReadCopy} kind="copy-dialog"><div className="slide-copy" tabIndex={0} role="region" aria-label="Original slide text">{slide.text?.trim() || 'This slide contains visual artwork. Explore the full slide in the viewer.'}</div></Dialog>}
    <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">{notice}</div>
    <span className="sr-only" aria-live="polite" aria-atomic="true">Slide {index + 1} of {slides.length}: {slide.title}</span>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
