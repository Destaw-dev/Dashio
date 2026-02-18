import { ApiError, apiFetch, authApi } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : status === 503 ? 'Service Unavailable' : 'OK',
    json: async () => body,
  } as Response;
}

describe('apiFetch', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, 'fetch', {
      value: jest.fn(),
      writable: true,
      configurable: true,
    });
  });

  it('retries original request after successful refresh on 401', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token' }, 401))
      .mockResolvedValueOnce(jsonResponse({ user: { id: '1' } }, 200))
      .mockResolvedValueOnce(jsonResponse({ items: [] }, 200));

    const data = await apiFetch<{ items: unknown[] }>('/customers');

    expect(data).toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/auth/refresh');
  });

  it('does not call refresh for login endpoint', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid email or password' }, 401));

    await expect(authApi.login({ email: 'a@b.com', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError with status and message', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Database unavailable.' }, 503));

    let thrown: unknown;
    try {
      await apiFetch('/customers');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ status: 503, message: 'Database unavailable.' });
  });
});
