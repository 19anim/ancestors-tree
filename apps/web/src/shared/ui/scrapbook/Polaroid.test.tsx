import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Polaroid, POLAROID_SIZE } from './Polaroid';
import { initialsOf } from './initials';
import { tapeColor } from './tape';

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

  it('falls back to the initials when the photo fails to load', () => {
    const { container } = render(
      <Polaroid
        name="Nguyễn Văn Tư"
        label="x"
        tape={1}
        photoUrl="https://res.cloudinary.com/demo/x"
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(screen.getByText(initialsOf('Nguyễn Văn Tư'))).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
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

  it('carries its frame and fastener, and draws the fastener on the full card only', () => {
    const { rerender } = render(
      <Polaroid name="Ông Thịnh" label={LABEL} tape={2} frame="kraft" fastener="pushpin" />,
    );
    const card = screen.getByRole('figure', { name: LABEL });
    expect(card).toHaveAttribute('data-frame', 'kraft');
    expect(card).toHaveAttribute('data-fastener', 'pushpin');
    const fastener = card.querySelector<HTMLElement>('[data-part="fastener"]');
    expect(fastener).toHaveClass('fastener');
    // The branch colour, as the washi tape had.
    expect(fastener?.style.getPropertyValue('--fastener-color')).toBe(tapeColor(2));
    rerender(<Polaroid name="Ông Thịnh" label={LABEL} tape={2} lod="label" frame="kraft" />);
    expect(screen.getByRole('figure', { name: LABEL })).toHaveAttribute('data-frame', 'kraft');
    expect(document.querySelector('[data-part="fastener"]')).toBeNull();
  });

  it('defaults to the classic frame and washi tape', () => {
    render(<Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" />);
    const card = screen.getByRole('figure', { name: LABEL });
    expect(card).toHaveAttribute('data-frame', 'classic');
    expect(card).toHaveAttribute('data-fastener', 'washi');
  });
});
