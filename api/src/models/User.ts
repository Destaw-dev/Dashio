import mongoose, { Document, Schema } from 'mongoose';

export type Role = 'admin' | 'viewer';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name?: string;
  role: Role;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, trim: true },
    role: { type: String, enum: ['admin', 'viewer'], default: 'viewer' },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true }
);


export const User = mongoose.model<IUser>('User', userSchema);
