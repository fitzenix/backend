import mongoose, { type Connection } from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB. Accepts an optional URI override (used by tests with an
 * in-memory server).
 */
export async function connectDB(uri: string = env.mongoUri): Promise<Connection> {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      autoIndex: !env.isProd,
    });
    logger.info('MongoDB connected');
    return mongoose.connection;
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed');
    throw err;
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export default connectDB;
