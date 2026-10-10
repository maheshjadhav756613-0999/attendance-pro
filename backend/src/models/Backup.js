import mongoose from 'mongoose';

const backupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    type: {
      type: String,
      enum: ['manual', 'auto'],
      default: 'manual',
    },
    status: {
      type: String,
      enum: ['completed', 'failed', 'in-progress'],
      default: 'completed',
    },
    collections: {
      type: Number,
      default: 0,
    },
    totalRecords: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdByName: String,
    notes: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

backupSchema.index({ createdAt: -1 });

const Backup = mongoose.model('Backup', backupSchema);

export default Backup;