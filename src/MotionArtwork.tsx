import { useRef, useState } from 'react';

export type MotionSlide = {
  id: number;
  background: string;
  animated: boolean;
  layers: Array<{ src: string; delay: number; kind: 'heading' | 'body' | 'label' | 'footer'; bounds?: [number, number, number, number]; frame?: [number, number, number, number] }>;
};

type Props = {
  imageSrc: string;
  motion?: MotionSlide;
  enabled: boolean;
  direction: 'forward' | 'backward';
  alt: string;
  width: number;
  height: number;
  onReady: () => void;
  onError: () => void;
  onFallback: () => void;
};

export function MotionArtwork({ imageSrc, motion, enabled, direction, alt, width, height, onReady, onError, onFallback }: Props) {
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const completed = useRef(new Set<number>());
  const reportedReady = useRef(false);
  const reportedFallback = useRef(false);
  const layered = enabled && motion?.animated && motion.layers.length > 0 && !fallback;
  const headline = motion?.layers.find(layer => layer.kind === 'heading');
  const composition = !layered ? 'showcase' : motion.id === 1 ? 'cover'
    : headline?.bounds && headline.bounds[2] - headline.bounds[0] > width * .65 ? 'statement'
    : headline ? 'editorial' : 'cards';
  const order = { heading: 0, body: 0, label: 0, footer: 0 };

  function finish() {
    if (reportedReady.current) return;
    reportedReady.current = true;
    setReady(true);
    onReady();
  }

  function loadedAsset(asset: number) {
    completed.current.add(asset);
    if (completed.current.size === (motion?.layers.length ?? 0) + 1) finish();
  }

  function useOriginal() {
    if (reportedFallback.current) return;
    reportedFallback.current = true;
    setFallback(true);
    onFallback();
  }

  return <div className={`motion-artwork composition-${composition} ${ready ? 'is-ready' : ''} ${enabled ? 'motion-enabled' : ''}`} data-direction={direction} role="img" aria-label={alt}>
    {layered ? <>
      <img className="motion-background" src={motion.background} alt="" aria-hidden="true" width={width} height={height} onLoad={() => loadedAsset(0)} onError={useOriginal} fetchPriority="high" draggable={false} />
      {motion.layers.map((layer, i) => {
        const rank = order[layer.kind]++;
        const bounds = layer.bounds ?? [0, 0, width, height];
        const centerX = (bounds[0] + bounds[2]) / 2;
        const centerY = (bounds[1] + bounds[3]) / 2;
        const frame = layer.frame;
        const delay = layer.kind === 'label' ? .02 + rank * .035
          : layer.kind === 'footer' ? .46 + rank * .045
          : layer.kind === 'heading' ? .1 + Math.min(rank, 3) * .1
          : composition === 'cards' ? .16 + Math.max(0, Math.min(bounds[1] / height, 1)) * .3 + Math.max(0, Math.min(bounds[0] / width, 1)) * .1
          : .28 + Math.min(rank, 5) * .065;
        return <img key={layer.src} className={`motion-text motion-text-${layer.kind}`} style={{
          '--text-delay': `${delay}s`,
          '--text-side': centerX > width * .55 ? 1 : -1,
          '--reveal-bottom': frame ? '100%' : `${Math.max(0, Math.min(100, 102 - bounds[1] / height * 100))}%`,
          '--reveal-end': frame ? '0%' : `${Math.max(0, Math.min(100, 98 - bounds[3] / height * 100))}%`,
          transformOrigin: frame ? '50% 50%' : `${Math.max(0, Math.min(100, centerX / width * 100))}% ${Math.max(0, Math.min(100, centerY / height * 100))}%`,
          ...(frame && { inset: 'auto', left: `${frame[0] / width * 100}%`, top: `${frame[1] / height * 100}%`, width: `${(frame[2] - frame[0]) / width * 100}%`, height: `${(frame[3] - frame[1]) / height * 100}%` }),
        } as React.CSSProperties} src={layer.src} alt="" aria-hidden="true" width={width} height={height} onLoad={() => loadedAsset(i + 1)} onError={useOriginal} fetchPriority="high" draggable={false} />;
      })}
    </> : <img className="motion-original" src={imageSrc} alt="" aria-hidden="true" width={width} height={height} onLoad={finish} onError={onError} fetchPriority="high" draggable={false} />}
  </div>;
}
