import mongoose, { Document, Schema } from 'mongoose';

export type CustomerStatus = 'active' | 'churned';

export interface ICustomer extends Document {
  name: string;
  email: string;
  status: CustomerStatus;
  segment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    status: { type: String, enum: ['active', 'churned'], default: 'active' },
    segment: { type: String, trim: true },
  },
  { timestamps: true }
);

customerSchema.index({ email: 1 });
customerSchema.index({ createdAt: 1 });
customerSchema.index({ status: 1 });

export const Customer = mongoose.model<ICustomer>('Customer', customerSchema);
