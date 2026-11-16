import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialsOf } from '../../shared/ui';
import { fixturePerson, GRANDPA } from './fixtures';
import { ProfilePhoto } from './ProfilePhoto';

const PHOTO = { publicId: 'ancestors-tree/dev/clans/c/people/p/0123456789abcdef', version: 7 };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ProfilePhoto', () => {
  it('shows the profile photo, named for the person', () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo');
    render(<ProfilePhoto person={fixturePerson(GRANDPA, 'Nguyễn Văn Tư', { photo: PHOTO })} />);
    const img = screen.getByRole('img', { name: 'Ảnh của Nguyễn Văn Tư' });
    expect(img).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_face,w_480,h_480,f_auto,q_auto/v7/ancestors-tree/dev/clans/c/people/p/0123456789abcdef',
    );
  });

  it('shows the initials without a photo', () => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo');
    const { container } = render(<ProfilePhoto person={fixturePerson(GRANDPA, 'Nguyễn Văn Tư')} />);
    expect(screen.getByText(initialsOf('Nguyễn Văn Tư'))).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
