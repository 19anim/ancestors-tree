import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Board } from './Board';

describe('Board', () => {
  it('is a labelled group of the given size on grid paper', () => {
    render(
      <Board width={560} height={420} label="Cây gia phả mẫu">
        <p>nội dung</p>
      </Board>,
    );
    const board = screen.getByRole('group', { name: 'Cây gia phả mẫu' });
    expect(board).toHaveStyle({ width: '560px', height: '420px' });
    expect(board.className).toContain('board-grid');
    expect(screen.getByText('nội dung')).toBeInTheDocument();
  });

  it('carries the tree theme for its CSS, grid paper and cotton by default', () => {
    const { rerender } = render(<Board width={10} height={10} label="Bảng" />);
    const board = screen.getByRole('group', { name: 'Bảng' });
    expect(board).toHaveAttribute('data-surface', 'grid-paper');
    expect(board).toHaveAttribute('data-thread', 'cotton');
    expect(board).toHaveAttribute('data-stitch', 'cotton');
    rerender(
      <Board width={10} height={10} label="Bảng" surface="fridge" thread="yarn" stitch="yarn" />,
    );
    expect(board).toHaveAttribute('data-surface', 'fridge');
    expect(board).toHaveAttribute('data-stitch', 'yarn');
  });
});
