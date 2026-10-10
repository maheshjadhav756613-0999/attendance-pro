import mongoose from 'mongoose';

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title आवश्यक आहे'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Content आवश्यक आहे'],
    },
    category: {
      type: String,
      enum: ['General', 'Exam', 'Holiday', 'Event', 'Urgent', 'Academic'],
      default: 'General',
    },
    priority: {
      type: String,
      enum: ['Low', 'Normal', 'High', 'Urgent'],
      default: 'Normal',
    },
    targetAudience: {
      type: [String],
      enum: ['admin', 'teacher', 'student', 'parent'],
      default: ['teacher', 'student', 'parent'],
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      default: null,
    },
    attachmentUrl: String,
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Notice', noticeSchema);