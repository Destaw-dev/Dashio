import request from 'supertest';
import { app } from '../index';

describe('POST /auth/register', () => {
  it('returns 400 when body is invalid (missing email)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /auth/login', () => {
  it('returns 400 when body is invalid', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('PATCH /auth/password', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .patch('/auth/password')
      .send({ currentPassword: 'old', newPassword: 'newpassword123' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});
