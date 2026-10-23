import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CreationPortrait from '../creation/CreationPortrait';
import { getAvatarOptionsForRace } from '../../constants/gameMasterAvatars';

const portraits = getAvatarOptionsForRace('Terran');
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function finishFade(image: HTMLElement) {
  for (const type of ['animationend', 'webkitAnimationEnd']) {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'forge-portrait-arrive' });
    fireEvent(image, event);
  }
}

it('retains the outgoing portrait until the replacement has loaded and faded in', () => {
  const { container, rerender } = render(<CreationPortrait portrait={portraits[0]} />);
  const original = screen.getByAltText('Character portrait preview');
  fireEvent.load(original);
  rerender(<CreationPortrait portrait={portraits[1]} />);
  const incoming = screen.getByAltText('Character portrait preview');
  expect(container.querySelectorAll('img')).toHaveLength(2);
  expect(original).toBeInTheDocument();
  expect(original).toHaveAttribute('aria-hidden', 'true');
  expect(incoming).toHaveAttribute('data-loaded', 'false');
  fireEvent.load(incoming);
  expect(incoming).toHaveAttribute('data-loaded', 'true');
  expect(original).toBeInTheDocument();
  finishFade(incoming);
  expect(container.querySelectorAll('img')).toHaveLength(1);
  expect(screen.getByAltText('Character portrait preview')).toBe(incoming);
});

it('does not let an older fade discard a newer rapid selection', () => {
  const { container, rerender } = render(<CreationPortrait portrait={portraits[0]} />);
  fireEvent.load(screen.getByAltText('Character portrait preview'));
  rerender(<CreationPortrait portrait={portraits[1]} />);
  const middle = screen.getByAltText('Character portrait preview');
  fireEvent.load(middle);
  rerender(<CreationPortrait portrait={portraits[2]} />);
  const newest = screen.getByAltText('Character portrait preview');
  finishFade(middle);
  expect(newest).toBeInTheDocument();
  expect(container.querySelectorAll('img')).toHaveLength(3);
  fireEvent.load(newest);
  finishFade(newest);
  expect(container.querySelectorAll('img')).toHaveLength(1);
  expect(newest).toHaveAttribute('src', portraits[2].src);
});

it('replaces artwork directly for reduced motion without retaining old layers', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const { container, rerender } = render(<CreationPortrait portrait={portraits[0]} />);
  fireEvent.load(screen.getByAltText('Character portrait preview'));
  rerender(<CreationPortrait portrait={portraits[1]} />);
  fireEvent.load(screen.getByAltText('Character portrait preview'));
  expect(container.querySelectorAll('img')).toHaveLength(1);
  expect(screen.getByAltText('Character portrait preview')).toHaveAttribute('src', portraits[1].src);
});

it('keeps the no-artwork fallback when a race has no portraits', () => {
  const { container, rerender } = render(<CreationPortrait portrait={portraits[0]} />);
  rerender(<CreationPortrait />);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('.forge-hero-silhouette')).toBeInTheDocument();
});
