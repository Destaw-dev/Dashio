import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  userId?: mongoose.Types.ObjectId;
  action: string;
  meta?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

export async function logAudit(entry: {
  userId?: string;
  action: string;
  meta?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await AuditLog.create({
      userId: entry.userId ? new mongoose.Types.ObjectId(entry.userId) : undefined,
      action: entry.action,
      meta: entry.meta ?? {},
      before: entry.before,
      after: entry.after,
      ip: entry.ip,
      userAgent: entry.userAgent,
    });
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}
