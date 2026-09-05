import swaggerJsdoc, { type Options } from 'swagger-jsdoc';
import { env } from './env';

/**
 * OpenAPI document. Route-level annotations can be added via JSDoc @openapi
 * comments; the base document below documents the envelope, security and the
 * high-level tag structure so /api/docs is useful out of the box.
 */
const options: Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Fitzenix API',
      version: '2.0.0',
      description:
        'Multi-tenant gym-management SaaS API (TypeScript). Roles: super_admin, gym_owner, ' +
        'trainer, member. All money is in INR paise (integer). Consistent response envelope.',
    },
    servers: [{ url: env.apiPrefix, description: 'v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: {},
            meta: { type: 'object' },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                details: {},
              },
            },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Registration, login, tokens, OTP, password reset' },
      { name: 'Users', description: 'User & profile management' },
      { name: 'Gyms', description: 'Tenant gyms, branding, settings' },
      { name: 'Memberships', description: 'Plans & subscriptions' },
      { name: 'Trainers', description: 'Trainer/member assignment' },
      { name: 'Fitness', description: 'Workout plans, diet plans, progress' },
      { name: 'Attendance', description: 'Check-in / check-out' },
      { name: 'Payments', description: 'Razorpay checkout, verify, webhook, invoices' },
      { name: 'Feed', description: 'Gym posts, likes, comments' },
      { name: 'Chat', description: 'Trainer<->member messaging' },
      { name: 'Notifications', description: 'User notifications' },
      { name: 'Reports', description: 'Role-based dashboards & analytics' },
    ],
    paths: {
      '/auth/register': {
        post: {
          tags: ['Auth'],
          security: [],
          summary: 'Register a gym owner and create their gym',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email', 'password', 'gymName'],
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    phone: { type: 'string' },
                    gymName: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Created' } },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          security: [],
          summary: 'Login with email + password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
