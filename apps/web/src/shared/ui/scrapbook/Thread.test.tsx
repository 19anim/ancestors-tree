import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stitch } from './Stitch';
import { Thread } from './Thread';

function inSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>).container;
}

describe('Thread', () => {
  it('draws the thread path and a pin at the child', () => {
    const container = inSvg(
      <Thread from={{ x: 284, y: 102 }} dropTo={172} to={{ x: 140, y: 224 }} />,
    );
    const group = container.querySelector('[data-relation="parent-child"]');
    expect(group?.querySelector('path')).toHaveAttribute(
      'd',
      'M284 102 L284 172 C284 198 140 198 140 224',
    );
    const pin = group?.querySelector('circle');
    expect(pin).toHaveAttribute('cx', '140');
    expect(pin).toHaveAttribute('cy', '224');
    expect(group).not.toHaveAttribute('data-selected');
  });

  it('marks a selected thread', () => {
    const container = inSvg(
      <Thread from={{ x: 0, y: 0 }} dropTo={10} to={{ x: 0, y: 40 }} selected />,
    );
    const group = container.querySelector('[data-relation="parent-child"]');
    expect(group).toHaveAttribute('data-selected', 'true');
    expect(group?.querySelector('path')?.getAttribute('class')).toContain('stroke-stamp');
  });
});

describe('Stitch', () => {
  it('draws a dashed stitch with a knot in the middle', () => {
    const container = inSvg(<Stitch left={{ x: 270, y: 102 }} right={{ x: 298, y: 102 }} />);
    const group = container.querySelector('[data-relation="marriage"]');
    const path = group?.querySelector('path');
    expect(path).toHaveAttribute('d', 'M270 102 L298 102');
    expect(path).toHaveAttribute('stroke-dasharray', '4 4');
    const knot = group?.querySelector('circle');
    expect(knot).toHaveAttribute('cx', '284');
    expect(knot).toHaveAttribute('cy', '102');
  });
});
