import mongoose, { Document, Schema } from 'mongoose';
import type { AlertRuleType } from './AlertRule';

export interface IAlertEvent extends Document {
  ruleId: mongoose.Types.ObjectId;
  type: AlertRuleType;
  message: string;
  metrics: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const alertEventSchema = new Schema<IAlertEvent>(
  {
    ruleId: { type: Schema.Types.ObjectId, ref: 'AlertRule', required: true },
    type: { type: String, enum: ['churn_spike', 'activity_drop'], required: true },
    message: { type: String, required: true },
    metrics: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

alertEventSchema.index({ createdAt: -1 });
alertEventSchema.index({ ruleId: 1, createdAt: -1 });

export const AlertEvent = mongoose.model<IAlertEvent>('AlertEvent', alertEventSchema);
