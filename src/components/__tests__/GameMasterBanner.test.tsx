import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GameMasterBanner from '../GameMasterBanner';

afterEach(cleanup);

describe('optional GM banner', () => {
  it('is hidden by default even with populated adventure data', () => {
    const { container } = render(<GameMasterBanner location="Observatory" act="EXPOSITION" chapter={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not show empty labels or invented act/chapter values when enabled', () => {
    const { container, rerender } = render(<GameMasterBanner enabled />);
    expect(container).toBeEmptyDOMElement();
    rerender(<GameMasterBanner enabled location="unknown location" act="UNKNOWN" chapter={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<GameMasterBanner enabled location="Observatory" />);
    expect(screen.getByText('Observatory')).toBeInTheDocument();
    expect(screen.queryByText('Act')).not.toBeInTheDocument();
    expect(screen.queryByText('Day')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ch\./)).not.toBeInTheDocument();
  });

  it('shows only supplied act/chapter data and never Day', () => {
    const { rerender } = render(<GameMasterBanner enabled act="CLIMAX" />);
    expect(screen.getByText('III')).toBeInTheDocument();
    expect(screen.queryByText('Location')).not.toBeInTheDocument();
    rerender(<GameMasterBanner enabled act="CLIMAX" chapter={4} />);
    expect(screen.getByText('III · Ch. 4')).toBeInTheDocument();
    expect(screen.queryByText('Day')).not.toBeInTheDocument();
  });
});
