import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { PersonPicker, type PickerOption } from './PersonPicker';

const OPTIONS: PickerOption[] = [
  { id: 'a', name: 'Nguyễn Văn Tư', blockedReason: 'Quan hệ này đã có rồi.' },
  { id: 'b', name: 'Trần Văn Bình', note: 'Ảnh chưa dán' },
];

function Harness({ options = OPTIONS }: { options?: PickerOption[] }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const shown = query === '' ? [] : options;
  return (
    <PersonPicker
      label="Tìm theo tên"
      listLabel="Người tìm được"
      status={
        query === ''
          ? ''
          : shown.length === 0
            ? 'Không có ai trùng tên này.'
            : `Tìm thấy ${shown.length} người.`
      }
      query={query}
      onQueryChange={setQuery}
      options={shown}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
}

const original = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = original;
});

describe('PersonPicker', () => {
  it('lists matches, keeps blocked ones with their reason, and selects with the keyboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Tìm theo tên' }), 'n');
    const list = screen.getByRole('listbox', { name: 'Người tìm được' });
    const blocked = screen.getByRole('option', { name: /Nguyễn Văn Tư/ });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).toHaveTextContent('Quan hệ này đã có rồi.');
    await user.click(blocked);
    expect(blocked).toHaveAttribute('aria-selected', 'false');

    await user.tab();
    expect(list).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('option', { name: /Trần Văn Bình/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('announces how many it found, and links the search box to that and to the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const search = screen.getByRole('searchbox', { name: 'Tìm theo tên' });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
    await user.type(search, 'n');
    expect(status).toHaveTextContent('Tìm thấy 2 người.');
    expect(search).toHaveAttribute('aria-describedby', status.id);
    expect(search).toHaveAttribute(
      'aria-controls',
      screen.getByRole('listbox', { name: 'Người tìm được' }).id,
    );
  });

  it('announces when no one matches', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness options={[]} />);
    const search = screen.getByRole('searchbox', { name: 'Tìm theo tên' });
    await user.type(search, 'zz');
    expect(screen.getByRole('status')).toHaveTextContent('Không có ai trùng tên này.');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(search).not.toHaveAttribute('aria-controls');
  });

  it('scrolls the active option into view and outlines it', async () => {
    const user = userEvent.setup();
    const scrolled = vi.fn<(this: Element, options?: ScrollIntoViewOptions) => void>();
    Element.prototype.scrollIntoView = scrolled;
    renderWithProviders(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Tìm theo tên' }), 'n');
    await user.tab();
    await user.keyboard('{ArrowDown}');
    const second = screen.getByRole('option', { name: /Trần Văn Bình/ });
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-activedescendant', second.id);
    expect(scrolled.mock.contexts.at(-1)).toBe(second);
    expect(scrolled).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(second).toHaveClass('group-focus-visible:outline-accent');
    expect(screen.getByRole('option', { name: /Nguyễn Văn Tư/ })).not.toHaveClass(
      'group-focus-visible:outline-accent',
    );
  });
});
