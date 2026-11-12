import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders a non-submitting primary button by default', () => {
    render(<Button>Lưu thay đổi</Button>);
    const button = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'md');
  });

  it('applies the requested variant and size', () => {
    render(
      <Button variant="danger" size="sm">
        Xoá
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Xoá' });
    expect(button).toHaveAttribute('data-variant', 'danger');
    expect(button.className).toContain('bg-stamp');
    // A dedicated token: stamp/85 over paper leaves on-stamp text below 4.5:1.
    expect(button.className).toContain('hover:bg-stamp-hover');
    expect(button.className).toContain('h-8');
  });

  it('lets custom classes override variant classes', () => {
    render(<Button className="h-12">Tiếp</Button>);
    const button = screen.getByRole('button', { name: 'Tiếp' });
    expect(button.className).toContain('h-12');
    expect(button.className).not.toContain('h-10');
  });

  it('styles its child element with asChild', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/design">Bộ thiết kế</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Bộ thiết kế' });
    expect(link).toHaveAttribute('href', '/design');
    expect(link).not.toHaveAttribute('type');
    expect(link.className).toContain('border-line-strong');
  });

  it('calls onClick unless disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Đi</Button>);
    await user.click(screen.getByRole('button', { name: 'Đi' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Đi
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Đi' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
