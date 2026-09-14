import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('CORS', () => {
  test('allows the production frontend to preflight credentialed requests', async () => {
    const response = await request(app)
      .options('/api/v1/auth/register')
      .set('Origin', 'https://www.fitzenix.app')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization, X-Requested-With');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://www.fitzenix.app');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE,OPTIONS');
    expect(response.headers['access-control-allow-headers']).toBe(
      'Content-Type,Authorization,X-Requested-With',
    );
  });
});