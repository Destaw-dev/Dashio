import mongoose, { Document, Schema } from 'mongoose';

export type EventType = 'signup' | 'purchase' | 'login' | 'activity' | 'churn';

export interface IEvent extends Document {
  customerId: mongoose.Types.ObjectId;
  type: EventType;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const eventSchema = new Schema<IEvent>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    type: { type: String, enum: ['signup', 'purchase', 'login', 'activity', 'churn'], required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

eventSchema.index({ customerId: 1, timestamp: -1 });
eventSchema.index({ type: 1, timestamp: 1 });

export const Event = mongoose.model<IEvent>('Event', eventSchema);
