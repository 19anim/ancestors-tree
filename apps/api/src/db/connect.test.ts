import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../test/database.ts';
import { databaseState } from './connect.ts';

useTestDatabase();

describe('database connection', () => {
  it('reports a live connection', () => {
    expect(databaseState()).toBe('connected');
  });

  it('runs transactions (replica set)', async () => {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await mongoose.connection.collection('probe').insertOne({ ok: true }, { session });
    });
    await session.endSession();
    expect(await mongoose.connection.collection('probe').countDocuments()).toBe(1);
  });
});
