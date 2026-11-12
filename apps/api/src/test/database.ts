import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../db/connect.ts';

/** Gives the calling test file its own empty database on the shared in-memory replica set. */
export function useTestDatabase(): void {
  beforeAll(async () => {
    await connectDatabase(inject('mongoUri'), { dbName: `test-${randomUUID()}` });
    // Build unique indexes before any test relies on them.
    await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
  });

  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });
}
