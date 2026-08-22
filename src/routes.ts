import { Router, type Request, type Response } from 'express';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import gymRoutes from './modules/gyms/gym.routes';
import membershipRoutes from './modules/memberships/membership.routes';
import trainerRoutes from './modules/trainers/trainer.routes';
import fitnessRoutes from './modules/fitness/fitness.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import paymentRoutes from './modules/payments/payment.routes';
import feedRoutes from './modules/feed/feed.routes';
import chatRoutes from './modules/chat/chat.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import reportRoutes from './modules/reports/reports.routes';
import financeRoutes from './modules/finance/finance.routes';
import enquiryRoutes from './modules/enquiries/enquiry.routes';
import importRoutes from './modules/imports/import.routes';
import billingRoutes from './modules/billing/billing.routes';

const router = Router();

router.get('/', (_req: Request, res: Response) =>
  res.json({ success: true, message: 'Fitzenix API v1', data: { docs: '/api/docs' } }),
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/gyms', gymRoutes);
router.use('/memberships', membershipRoutes);
router.use('/trainers', trainerRoutes);
router.use('/fitness', fitnessRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/payments', paymentRoutes);
router.use('/feed', feedRoutes);
router.use('/chat', chatRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);
router.use('/finance', financeRoutes);
router.use('/enquiries', enquiryRoutes);
router.use('/imports', importRoutes);
router.use('/billing', billingRoutes);

export default router;
