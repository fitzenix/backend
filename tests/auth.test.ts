import request from 'supertest';
import { createApp } from '../src/app';
import { setupTestDB, teardownTestDB, clearTestDB } from './helpers/db';

const app = createApp();

beforeAll(async () => {
  await setupTestDB();
});
afterAll(async () => {
  await teardownTestDB();
});
afterEach(async () => {
  await clearTestDB();
});

const registerPayload = {
  name: 'Test Owner',
  email: 'owner@test.com',
  password: 'Secret@123',
  gymName: 'Test Gym',
};

describe('Auth', () => {
  test('registers a gym owner and returns tokens + gym', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(registerPayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.role).toBe('gym_owner');
    expect(res.body.data.gym.name).toBe('Test Gym');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  test('rejects duplicate registration', async () => {
    await request(app).post('/api/v1/auth/register').send(registerPayload);
    const res = await request(app).post('/api/v1/auth/register').send(registerPayload);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  test('validates the request body', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'bad' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('logs in and fetches the current user', async () => {
    await request(app).post('/api/v1/auth/register').send(registerPayload);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken;

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(registerPayload.email);
  });

  test('rejects wrong password', async () => {
    await request(app).post('/api/v1/auth/register').send(registerPayload);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: registerPayload.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('rotates refresh tokens', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send(registerPayload);
    const { refreshToken } = reg.body.data;
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();

    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
  });

  test('blocks unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});
