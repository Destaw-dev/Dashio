import mongoose, { Document, Schema } from 'mongoose';

export type AlertRuleType = 'churn_spike' | 'activity_drop';

export interface IAlertRule extends Document {
  name: string;
  type: AlertRuleType;
  thresholdPct: number;
  windowDays: number;
  enabled: boolean;
  lastTriggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const alertRuleSchema = new Schema<IAlertRule>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['churn_spike', 'activity_drop'], required: true },
    thresholdPct: { type: Number, required: true, min: 1, max: 1000 },
    windowDays: { type: Number, required: true, min: 1, max: 90, default: 7 },
    enabled: { type: Boolean, default: true },
    lastTriggeredAt: { type: Date },
  },
  { timestamps: true }
);

alertRuleSchema.index({ enabled: 1, updatedAt: -1 });

export const AlertRule = mongoose.model<IAlertRule>('AlertRule', alertRuleSchema);
