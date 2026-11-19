import { createHash } from 'node:crypto';
import type * as cloudinaryModule from 'cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudinaryPhotoStore, parseCloudinaryUrl } from './cloudinary.ts';
import { PhotoHostError } from './store.ts';

// Only the network calls are faked; config and request signing stay real.
vi.mock('cloudinary', async (importOriginal) => {
  const actual = await importOriginal<typeof cloudinaryModule>();
  return {
    ...actual,
    v2: {
      config: actual.v2.config,
      utils: actual.v2.utils,
      api: { resource: vi.fn(), delete_resources_by_prefix: vi.fn() },
      uploader: { destroy: vi.fn() },
    },
  };
});

const resource = vi.mocked(cloudinary.api.resource);
const deleteByPrefix = vi.mocked(cloudinary.api.delete_resources_by_prefix);
const destroy = vi.mocked(cloudinary.uploader.destroy);

const KEY = 'key123';
const SECRET = 'secret456';
const CLOUD = 'demo-cloud';
const URL_FROM_PARTS = `cloudinary://${KEY}:${SECRET}@${CLOUD}`;

describe('parseCloudinaryUrl', () => {
  it('reads the key, secret and cloud name', () => {
    expect(parseCloudinaryUrl(URL_FROM_PARTS)).toEqual({
      cloudName: CLOUD,
      apiKey: KEY,
      apiSecret: SECRET,
    });
  });

  it('refuses anything else without echoing it', () => {
    expect(() => parseCloudinaryUrl(`https://${SECRET}@x`)).toThrow(/CLOUDINARY_URL/);
    expect(() => parseCloudinaryUrl(`https://${SECRET}@x`)).not.toThrow(new RegExp(SECRET));
  });
});

describe('createCloudinaryPhotoStore().signUpload', () => {
  it('signs every upload parameter with the API secret', () => {
    const store = createCloudinaryPhotoStore({
      url: URL_FROM_PARTS,
      folder: 'ancestors-tree/test',
    });
    const publicId = 'ancestors-tree/test/clans/c1/people/p1/0123456789abcdef';
    const { url, fields } = store.signUpload(publicId, 'c1');
    expect(url).toBe(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`);
    expect(fields.api_key).toBe(KEY);
    const { signature, api_key: _key, ...signed } = fields;
    const toSign = Object.keys(signed)
      .sort()
      .map((name) => `${name}=${signed[name]}`)
      .join('&');
    expect(signature).toBe(
      createHash('sha1')
        .update(toSign + SECRET)
        .digest('hex'),
    );
    expect(signed).toMatchObject({
      public_id: publicId,
      asset_folder: 'ancestors-tree/test/clans/c1/people/p1',
      allowed_formats: 'jpg,png,webp',
      tags: 'clan_c1',
      transformation: 'c_limit,w_1600,h_1600',
    });
    expect(Number(signed.timestamp)).toBeGreaterThan(1_700_000_000);
  });
});

/**
 * The rejections below copy cloudinary 2.11's own: the Admin API (lib/api_client/execute_request.js)
 * rejects with `{ request_options, query_params, error: { message, http_code } }` for the codes it
 * expects and with `{ message, http_code, request_options, query_params }` for any other; the
 * uploader rejects with `{ message, http_code }`; a request that never gets an answer rejects
 * with the socket's Error. request_options holds `auth: '<key>:<secret>'`.
 */
describe('createCloudinaryPhotoStore() against the Admin API', () => {
  const store = () =>
    createCloudinaryPhotoStore({ url: URL_FROM_PARTS, folder: 'ancestors-tree/test' });
  const ID = 'ancestors-tree/test/clans/c1/people/p1/0123456789abcdef';
  const requestOptions = { auth: `${KEY}:${SECRET}` };
  const expected = (http_code: number, message: string) => ({
    request_options: requestOptions,
    query_params: '',
    error: { message, http_code },
  });

  beforeEach(() => {
    resource.mockReset();
    deleteByPrefix.mockReset();
    destroy.mockReset();
  });

  async function failure(promise: Promise<unknown>): Promise<PhotoHostError> {
    const error: unknown = await promise.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(PhotoHostError);
    return error as PhotoHostError;
  }

  it('inspect reads bytes and version', async () => {
    resource.mockResolvedValue({ bytes: 1234, version: 7, format: 'webp' });
    await expect(store().inspect(ID)).resolves.toEqual({ bytes: 1234, version: 7 });
    expect(resource).toHaveBeenCalledWith(ID, { resource_type: 'image', type: 'upload' });
  });

  it('inspect answers null for a 404', async () => {
    resource.mockRejectedValue(expected(404, `Resource not found - ${ID}`));
    await expect(store().inspect(ID)).resolves.toBeNull();
  });

  it('inspect wraps any other answer in an Error that keeps the code but never the secret', async () => {
    resource.mockRejectedValue(expected(401, 'Invalid api_key'));
    const error = await failure(store().inspect(ID));
    expect(error.status).toBe(401);
    expect(error.stack).toBeDefined();
    expect(error.cause).toEqual({ message: 'Invalid api_key', http_code: 401 });
    expect(JSON.stringify({ ...error, cause: error.cause, message: error.message })).not.toContain(
      SECRET,
    );
  });

  it('inspect reads the code of an unexpected status, at the top level', async () => {
    resource.mockRejectedValue({
      message: 'Server returned unexpected status code - 503',
      http_code: 503,
      request_options: requestOptions,
      query_params: '',
    });
    const error = await failure(store().inspect(ID));
    expect(error.status).toBe(503);
    expect(JSON.stringify(error.cause)).not.toContain(SECRET);
  });

  it('inspect wraps a network error with no code', async () => {
    const socket = new Error('socket hang up');
    resource.mockRejectedValue(socket);
    const error = await failure(store().inspect(ID));
    expect(error.status).toBeUndefined();
    expect(error.cause).toBe(socket);
  });

  it('destroy invalidates the cached copies, and wraps a failure', async () => {
    destroy.mockResolvedValue({ result: 'ok' });
    await store().destroy(ID);
    expect(destroy).toHaveBeenCalledWith(ID, { resource_type: 'image', invalidate: true });
    destroy.mockRejectedValue({ message: 'Server error', http_code: 500 });
    expect((await failure(store().destroy(ID))).status).toBe(500);
  });

  it('deletePrefix repeats while Cloudinary reports a partial delete, and wraps a failure', async () => {
    const prefix = 'ancestors-tree/test/clans/c1/';
    deleteByPrefix
      .mockResolvedValueOnce({ deleted: {}, partial: true })
      .mockResolvedValueOnce({ deleted: {}, partial: true })
      .mockResolvedValueOnce({ deleted: {} });
    await store().deletePrefix(prefix);
    expect(deleteByPrefix).toHaveBeenCalledTimes(3);
    expect(deleteByPrefix).toHaveBeenCalledWith(prefix, { resource_type: 'image', type: 'upload' });
    deleteByPrefix.mockRejectedValue(expected(420, 'Rate Limit Exceeded'));
    const error = await failure(store().deletePrefix(prefix));
    expect(error.status).toBe(420);
    expect(JSON.stringify(error.cause)).not.toContain(SECRET);
  });
});
