import request from 'supertest';
import { app } from './index';

describe('GET /health', () => {
  it('returns 200 and status OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'OK' });
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('db');
  });
});
