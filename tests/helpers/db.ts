import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../src/config/db';

let mongod: MongoMemoryServer | undefined;

export async function setupTestDB(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
}

export async function teardownTestDB(): Promise<void> {
  await disconnectDB();
  if (mongod) await mongod.stop();
}

export async function clearTestDB(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
