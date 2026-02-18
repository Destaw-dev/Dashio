import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dashio';

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectDb(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.warn('MongoDB unavailable:', (err as Error).message);
    console.warn('API will start but auth and data routes will return 503. Start MongoDB or set MONGODB_URI.');
  }
}
