import { useEffect, useRef } from 'react';
import { createNebulaRenderer, type NebulaRenderer } from '../graphics/nebulaRenderer';

/** GPU detail is optional: the vector atmosphere remains underneath until the
 * first rendered frame, and returns immediately after context loss. */
export default function NebulaBackdrop({ paused, reducedMotion }: { paused: boolean; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<NebulaRenderer | null>(null);
  const settings = useRef({ paused, reducedMotion });
  settings.current = { paused, reducedMotion };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof WebGLRenderingContext === 'undefined') return;
    const initialize = () => {
      renderer.current?.destroy();
      try {
        renderer.current = createNebulaRenderer(canvas);
        renderer.current?.setMotion(settings.current.paused, settings.current.reducedMotion);
      } catch { renderer.current?.destroy(); renderer.current = null; delete canvas.dataset.ready; }
    };
    const lost = (event: Event) => {
      event.preventDefault(); renderer.current?.destroy(); renderer.current = null;
      canvas.dataset.contextLost = 'true';
    };
    const resize = () => renderer.current?.resize();
    initialize();
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', initialize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect(); window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', initialize);
      renderer.current?.destroy(); renderer.current = null;
    };
  }, []);
  useEffect(() => { renderer.current?.setMotion(paused, reducedMotion); }, [paused, reducedMotion]);
  return <canvas ref={canvasRef} className="cosmic-nebula-canvas" aria-hidden="true" />;
}
