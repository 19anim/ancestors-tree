import type { PhotoUploadResponse } from '@ancestors-tree/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { PhotoUploadError, requestPhotoUpload, uploadPhoto } from './photoUpload';

const TARGET: PhotoUploadResponse = {
  publicId: 'a/b',
  url: 'https://upload.example.test/image/upload',
  fields: { public_id: 'a/b', timestamp: '1700000000', signature: 'abc' },
};

/** Just enough XMLHttpRequest: records what is sent, and lets the test answer. */
class FakeXhr {
  static last: FakeXhr | undefined;
  method = '';
  url = '';
  body: unknown;
  status = 0;
  responseText = '';
  aborted = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  send(body: unknown): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
  }

  answer(status: number, body: unknown): void {
    this.status = status;
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.onload?.();
  }
}

function lastXhr(): FakeXhr {
  if (FakeXhr.last === undefined) throw new Error('No XMLHttpRequest was made');
  return FakeXhr.last;
}

const photoBlob = () => new Blob(['x'], { type: 'image/webp' });

beforeEach(() => {
  FakeXhr.last = undefined;
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestPhotoUpload', () => {
  it('asks the API to sign one upload for the person', async () => {
    const api = mockApi({ 'POST /clans/c1/people/p1/photo-upload': () => ({ body: TARGET }) });
    await expect(requestPhotoUpload('c1', 'p1')).resolves.toEqual(TARGET);
    expect(api.calls).toEqual([
      { method: 'POST', path: '/clans/c1/people/p1/photo-upload', body: undefined },
    ]);
  });
});

describe('uploadPhoto', () => {
  it('posts every signed field and the file to the upload url', () => {
    const file = photoBlob();
    void uploadPhoto(TARGET, file, () => {});
    const xhr = lastXhr();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe(TARGET.url);
    expect(xhr.body).toBeInstanceOf(FormData);
    const form = xhr.body as FormData;
    expect(form.get('public_id')).toBe('a/b');
    expect(form.get('timestamp')).toBe('1700000000');
    expect(form.get('signature')).toBe('abc');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('reports progress as a fraction', () => {
    const onProgress = vi.fn();
    void uploadPhoto(TARGET, photoBlob(), onProgress);
    lastXhr().upload.onprogress?.({
      lengthComputable: true,
      loaded: 50,
      total: 200,
    } as ProgressEvent);
    expect(onProgress).toHaveBeenCalledWith(0.25);
  });

  it('resolves to the photo the image host stored', async () => {
    const upload = uploadPhoto(TARGET, photoBlob(), () => {});
    lastXhr().answer(200, { public_id: 'a/b', version: 5, secure_url: 'https://x.test/a/b' });
    await expect(upload).resolves.toEqual({ publicId: 'a/b', version: 5 });
  });

  it('rejects when the image host refuses, or answers without a photo id', async () => {
    const refused = uploadPhoto(TARGET, photoBlob(), () => {});
    lastXhr().answer(400, { error: { message: 'Invalid signature' } });
    await expect(refused).rejects.toBeInstanceOf(PhotoUploadError);

    const odd = uploadPhoto(TARGET, photoBlob(), () => {});
    lastXhr().answer(200, { version: 5 });
    await expect(odd).rejects.toBeInstanceOf(PhotoUploadError);
  });

  it('rejects when the upload does not reach the image host', async () => {
    const upload = uploadPhoto(TARGET, photoBlob(), () => {});
    lastXhr().onerror?.();
    await expect(upload).rejects.toBeInstanceOf(PhotoUploadError);
  });

  it('aborts the request when the signal fires', async () => {
    const controller = new AbortController();
    const upload = uploadPhoto(TARGET, photoBlob(), () => {}, controller.signal);
    controller.abort();
    expect(lastXhr().aborted).toBe(true);
    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    await expect(upload).rejects.toBeInstanceOf(DOMException);
  });
});
