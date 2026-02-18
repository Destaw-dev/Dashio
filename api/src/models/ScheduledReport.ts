import mongoose, { Document, Schema } from 'mongoose';

export type ReportFrequency = 'weekly' | 'monthly';

export interface IScheduledReport extends Document {
  name: string;
  frequency: ReportFrequency;
  emails: string[];
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const scheduledReportSchema = new Schema<IScheduledReport>(
  {
    name: { type: String, required: true, trim: true },
    frequency: { type: String, enum: ['weekly', 'monthly'], required: true },
    emails: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
    lastRunAt: { type: Date },
    nextRunAt: { type: Date, required: true },
  },
  { timestamps: true }
);

scheduledReportSchema.index({ enabled: 1, nextRunAt: 1 });

export const ScheduledReport = mongoose.model<IScheduledReport>('ScheduledReport', scheduledReportSchema);
