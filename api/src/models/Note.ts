import mongoose, { Document, Schema } from 'mongoose';

export interface INote extends Document {
  customerId: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new Schema<INote>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

noteSchema.index({ customerId: 1 });

export const Note = mongoose.model<INote>('Note', noteSchema);
