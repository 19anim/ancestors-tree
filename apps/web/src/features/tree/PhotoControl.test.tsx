import type { Person } from '@ancestors-tree/shared/tree';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/lib/apiError';
import { mockApi } from '../../test/api';
import { ChangeContext, type RequestChange } from './ChangeRunner';
import {
  CLAN_ID as STORE_CLAN_ID,
  EMPTY_TREE_RESPONSE,
  fixturePerson,
  GRANDPA,
  ME,
  treeRoutes,
} from './fixtures';
import { PhotoControl } from './PhotoControl';
import { shrinkPhoto } from './photoFile';
import { PhotoUploadError, requestPhotoUpload, uploadPhoto } from './photoUpload';
import { signOutTreeStore, useTreeStore } from './store';

vi.mock('./photoFile', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  shrinkPhoto: vi.fn(),
}));
vi.mock('./photoUpload', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  requestPhotoUpload: vi.fn(),
  uploadPhoto: vi.fn(),
}));

const CLAN_ID = '64b7f0c2a1b2c3d4e5f6c001';
const PHOTO = { publicId: 'ancestors-tree/dev/clans/c/people/p/0123456789abcdef', version: 7 };
const TARGET = {
  publicId: 'p',
  url: 'https://api.cloudinary.com/v1_1/demo/image/upload',
  fields: {},
};

const jpg = () => new File([new Uint8Array(1000)], 'ong.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(shrinkPhoto).mockReset();
  vi.mocked(requestPhotoUpload).mockReset();
  vi.mocked(uploadPhoto).mockReset();
  vi.unstubAllGlobals();
  signOutTreeStore();
});

function renderControl(
  person: Person,
  requestChange: RequestChange | null = vi.fn(),
  clanId: string = CLAN_ID,
) {
  const result = render(
    <ChangeContext.Provider value={requestChange}>
      <PhotoControl clanId={clanId} person={person} />
    </ChangeContext.Provider>,
  );
  const input = () => {
    const element = result.container.querySelector('input[type="file"]');
    if (!(element instanceof HTMLInputElement)) throw new Error('no file input');
    return element;
  };
  return { ...result, input, requestChange };
}

const tu = (overrides: Partial<Person> = {}) => fixturePerson(GRANDPA, 'Nguyễn Văn Tư', overrides);

describe('PhotoControl', () => {
  it('shrinks, signs and uploads a photo, then saves it as a change', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(1000)]));
    vi.mocked(requestPhotoUpload).mockResolvedValue(TARGET);
    vi.mocked(uploadPhoto).mockImplementation((_target, _blob, onProgress) => {
      onProgress(0.5);
      return Promise.resolve({ publicId: 'p', version: 2 });
    });
    const requestChange = vi.fn();
    const user = userEvent.setup();
    const { input } = renderControl(tu(), requestChange);
    expect(input()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(input()).toHaveAttribute('tabindex', '-1');
    await user.upload(input(), jpg());
    await waitFor(() => expect(requestChange).toHaveBeenCalledTimes(1));
    expect(requestChange).toHaveBeenCalledWith(
      expect.objectContaining({
        change: { kind: 'photo', personId: GRANDPA, photo: { publicId: 'p', version: 2 } },
      }),
    );
    expect(requestPhotoUpload).toHaveBeenCalledWith(CLAN_ID, GRANDPA);
    // The input is cleared, so the same file can be chosen again.
    expect(input().value).toBe('');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đổi ảnh' })).toBeEnabled();
  });

  it('shows the progress while uploading, with both buttons disabled', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(1000)]));
    vi.mocked(requestPhotoUpload).mockResolvedValue(TARGET);
    vi.mocked(uploadPhoto).mockImplementation((_target, _blob, onProgress) => {
      onProgress(0.5);
      return new Promise(() => {});
    });
    const user = userEvent.setup();
    const { input } = renderControl(tu({ photo: PHOTO }));
    await user.upload(input(), jpg());
    const progress = await screen.findByRole('progressbar', { name: 'Đang tải ảnh lên…' });
    await waitFor(() => expect(progress).toHaveAttribute('value', '0.5'));
    expect(screen.getByRole('button', { name: 'Đổi ảnh' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gỡ ảnh' })).toBeDisabled();
  });

  it('refuses a gif and does nothing else', async () => {
    const requestChange = vi.fn();
    // The input's accept would hide the gif from the picker; a drop or "All files" still sends it.
    const user = userEvent.setup({ applyAccept: false });
    const { input } = renderControl(tu(), requestChange);
    await user.upload(input(), new File(['gif'], 'a.gif', { type: 'image/gif' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ nhận ảnh jpg, png hoặc webp.');
    expect(shrinkPhoto).not.toHaveBeenCalled();
    expect(requestPhotoUpload).not.toHaveBeenCalled();
    expect(requestChange).not.toHaveBeenCalled();
  });

  it('refuses a photo still over 2 MB after shrinking, before signing', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]));
    const user = userEvent.setup();
    const { input } = renderControl(tu());
    await user.upload(input(), jpg());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ảnh vẫn nặng hơn 2 MB sau khi thu nhỏ. Hãy chọn ảnh khác.',
    );
    expect(requestPhotoUpload).not.toHaveBeenCalled();
  });

  it('shows the API error when the server cannot sign', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(1000)]));
    vi.mocked(requestPhotoUpload).mockRejectedValue(
      new ApiError('PHOTOS_NOT_CONFIGURED', 'x', 503),
    );
    const user = userEvent.setup();
    const { input } = renderControl(tu());
    await user.upload(input(), jpg());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Máy chủ chưa được cài đặt để lưu ảnh.',
    );
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Đổi ảnh' })).toBeEnabled();
  });

  it('says the upload failed when the image host refuses it', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(1000)]));
    vi.mocked(requestPhotoUpload).mockResolvedValue(TARGET);
    vi.mocked(uploadPhoto).mockRejectedValue(new PhotoUploadError('The image host answered 400'));
    const requestChange = vi.fn();
    const user = userEvent.setup();
    const { input } = renderControl(tu(), requestChange);
    await user.upload(input(), jpg());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tải ảnh lên không thành công. Hãy thử lại.',
    );
    expect(requestChange).not.toHaveBeenCalled();
  });

  it('offers "Gỡ ảnh" only with a photo, and removes it as a change', async () => {
    const requestChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderControl(tu(), requestChange);
    expect(screen.queryByRole('button', { name: 'Gỡ ảnh' })).not.toBeInTheDocument();
    rerender(
      <ChangeContext.Provider value={requestChange}>
        <PhotoControl clanId={CLAN_ID} person={tu({ photo: PHOTO })} />
      </ChangeContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'Gỡ ảnh' }));
    expect(requestChange).toHaveBeenCalledWith(
      expect.objectContaining({ change: { kind: 'photo', personId: GRANDPA, photo: null } }),
    );
  });

  it('shows no buttons to viewers, nor without the cloud name', () => {
    const { unmount } = renderControl(tu({ photo: PHOTO }), null);
    expect(screen.getByRole('img', { name: 'Ảnh của Nguyễn Văn Tư' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', '');
    const { container } = renderControl(tu({ photo: PHOTO }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('cancels an upload in flight when it goes away', async () => {
    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(1000)]));
    vi.mocked(requestPhotoUpload).mockResolvedValue(TARGET);
    let signal: AbortSignal | undefined;
    vi.mocked(uploadPhoto).mockImplementation((_target, _blob, _onProgress, given) => {
      signal = given;
      return new Promise((_resolve, reject) => {
        given?.addEventListener('abort', () =>
          reject(new DOMException('The upload was cancelled', 'AbortError')),
        );
      });
    });
    const requestChange = vi.fn();
    const user = userEvent.setup();
    const { input, unmount } = renderControl(tu(), requestChange);
    await user.upload(input(), jpg());
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(requestChange).not.toHaveBeenCalled();
  });

  it('signs only once the save that adds the person has landed', async () => {
    // The API has no such person until the addPerson is saved: signing earlier answers 404.
    let landSave: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      landSave = resolve;
    });
    mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE),
      [`POST /clans/${STORE_CLAN_ID}/ops`]: async () => {
        await held;
        return { body: { seq: 1 } };
      },
    });
    useTreeStore.getState().setAccount(ME.id);
    await useTreeStore.getState().load(STORE_CLAN_ID);
    const newcomer = fixturePerson(GRANDPA, 'Nguyễn Văn Tư');
    useTreeStore.getState().apply({ type: 'addPerson', payload: newcomer });
    expect(useTreeStore.getState().pending).toHaveLength(1);

    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(1000)]));
    vi.mocked(requestPhotoUpload).mockResolvedValue(TARGET);
    vi.mocked(uploadPhoto).mockResolvedValue({ publicId: 'p', version: 2 });
    const requestChange = vi.fn();
    const user = userEvent.setup();
    const { input } = renderControl(newcomer, requestChange, STORE_CLAN_ID);
    await user.upload(input(), jpg());
    await waitFor(() => expect(shrinkPhoto).toHaveBeenCalled());
    // Still saving: the control waits, showing it is busy.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requestPhotoUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    landSave();
    await waitFor(() => expect(requestChange).toHaveBeenCalledTimes(1));
    expect(requestPhotoUpload).toHaveBeenCalledWith(STORE_CLAN_ID, GRANDPA);
    expect(useTreeStore.getState().pending).toHaveLength(0);
  });

  it('stops waiting for the save when it goes away', async () => {
    mockApi({
      ...treeRoutes(EMPTY_TREE_RESPONSE),
      [`POST /clans/${STORE_CLAN_ID}/ops`]: () => new Promise(() => {}),
    });
    useTreeStore.getState().setAccount(ME.id);
    await useTreeStore.getState().load(STORE_CLAN_ID);
    const newcomer = fixturePerson(GRANDPA, 'Nguyễn Văn Tư');
    useTreeStore.getState().apply({ type: 'addPerson', payload: newcomer });

    vi.mocked(shrinkPhoto).mockResolvedValue(new Blob([new Uint8Array(1000)]));
    const user = userEvent.setup();
    const { input, unmount } = renderControl(newcomer, vi.fn(), STORE_CLAN_ID);
    await user.upload(input(), jpg());
    await waitFor(() => expect(shrinkPhoto).toHaveBeenCalled());
    unmount();
    // Saving the person later must not start the upload of a control that is gone.
    useTreeStore.setState({ confirmedTree: useTreeStore.getState().tree });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestPhotoUpload).not.toHaveBeenCalled();
  });
});
