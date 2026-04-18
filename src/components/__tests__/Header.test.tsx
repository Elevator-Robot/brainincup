/**
 * Vitest unit tests for Header component.
 *
 * Verifies:
 * 1. Location badge renders when currentLocation prop is provided
 * 2. Badge is absent when currentLocation prop is undefined
 * 3. Location text updates reactively when prop changes
 *
 * **Validates: Requirements 13.1, 13.2, 13.4, 13.6**
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from '../Header';

// Mock aws-amplify/auth to avoid real auth calls in tests
vi.mock('aws-amplify/auth', () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

describe('Header', () => {
  it('renders the title', () => {
    render(<Header />);
    expect(screen.getByText('Brain in Cup')).toBeTruthy();
  });

  it('renders the Sign Out button', () => {
    render(<Header />);
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  // Requirement 13.1, 13.2 — location badge renders when prop is provided
  it('renders location badge when currentLocation prop is provided', () => {
    render(<Header currentLocation="The Shrouded Vale" />);
    expect(screen.getByText('The Shrouded Vale')).toBeTruthy();
  });

  // Requirement 13.6 — badge absent when prop is undefined
  it('does not render location badge when currentLocation is undefined', () => {
    render(<Header />);
    expect(screen.queryByText('The Shrouded Vale')).toBeNull();
  });

  it('does not render location badge when currentLocation is not passed', () => {
    const { container } = render(<Header />);
    // No span with location text should exist
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(0);
  });

  // Requirement 13.4 — location text updates reactively
  it('updates location text when prop changes', () => {
    const { rerender } = render(<Header currentLocation="The Shrouded Vale" />);
    expect(screen.getByText('The Shrouded Vale')).toBeTruthy();

    rerender(<Header currentLocation="The Darkwood" />);
    expect(screen.queryByText('The Shrouded Vale')).toBeNull();
    expect(screen.getByText('The Darkwood')).toBeTruthy();
  });

  it('removes location badge when prop changes to undefined', () => {
    const { rerender } = render(<Header currentLocation="The Shrouded Vale" />);
    expect(screen.getByText('The Shrouded Vale')).toBeTruthy();

    rerender(<Header />);
    expect(screen.queryByText('The Shrouded Vale')).toBeNull();
  });

  // Requirement 13.5 — location is visually subordinate (check class)
  it('applies secondary text styling to location badge', () => {
    const { container } = render(<Header currentLocation="The Shrouded Vale" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('text-brand-text-secondary');
    expect(badge?.className).toContain('font-light');
  });
});
