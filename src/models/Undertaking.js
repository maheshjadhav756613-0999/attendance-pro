import mongoose from 'mongoose';

const undertakingSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    studentName: String,
    studentRollNumber: String,
    prnNumber: String,

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    className: String,
    divisionName: String,

    academicYear: String,

    attendanceAtTime: {
      type: Number,
      required: true,
    },
    requiredAttendance: {
      type: Number,
      default: 75,
    },

    reason: {
      type: String,
      default: 'Low attendance — requires improvement',
    },

    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    issuedByName: String,
    issuedDate: {
      type: Date,
      default: Date.now,
    },

    dueDate: Date,

    studentSigned: {
      type: Boolean,
      default: false,
    },
    studentSignedAt: Date,

    parentSigned: {
      type: Boolean,
      default: false,
    },
    parentSignedAt: Date,

    teacherSigned: {
      type: Boolean,
      default: false,
    },
    teacherSignedAt: Date,

    signedCopyUrl: String,

    status: {
      type: String,
      enum: ['pending', 'partially-signed', 'completed', 'expired'],
      default: 'pending',
    },

    notes: String,
  },
  { timestamps: true }
);

undertakingSchema.index({ studentId: 1, createdAt: -1 });

const Undertaking = mongoose.model('Undertaking', undertakingSchema);

export default Undertaking;