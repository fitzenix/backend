import request from 'supertest';
import express from 'express';
import demoRequestRoutes from '../src/modules/demoRequests/demoRequest.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { DemoRequest } from '../src/modules/demoRequests/demoRequest.model';
import { setupTestDB, teardownTestDB, clearTestDB } from './helpers/db';

const app = express();
app.use(express.json());
app.use('/api/v1/demo-requests', demoRequestRoutes);
app.use(errorHandler);

beforeAll(async () => {
  await setupTestDB();
});
afterAll(async () => {
  await teardownTestDB();
});
afterEach(async () => {
  await clearTestDB();
});

describe('Public demo requests', () => {
  test('validates and stores a request without authentication', async () => {
    const response = await request(app).post('/api/v1/demo-requests').send({
      name: 'Asha Kumar',
      phone: '9876543210',
      email: 'asha@example.com',
      city: 'Chennai',
      gymName: 'Northside Fitness',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.received).toBe(true);
    await expect(DemoRequest.countDocuments()).resolves.toBe(1);
    const saved = await DemoRequest.findOne().lean();
    expect(saved?.email).toBe('asha@example.com');
    expect(saved?.status).toBe('new');
  });

  test('rejects incomplete form data', async () => {
    const response = await request(app).post('/api/v1/demo-requests').send({ email: 'bad' });

    expect(response.status).toBe(422);
    expect(await DemoRequest.countDocuments()).toBe(0);
  });

  test('rejects phone numbers that are not exactly 10 digits', async () => {
    const response = await request(app).post('/api/v1/demo-requests').send({
      name: 'Asha Kumar',
      phone: '987654321',
      email: 'asha@example.com',
      city: 'Chennai',
      gymName: 'Northside Fitness',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.details).toContainEqual({
      path: 'phone',
      message: 'Enter a valid 10-digit phone number',
    });
    expect(await DemoRequest.countDocuments()).toBe(0);
  });
});