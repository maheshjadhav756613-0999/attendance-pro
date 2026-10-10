import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Subject code is required'],
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['Theory', 'Practical', 'Tutorial'],
      default: 'Theory',
    },
    credits: {
      type: Number,
      default: 4,
      min: 0,
      max: 10,
    },
    semester: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

subjectSchema.index({ classId: 1, code: 1 }, { unique: true });

const Subject = mongoose.model('Subject', subjectSchema);

export default Subject;