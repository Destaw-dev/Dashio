import mongoose, { Document, Schema } from 'mongoose';

export interface ISavedViewConfig {
  q?: string;
  status?: 'active' | 'churned';
  sortBy?: 'name' | 'createdAt';
  order?: 'asc' | 'desc';
  segmentId?: string;
}

export interface ISavedView extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  type: 'customers';
  config: ISavedViewConfig;
  createdAt: Date;
  updatedAt: Date;
}

const savedViewSchema = new Schema<ISavedView>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['customers'], default: 'customers', required: true },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

savedViewSchema.index({ userId: 1, type: 1, createdAt: -1 });

export const SavedView = mongoose.model<ISavedView>('SavedView', savedViewSchema);
