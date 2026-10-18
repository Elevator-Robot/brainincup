import { createRef, useCallback, useMemo, useRef, type CSSProperties, type MutableRefObject, type RefObject } from 'react';
import { Canvas, events as createEvents, type CanvasProps } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { createDiceCamera } from '../../utils/diceCamera';
import { DIE_STYLES } from '../../game/dice';
import DiceArena from './DiceArena';
import { getDieMotion, type DiceSceneProps } from './types';

const assetEvents: NonNullable<CanvasProps['events']> = store => ({
  ...createEvents(store),
  compute: (event, state) => {
    // The canvas has extra headroom above its DOM event source. Client-space
    // raycasting keeps hits on the actual geometry after scrolling or resizing.
    const bounds = state.gl.domElement.getBoundingClientRect();
    state.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    state.raycaster.setFromCamera(state.pointer, state.camera);
  },
});

/** One renderer for one die, a percentile pair, or the preview collection. */
export default function DiceScene(props: DiceSceneProps) {
  const camera = useMemo(createDiceCamera, []);
  const lights = useRef(new Map<string, RefObject<HTMLSpanElement>>());
  const getLightRef = useCallback((id: string) => {
    if (!lights.current.has(id)) lights.current.set(id, createRef<HTMLSpanElement>());
    return lights.current.get(id)!;
  }, []);
  return <span className="cosmic-three-dice-shell">
    {props.dice.map(die => {
      const roll = getDieMotion(props, die.id);
      const enabled = Boolean(props.canActivate && !roll.isRolling && props.onDieActivate);
      const label = typeof props.actionLabel === 'function' ? props.actionLabel(die, roll.isRolling)
        : `${props.actionLabel ?? 'Roll die'}${props.dice.length > 1 ? ` (${die.label})` : ''}`;
      const anchor = props.dice.length === 1 ? props.stageRef : getLightRef(die.id);
      const button = <button type="button" className="cosmic-die-keyboard-target" disabled={!enabled}
        aria-label={label}
        onFocus={() => { if (anchor.current) anchor.current.dataset.focused = 'true'; }}
        onBlur={() => { if (anchor.current) delete anchor.current.dataset.focused; }}
        onClick={event => { if (event.detail === 0 && enabled) props.onDieActivate?.(die.id); }}>
        <span className="sr-only">{label}</span>
      </button>;
      return props.dice.length > 1
        ? <span key={die.id} ref={anchor} className="cosmic-die-light" data-rolling={roll.isRolling || undefined}
          style={{ '--dice-light': DIE_STYLES[die.kind].light, '--dice-roll-duration': `${roll.duration}ms` } as CSSProperties}>{button}</span>
        : <span key={die.id}>{button}</span>;
    })}
    <span className="cosmic-three-dice-canvas-wrap">
      <Canvas aria-hidden="true" frameloop={props.active ? 'demand' : 'never'} className="cosmic-three-dice-canvas"
        orthographic camera={camera} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        eventSource={props.stageRef as MutableRefObject<HTMLElement>} events={assetEvents} shadows={false}>
        <ambientLight intensity={.34} />
        <hemisphereLight intensity={.72} color="#b28cff" groundColor="#143f4f" />
        <directionalLight position={[3.2, 4.4, 2.2]} intensity={1.12} color="#f2f6ff" />
        <directionalLight position={[-2.6, 1.8, -3.2]} intensity={.52} color="#7dd3fc" />
        <pointLight position={[0, .8, 1.6]} intensity={1.1} color="#8b5cf6" distance={6} />
        <Physics gravity={[0, -18, 0]} timeStep={1 / 60} paused={!props.active || props.motion === false}>
          <DiceArena {...props} getLightRef={getLightRef} />
        </Physics>
      </Canvas>
    </span>
  </span>;
}
