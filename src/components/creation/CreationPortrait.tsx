import { useEffect, useState } from 'react';
import type { CharacterAvatarOption } from '../../constants/gameMasterAvatars';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import CreationGlyph from './CreationGlyph';

interface PortraitLayer { key: number; portrait: CharacterAvatarOption; loaded: boolean }

/** Keep the previous artwork underneath until the next image has loaded and
 * faded fully in. Fast selection changes must never flash an empty portrait. */
export default function CreationPortrait({ portrait }: { portrait?: CharacterAvatarOption }) {
  const [layers, setLayers] = useState<PortraitLayer[]>(() => portrait ? [{ key: 0, portrait, loaded: false }] : []);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    setLayers(previous => {
      if (!portrait) return previous.length ? [] : previous;
      const last = previous[previous.length - 1];
      if (last?.portrait.id === portrait.id) return previous;
      return [...previous.filter(layer => layer.loaded), { key: (last?.key ?? -1) + 1, portrait, loaded: false }].slice(-4);
    });
  }, [portrait]);

  if (!portrait) return <div className="forge-hero-silhouette forge-portrait-reveal"><CreationGlyph kind="person" /></div>;
  const latest = layers[layers.length - 1];
  return <>{layers.map(layer => <img key={layer.key} className="forge-hero-art" src={layer.portrait.src}
    width="1024" height="1536" decoding="async" data-loaded={layer.loaded}
    alt={layer.key === latest?.key && layer.portrait.id === portrait.id ? 'Character portrait preview' : ''}
    aria-hidden={layer.key !== latest?.key || layer.portrait.id !== portrait.id ? true : undefined}
    onLoad={() => setLayers(previous => {
      const ready = previous.map(item => item.key === layer.key ? { ...item, loaded: true } : item);
      return reducedMotion && ready[ready.length - 1]?.key === layer.key ? [ready[ready.length - 1]] : ready;
    })}
    onAnimationEnd={event => {
      if (event.animationName !== 'forge-portrait-arrive') return;
      setLayers(previous => previous[previous.length - 1]?.key === layer.key ? [previous[previous.length - 1]] : previous);
    }} />)}</>;
}
