import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { TreeSkeleton } from './TreeSkeleton';

describe('TreeSkeleton', () => {
  it('is a busy, board-shaped placeholder with an accessible loading label', () => {
    const { container } = renderWithProviders(<TreeSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('.board-grid')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải cây gia phả…');
  });
});
