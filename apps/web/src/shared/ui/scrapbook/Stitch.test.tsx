import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stitch } from './Stitch';

describe('Stitch', () => {
  it('draws a divorce as two halves with a gap', () => {
    const { container, rerender } = render(
      <svg>
        <Stitch left={{ x: 0, y: 0 }} right={{ x: 100, y: 0 }} />
      </svg>,
    );
    expect(container.querySelectorAll('path')).toHaveLength(1);
    // A marriage's knot is a solid dot in the thread's colour, unlike a divorce's open ring.
    expect(container.querySelector('circle')).toHaveClass('stitch-knot');
    expect(container.querySelector('circle')).not.toHaveClass('stitch-ring');
    expect(container.querySelector('[data-relation="marriage"]')).not.toHaveAttribute(
      'data-broken',
    );
    rerender(
      <svg>
        <Stitch left={{ x: 0, y: 0 }} right={{ x: 100, y: 0 }} broken />
      </svg>,
    );
    const halves = [...container.querySelectorAll('path')].map((path) => path.getAttribute('d'));
    expect(halves).toEqual(['M0 0 L38 0', 'M62 0 L100 0']);
    expect(container.querySelector('[data-relation="marriage"]')).toHaveAttribute(
      'data-broken',
      'true',
    );
    // The knot is an open ring.
    expect(container.querySelector('circle')).toHaveClass('stitch-ring');
    expect(container.querySelector('circle')).not.toHaveClass('stitch-knot');
  });

  it('fills a selected knot in the selection colour, and keeps a divorce open', () => {
    const { container, rerender } = render(
      <svg>
        <Stitch left={{ x: 0, y: 0 }} right={{ x: 100, y: 0 }} selected />
      </svg>,
    );
    expect(container.querySelector('circle')).toHaveClass('fill-stamp', 'stroke-stamp');
    rerender(
      <svg>
        <Stitch left={{ x: 0, y: 0 }} right={{ x: 100, y: 0 }} selected broken />
      </svg>,
    );
    expect(container.querySelector('circle')).toHaveClass('fill-none', 'stroke-stamp');
  });
});
