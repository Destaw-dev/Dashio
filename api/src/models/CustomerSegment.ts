import mongoose, { Document, Schema } from 'mongoose';

export interface ICustomerSegmentRules {
  status?: 'active' | 'churned';
  segmentEquals?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  inactivityDaysGte?: number;
}

export interface ICustomerSegment extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  rules: ICustomerSegmentRules;
  createdAt: Date;
  updatedAt: Date;
}

const customerSegmentSchema = new Schema<ICustomerSegment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    rules: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

customerSegmentSchema.index({ userId: 1, createdAt: -1 });

export const CustomerSegment = mongoose.model<ICustomerSegment>('CustomerSegment', customerSegmentSchema);
