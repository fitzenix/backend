import request from 'supertest';
import { createApp } from '../src/app';
import { MockGateway } from '../src/services/payments/MockGateway';
import { setupTestDB, teardownTestDB, clearTestDB } from './helpers/db';

const app = createApp();
const api = '/api/v1';

beforeAll(async () => setupTestDB());
afterAll(async () => teardownTestDB());
afterEach(async () => clearTestDB());

async function registerOwner(email = 'owner@a.com', gymName = 'Gym A') {
  const res = await request(app)
    .post(`${api}/auth/register`)
    .send({ name: 'Owner', email, password: 'Secret@123', gymName });
  return res.body.data as { user: unknown; gym: unknown; accessToken: string; refreshToken: string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Memberships + Payments', () => {
  test('full flow: create member, plan, checkout, verify -> active subscription + invoice', async () => {
    const owner = await registerOwner();

    const member = await request(app)
      .post(`${api}/users`)
      .set(auth(owner.accessToken))
      .send({ name: 'Member One', email: 'm1@a.com', password: 'Member@123', role: 'member' });
    expect(member.status).toBe(201);

    const plan = await request(app)
      .post(`${api}/memberships/plans`)
      .set(auth(owner.accessToken))
      .send({ name: 'Monthly', durationDays: 30, pricePaise: 150000 });
    expect(plan.status).toBe(201);

    const checkout = await request(app)
      .post(`${api}/payments/checkout`)
      .set(auth(owner.accessToken))
      .send({ planId: plan.body.data._id, memberId: member.body.data._id });
    expect(checkout.status).toBe(201);
    const orderId = checkout.body.data.order.id;
    expect(orderId).toMatch(/^order_mock_/);

    const paymentId = 'pay_test_123';
    const signature = MockGateway.sign(`${orderId}|${paymentId}`);
    const verify = await request(app)
      .post(`${api}/payments/verify`)
      .set(auth(owner.accessToken))
      .send({ orderId, paymentId, signature });
    expect(verify.status).toBe(200);
    expect(verify.body.data.status).toBe('paid');

    const subs = await request(app).get(`${api}/memberships/subscriptions`).set(auth(owner.accessToken));
    expect(subs.body.data[0].status).toBe('active');

    const invoices = await request(app).get(`${api}/payments/invoices`).set(auth(owner.accessToken));
    expect(invoices.body.data.length).toBe(1);
    expect(invoices.body.data[0].totalPaise).toBe(150000);
  });

  test('rejects a payment with an invalid signature', async () => {
    const owner = await registerOwner();
    const member = await request(app)
      .post(`${api}/users`)
      .set(auth(owner.accessToken))
      .send({ name: 'Mem Two', email: 'm@a.com', password: 'Member@123', role: 'member' });
    const plan = await request(app)
      .post(`${api}/memberships/plans`)
      .set(auth(owner.accessToken))
      .send({ name: 'Monthly', durationDays: 30, pricePaise: 150000 });
    const checkout = await request(app)
      .post(`${api}/payments/checkout`)
      .set(auth(owner.accessToken))
      .send({ planId: plan.body.data._id, memberId: member.body.data._id });

    const verify = await request(app)
      .post(`${api}/payments/verify`)
      .set(auth(owner.accessToken))
      .send({ orderId: checkout.body.data.order.id, paymentId: 'pay_wrong_1', signature: 'deadbeefdeadbeef' });
    expect(verify.status).toBe(400);
  });

  test('enforces tenant isolation between gyms', async () => {
    const a = await registerOwner('a@a.com', 'Gym A');
    const b = await registerOwner('b@b.com', 'Gym B');

    await request(app)
      .post(`${api}/users`)
      .set(auth(a.accessToken))
      .send({ name: 'A member', email: 'am@a.com', password: 'Member@123', role: 'member' });

    const list = await request(app).get(`${api}/users`).set(auth(b.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.every((u: { email: string }) => u.email !== 'am@a.com')).toBe(true);
  });

  test('members cannot create plans', async () => {
    const owner = await registerOwner();
    const member = await request(app)
      .post(`${api}/users`)
      .set(auth(owner.accessToken))
      .send({ name: 'Mem Three', email: 'm@a.com', password: 'Member@123', role: 'member' });
    expect(member.status).toBe(201);

    const login = await request(app).post(`${api}/auth/login`).send({ email: 'm@a.com', password: 'Member@123' });
    const memberToken = login.body.data.accessToken;

    const res = await request(app)
      .post(`${api}/memberships/plans`)
      .set(auth(memberToken))
      .send({ name: 'Hax', durationDays: 30, pricePaise: 1 });
    expect(res.status).toBe(403);
  });
});
