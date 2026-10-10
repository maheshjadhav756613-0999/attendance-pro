import mongoose from 'mongoose';

const parentCommunicationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    studentName: String,
    studentRollNumber: String,

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    className: String,
    divisionName: String,

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teacherName: String,

    type: {
      type: String,
      enum: ['WhatsApp', 'Email', 'SMS', 'Call', 'PTM', 'Letter', 'Notice'],
      required: true,
    },

    subject: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      default: '',
    },

    reason: {
      type: String,
      default: 'Low attendance',
    },

    attendanceAtTime: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'responded', 'no-response'],
      default: 'sent',
    },

    parentResponse: {
      type: String,
      default: '',
    },
    respondedAt: Date,

    attachmentUrl: String,
    notes: String,
  },
  { timestamps: true }
);

parentCommunicationSchema.index({ studentId: 1, createdAt: -1 });
parentCommunicationSchema.index({ teacherId: 1, createdAt: -1 });

const ParentCommunication = mongoose.model(
  'ParentCommunication',
  parentCommunicationSchema
);

export default ParentCommunication;