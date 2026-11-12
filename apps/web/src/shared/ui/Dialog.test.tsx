import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { Button } from './Button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from './Dialog';

function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Mở</Button>
      </DialogTrigger>
      <DialogContent title="Xoá Cô Hà khỏi cây?" description="Có thể hoàn tác ngay sau đó.">
        <DialogClose asChild>
          <Button variant="secondary">Giữ lại</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

async function openExample() {
  const user = userEvent.setup();
  renderWithProviders(<Example />);
  await user.click(screen.getByRole('button', { name: 'Mở' }));
  return user;
}

describe('Dialog', () => {
  it('opens with an accessible name and description', async () => {
    await openExample();
    const dialog = screen.getByRole('dialog', { name: 'Xoá Cô Hà khỏi cây?' });
    expect(dialog).toHaveAccessibleDescription('Có thể hoàn tác ngay sau đó.');
  });

  it('closes with the close button', async () => {
    const user = await openExample();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes from a DialogClose action', async () => {
    const user = await openExample();
    await user.click(screen.getByRole('button', { name: 'Giữ lại' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes with Escape and returns focus to the trigger', async () => {
    const user = await openExample();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở' })).toHaveFocus();
  });
});
