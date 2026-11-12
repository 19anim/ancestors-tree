import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Polaroid, POLAROID_SIZE } from './Polaroid';

const LABEL = 'Ông Thịnh, 1931–2004';

describe('Polaroid', () => {
  it('renders the full card with tape, initials, caption and accessible name', () => {
    render(<Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" tilt={1.5} />);
    const card = screen.getByRole('figure', { name: LABEL });
    expect(card).toHaveAttribute('data-lod', 'full');
    expect(card).toHaveAttribute('data-tape', 'progenitor');
    expect(within(card).getByText('Ông Thịnh')).toBeInTheDocument();
    expect(within(card).getByText('T')).toBeInTheDocument();
    expect(card.querySelector('img')).toBeNull();
  });

  it('shows the photo instead of initials when there is one', () => {
    render(<Polaroid name="Bà Hoa" label="Bà Hoa" tape="in-law" photoUrl="/hoa.jpg" />);
    const card = screen.getByRole('figure', { name: 'Bà Hoa' });
    expect(card.querySelector('img')).toHaveAttribute('src', '/hoa.jpg');
    expect(card.querySelector('img')).toHaveAttribute('alt', '');
    expect(within(card).queryByText('H')).not.toBeInTheDocument();
  });

  it('makes the full card tall enough for the line under the caption', () => {
    expect(POLAROID_SIZE.full).toEqual({ width: 100, height: 138 });
  });

  it('writes the date line under the caption, not on the photo', () => {
    render(
      <Polaroid
        name="Ông Thịnh"
        label={LABEL}
        tape="progenitor"
        lifeYears="1931–2004"
        dateLine={<span>Giỗ 15/10 ÂL</span>}
      />,
    );
    const card = screen.getByRole('figure', { name: LABEL });
    const line = card.querySelector('[data-part="date-line"]');
    expect(line).toContainElement(screen.getByText('Giỗ 15/10 ÂL'));
    expect(card.querySelector('[data-part="photo"]')).not.toContainElement(line as HTMLElement);
    expect(within(card).queryByText('1931–2004')).not.toBeInTheDocument();
  });

  it('shows the life years on the date line when there is no anniversary', () => {
    render(<Polaroid name="Bố Tuấn" label="Bố Tuấn, 1962" tape={0} lifeYears="1962–" />);
    const card = screen.getByRole('figure', { name: 'Bố Tuấn, 1962' });
    expect(card.querySelector('[data-part="date-line"]')).toHaveTextContent('1962–');
  });

  it('renders stickers and the date line on the full card only', () => {
    const props = {
      name: 'Mẹ Lan',
      label: 'Mẹ Lan, 1965',
      tape: 'in-law',
      marks: <span>21/11</span>,
      dateLine: <span>Giỗ 15/10 ÂL</span>,
    } as const;
    const { rerender } = render(<Polaroid {...props} />);
    expect(screen.getByText('21/11')).toBeInTheDocument();
    expect(screen.getByText('Giỗ 15/10 ÂL')).toBeInTheDocument();

    rerender(<Polaroid {...props} lod="label" />);
    expect(screen.queryByText('21/11')).not.toBeInTheDocument();
    expect(screen.queryByText('Giỗ 15/10 ÂL')).not.toBeInTheDocument();
  });

  it('sticks stickers on the photo, not over the caption', () => {
    render(<Polaroid name="Mẹ Lan" label="Mẹ Lan" tape="in-law" marks={<span>21/11</span>} />);
    const card = screen.getByRole('figure', { name: 'Mẹ Lan' });
    const mark = screen.getByText('21/11');
    expect(card.querySelector('[data-part="photo"]')).toContainElement(mark);
    expect(within(card).getByText('Mẹ Lan')).not.toContainElement(mark);
  });

  it('renders a taped name label at medium zoom', () => {
    render(<Polaroid name="Bố Tuấn" label="Bố Tuấn, 1962" tape={0} lod="label" lifeYears="1962" />);
    const card = screen.getByRole('figure', { name: 'Bố Tuấn, 1962' });
    expect(card).toHaveAttribute('data-lod', 'label');
    expect(card).toHaveAttribute('data-tape', 'branch-1');
    expect(within(card).getByText('Bố Tuấn')).toBeInTheDocument();
    expect(within(card).getByText('1962')).toBeInTheDocument();
  });

  it('renders only a strip of tape when zoomed far out, keeping the accessible name', () => {
    render(<Polaroid name="Cô Hà" label="Cô Hà, 1968" tape={1} lod="strip" />);
    const card = screen.getByRole('figure', { name: 'Cô Hà, 1968' });
    expect(card).toHaveAttribute('data-lod', 'strip');
    expect(card.textContent).toBe('');
  });

  it('passes extra props and classes through', () => {
    render(
      <Polaroid
        name="Mẹ Lan"
        label="Mẹ Lan"
        tape="in-law"
        className="absolute"
        data-testid="lan"
      />,
    );
    expect(screen.getByTestId('lan').className).toContain('absolute');
  });
});
