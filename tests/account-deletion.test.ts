import mongoose from 'mongoose';
import express from 'express';
import supertest from 'supertest';
import { setupTestDB, teardownTestDB, clearTestDB } from './helpers/db';
import { ROLES, SUBSCRIPTION_STATUS, USER_STATUS, ATTENDANCE_STATUS, PAYMENT_STATUS } from '../src/config/constants';
import { AccountDeletionRequest } from '../src/modules/accountDeletion/accountDeletion.model';
import { accountDeletionService } from '../src/modules/accountDeletion/accountDeletion.service';
import { Gym } from '../src/modules/gyms/gym.model';
import { User } from '../src/modules/users/user.model';
import { mailService } from '../src/services/mail/mail.service';
import { Attendance } from '../src/modules/attendance/attendance.model';
import { Subscription } from '../src/modules/memberships/subscription.model';
import { Payment } from '../src/modules/payments/payment.model';
import { Invoice } from '../src/modules/payments/invoice.model';
import { RefreshToken } from '../src/modules/auth/refreshToken.model';
import { ProgressLog } from '../src/modules/fitness/progressLog.model';
import { WorkoutPlan } from '../src/modules/fitness/workoutPlan.model';
import { DietPlan } from '../src/modules/fitness/dietPlan.model';
import { WorkoutTemplate } from '../src/modules/fitness/workoutTemplate.model';
import { storageService } from '../src/services/storage.service';
import accountDeletionRoutes from '../src/modules/accountDeletion/accountDeletion.routes';
import { errorHandler } from '../src/middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/v1/account/deletion', accountDeletionRoutes);
app.use(errorHandler);

beforeAll(async () => {
  await setupTestDB();
});

afterAll(async () => {
  await teardownTestDB();
});

afterEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();
});

async function createGym(ownerEmail = 'owner@example.test') {
  const owner = await User.create({
    name: 'Gym Owner',
    email: ownerEmail,
    passwordHash: 'already-hashed',
    role: ROLES.GYM_OWNER,
    status: USER_STATUS.ACTIVE,
  });
  const gym = await Gym.create({
    name: 'Northside Fitness',
    slug: `northside-${new mongoose.Types.ObjectId()}`,
    owner: owner._id,
  });
  owner.gym = gym._id;
  await owner.save();
  return { owner, gym };
}

async function createUser(input: {
  email: string;
  role: 'trainer' | 'staff' | 'member';
  gymId: mongoose.Types.ObjectId;
  assignedTrainer?: mongoose.Types.ObjectId;
}) {
  return User.create({
    name: 'Test User',
    email: input.email,
    passwordHash: 'already-hashed',
    role: input.role,
    gym: input.gymId,
    status: USER_STATUS.ACTIVE,
    ...(input.role === 'member' && input.assignedTrainer
      ? { memberProfile: { assignedTrainer: input.assignedTrainer } }
      : {}),
  });
}

function getCode(sendSpy: jest.SpyInstance, callIndex = 0): string {
  const text = sendSpy.mock.calls[callIndex]?.[1]?.text as string | undefined;
  const code = text?.match(/code is (\d{6})/)?.[1];
  if (!code) throw new Error('Verification email did not contain a six-digit code');
  return code;
}

describe('account deletion workflow', () => {
  test('public request endpoint validates input and returns a generic request response', async () => {
    const invalid = await supertest(app)
      .post('/api/v1/account/deletion/request')
      .send({ identity: 'bad', role: 'member' });
    expect(invalid.status).toBe(422);

    const accepted = await supertest(app)
      .post('/api/v1/account/deletion/request')
      .send({ identity: 'unknown@example.test', role: 'member' });
    expect(accepted.status).toBe(202);
    expect(accepted.body.message).toMatch(/If the account details match/);
    expect(accepted.body.data).toEqual({
      requestId: expect.any(String),
      trackingToken: expect.any(String),
      status: 'pending_verification',
    });
  });

  test('removes member data, cancels membership, preserves financial records, and revokes sessions', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const { gym } = await createGym();
    const member = await createUser({ email: 'member@example.test', role: 'member', gymId: gym._id });
    member.avatar = { key: 'avatars/member.png', url: '/uploads/avatars/member.png' };
    await member.save();
    const deleteMediaSpy = jest.spyOn(storageService, 'deleteStrict').mockResolvedValue();
    const subscription = await Subscription.create({
      gym: gym._id,
      member: member._id,
      plan: new mongoose.Types.ObjectId(),
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: SUBSCRIPTION_STATUS.ACTIVE,
      autoRenew: true,
    });
    const payment = await Payment.create({
      gym: gym._id,
      member: member._id,
      subscription: subscription._id,
      amountPaise: 10000,
      status: PAYMENT_STATUS.PAID,
      notes: { email: member.email },
      raw: { customerEmail: member.email },
    });
    await Invoice.create({
      gym: gym._id,
      member: member._id,
      payment: payment._id,
      number: 'INV-DELETE-001',
      subtotalPaise: 10000,
      totalPaise: 10000,
      createdBy: member._id,
      note: 'Personal note',
    });
    await Attendance.create({
      gym: gym._id,
      member: member._id,
      checkInAt: new Date(),
      status: ATTENDANCE_STATUS.CHECKED_IN,
    });
    await ProgressLog.create({
      gym: gym._id,
      member: member._id,
      date: new Date(),
      notes: 'Private fitness note',
      photo: { key: 'progress/member.png', url: '/uploads/progress/member.png' },
    });
    await WorkoutPlan.create({ gym: gym._id, member: member._id, title: 'Personal plan' });
    await DietPlan.create({ gym: gym._id, member: member._id, title: 'Personal diet plan' });
    await RefreshToken.create({
      user: member._id,
      tokenHash: 'refresh-token-hash',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const request = await accountDeletionService.request({
      identity: member.email,
      role: 'member',
    });
    expect(request.status).toBe('pending_verification');
    const verified = await accountDeletionService.verify({
      requestId: request.requestId,
      code: getCode(sendSpy),
    });

    expect(verified.status).toBe('completed');
    const deletedMember = await User.findById(member._id);
    expect(deletedMember?.deletedAt).toBeInstanceOf(Date);
    expect(deletedMember?.status).toBe(USER_STATUS.INACTIVE);
    expect(deletedMember?.email).not.toBe(member.email);
    expect(deletedMember?.gym).toBeNull();
    expect(await Attendance.countDocuments({ member: member._id })).toBe(0);
    expect(await ProgressLog.countDocuments({ member: member._id })).toBe(0);
    expect(await WorkoutPlan.countDocuments({ member: member._id })).toBe(0);
    expect(await DietPlan.countDocuments({ member: member._id })).toBe(0);
    expect(deleteMediaSpy).toHaveBeenCalledWith('avatars/member.png', '/uploads/avatars/member.png');
    expect(deleteMediaSpy).toHaveBeenCalledWith('progress/member.png', '/uploads/progress/member.png');

    const cancelledSubscription = await Subscription.findById(subscription._id);
    expect(cancelledSubscription?.status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
    expect(cancelledSubscription?.autoRenew).toBe(false);
    const retainedPayment = await Payment.findById(payment._id).lean();
    expect(retainedPayment?.member.toString()).toBe(member._id.toString());
    expect(retainedPayment?.notes).toEqual({});
    expect(retainedPayment?.raw).toEqual({});
    const retainedInvoice = await Invoice.findOne({ number: 'INV-DELETE-001' });
    expect(retainedInvoice?.createdBy).toBeNull();
    expect(retainedInvoice?.note).toBeUndefined();
    expect(await RefreshToken.countDocuments({ user: member._id })).toBe(0);
    expect((await AccountDeletionRequest.findById(request.requestId))?.status).toBe('completed');
  });

  test('consumes verification codes once and increments failed attempts atomically', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const processSpy = jest.spyOn(accountDeletionService, 'process').mockResolvedValue();
    const { gym } = await createGym();
    const member = await createUser({ email: 'member@example.test', role: 'member', gymId: gym._id });
    const request = await accountDeletionService.request({ identity: member.email, role: 'member' });
    const code = getCode(sendSpy);
    const invalidCode = code === '000000' ? '000001' : '000000';

    await expect(
      accountDeletionService.verify({ requestId: request.requestId, code: invalidCode }),
    ).rejects.toThrow('The verification code is invalid or expired.');
    const verified = await accountDeletionService.verify({ requestId: request.requestId, code });
    expect(verified.status).toBe('processing');
    expect(processSpy).toHaveBeenCalledTimes(1);
    await expect(
      accountDeletionService.verify({ requestId: request.requestId, code }),
    ).rejects.toThrow('The verification code is invalid or expired.');
  });

  test('locks a pending request after the maximum number of invalid codes', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const { gym } = await createGym();
    const member = await createUser({ email: 'member@example.test', role: 'member', gymId: gym._id });
    const request = await accountDeletionService.request({ identity: member.email, role: 'member' });
    const validCode = getCode(sendSpy);
    const invalidCode = validCode === '000000' ? '000001' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        accountDeletionService.verify({ requestId: request.requestId, code: invalidCode }),
      ).rejects.toThrow('The verification code is invalid or expired.');
    }

    const saved = await AccountDeletionRequest.findById(request.requestId);
    expect(saved?.status).toBe('failed');
    expect(saved?.isOpen).toBe(false);
    await expect(
      accountDeletionService.verify({ requestId: request.requestId, code: validCode }),
    ).rejects.toThrow('The verification code is invalid or expired.');
  });

  test('reuses one open request instead of creating duplicates', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const { gym } = await createGym();
    const member = await createUser({ email: 'member@example.test', role: 'member', gymId: gym._id });
    const first = await accountDeletionService.request({ identity: member.email, role: 'member' });
    const second = await accountDeletionService.request({ identity: member.email, role: 'member' });

    expect(second.requestId).toBe(first.requestId);
    expect(await AccountDeletionRequest.countDocuments({ user: member._id, isOpen: true })).toBe(1);
    await expect(
      accountDeletionService.verify({ requestId: second.requestId, code: getCode(sendSpy, 1) }),
    ).resolves.toMatchObject({ status: 'completed' });
  });

  test('expires stale codes and returns the same generic response for unknown identities', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const { gym } = await createGym();
    const member = await createUser({ email: 'member@example.test', role: 'member', gymId: gym._id });
    const request = await accountDeletionService.request({ identity: member.email, role: 'member' });
    const saved = await AccountDeletionRequest.findById(request.requestId);
    saved!.expiresAt = new Date(Date.now() - 1000);
    await saved!.save();

    await expect(
      accountDeletionService.verify({ requestId: request.requestId, code: getCode(sendSpy) }),
    ).rejects.toThrow('The verification code is invalid or expired.');
    expect((await AccountDeletionRequest.findById(request.requestId))?.status).toBe('failed');

    const before = sendSpy.mock.calls.length;
    const decoy = await accountDeletionService.request({
      identity: 'unknown@example.test',
      role: 'member',
    });
    expect(decoy.status).toBe('pending_verification');
    expect(sendSpy).toHaveBeenCalledTimes(before);
    await expect(
      accountDeletionService.verify({ requestId: decoy.requestId, code: '123456' }),
    ).rejects.toThrow('The verification code is invalid or expired.');
  });

  test('does not match an account against another gym name', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const { gym } = await createGym();
    const trainer = await createUser({ email: 'trainer@example.test', role: 'trainer', gymId: gym._id });
    const request = await accountDeletionService.request({
      identity: trainer.email,
      role: 'trainer_staff',
      gymName: 'Different Gym',
    });

    expect(request.status).toBe('pending_verification');
    expect(sendSpy).not.toHaveBeenCalled();
    expect(await AccountDeletionRequest.findById(request.requestId)).toMatchObject({ user: null, isOpen: false });
  });

  test('deletes trainer personal data while preserving gym attendance and clearing trainer attribution', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const { gym } = await createGym();
    const trainer = await createUser({ email: 'trainer@example.test', role: 'trainer', gymId: gym._id });
    const member = await createUser({
      email: 'member@example.test',
      role: 'member',
      gymId: gym._id,
      assignedTrainer: trainer._id,
    });
    const attendance = await Attendance.create({
      gym: gym._id,
      member: member._id,
      recordedBy: trainer._id,
      checkInAt: new Date(),
      status: ATTENDANCE_STATUS.CHECKED_IN,
    });
    const workout = await WorkoutPlan.create({
      gym: gym._id,
      member: member._id,
      trainer: trainer._id,
      title: 'Gym workout',
    });
    const template = await WorkoutTemplate.create({
      gym: gym._id,
      trainer: trainer._id,
      title: 'Gym template',
    });

    const request = await accountDeletionService.request({
      identity: trainer.email,
      role: 'trainer_staff',
    });
    const result = await accountDeletionService.verify({
      requestId: request.requestId,
      code: getCode(sendSpy),
    });

    expect(result.status).toBe('completed');
    expect((await User.findById(member._id))?.memberProfile?.assignedTrainer).toBeNull();
    expect((await Attendance.findById(attendance._id))?.recordedBy).toBeNull();
    expect((await WorkoutPlan.findById(workout._id))?.trainer).toBeNull();
    expect((await WorkoutTemplate.findById(template._id))?.trainer).toBeNull();
    expect((await User.findById(trainer._id))?.deletedAt).toBeInstanceOf(Date);
  });

  test('requires support review and ownership transfer before deleting a gym owner', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const { owner, gym } = await createGym();
    const successor = await createUser({ email: 'successor@example.test', role: 'staff', gymId: gym._id });
    const request = await accountDeletionService.request({
      identity: owner.email,
      role: 'gym_owner',
      gymName: gym.name,
    });
    const pending = await accountDeletionService.verify({
      requestId: request.requestId,
      code: getCode(sendSpy),
    });
    expect(pending.status).toBe('awaiting_support_review');
    expect((await Gym.findById(gym._id))?.owner.toString()).toBe(owner._id.toString());
    const foreign = await createGym('other-owner@example.test');
    const foreignStaff = await createUser({
      email: 'foreign-staff@example.test',
      role: 'staff',
      gymId: foreign.gym._id,
    });
    await expect(
      accountDeletionService.resolveOwnerRequest(
        request.requestId,
        { resolution: 'transferred', newOwnerId: foreignStaff._id.toString() },
        new mongoose.Types.ObjectId(),
      ),
    ).rejects.toThrow('The replacement owner must be an active trainer or staff member in this gym.');
    expect((await Gym.findById(gym._id))?.owner.toString()).toBe(owner._id.toString());

    const resolved = await accountDeletionService.resolveOwnerRequest(request.requestId, {
      resolution: 'transferred',
      newOwnerId: successor._id.toString(),
    }, new mongoose.Types.ObjectId());
    expect(resolved.status).toBe('completed');
    const updatedGym = await Gym.findById(gym._id);
    expect(updatedGym?.owner.toString()).toBe(successor._id.toString());
    expect(updatedGym?.status).toBe(gym.status);
    expect((await User.findById(successor._id))?.role).toBe(ROLES.GYM_OWNER);
    expect((await User.findById(owner._id))?.deletedAt).toBeInstanceOf(Date);
  });

  test('supports gym closure without deleting other gym users or business data', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const { owner, gym } = await createGym();
    const member = await createUser({ email: 'member@example.test', role: 'member', gymId: gym._id });
    const request = await accountDeletionService.request({
      identity: owner.email,
      role: 'gym_owner',
      gymName: gym.name,
    });
    await accountDeletionService.verify({
      requestId: request.requestId,
      code: getCode(sendSpy),
    });

    const result = await accountDeletionService.resolveOwnerRequest(
      request.requestId,
      { resolution: 'closed' },
      new mongoose.Types.ObjectId(),
    );

    expect(result.status).toBe('completed');
    expect((await Gym.findById(gym._id))?.status).toBe('suspended');
    expect((await User.findById(owner._id))?.deletedAt).toBeInstanceOf(Date);
    expect((await User.findById(member._id))?.deletedAt).toBeNull();

    await AccountDeletionRequest.updateOne(
      { _id: request.requestId },
      { $set: { status: 'processing', isOpen: true, user: owner._id, gym: gym._id }, $unset: { processingAt: 1 } },
    );
    await accountDeletionService.process(request.requestId);
    expect((await AccountDeletionRequest.findById(request.requestId))?.status).toBe('completed');
  });

  test('does not disclose account existence or accept a status token from another request', async () => {
    const sendSpy = jest.spyOn(mailService, 'send').mockResolvedValue();
    const { gym } = await createGym();
    const member = await createUser({ email: 'member@example.test', role: 'member', gymId: gym._id });
    const valid = await accountDeletionService.request({ identity: member.email, role: 'member' });
    const unknown = await accountDeletionService.request({
      identity: 'not-registered@example.test',
      role: 'member',
    });

    expect(valid.status).toBe(unknown.status);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    await expect(
      accountDeletionService.status({ requestId: valid.requestId, trackingToken: unknown.trackingToken }),
    ).rejects.toThrow('Deletion request not found');
  });
});
