import mongoose from 'mongoose';

export type DatabaseState = 'connected' | 'connecting' | 'disconnected';

/** Connects the shared Mongoose connection; fails fast when the cluster cannot be reached. */
export async function connectDatabase(
  uri: string,
  options: { dbName?: string } = {},
): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    ...(options.dbName ? { dbName: options.dbName } : {}),
  });
}

export function databaseState(): DatabaseState {
  // Mongoose ready states: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting.
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
