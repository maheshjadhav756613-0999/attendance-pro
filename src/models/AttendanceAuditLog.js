import mongoose from 'mongoose';

const attendanceAuditLogSchema = new mongoose.Schema(
  {
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      default: null, // Create time ला null, update time ला actual
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    studentName: {
      type: String,
      default: '',
    },
    studentRollNumber: {
      type: String,
      default: '',
    },
    lectureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lecture',
      required: true,
    },
    lectureDate: Date,
    subjectName: String,
    className: String,
    divisionName: String,

    action: {
      type: String,
      enum: ['create', 'update', 'delete'],
      required: true,
    },
    oldStatus: {
      type: String,
      default: null,
    },
    newStatus: {
      type: String,
      default: null,
    },
    reason: {
      type: String,
      default: '',
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    editedByName: {
      type: String,
      default: '',
    },
    editedByRole: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// ✅ Immutable — कोणत्याही update/delete ला block
attendanceAuditLogSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('⛔ Audit logs cannot be modified'));
});

attendanceAuditLogSchema.pre('updateOne', function (next) {
  next(new Error('⛔ Audit logs cannot be modified'));
});

attendanceAuditLogSchema.pre('deleteOne', function (next) {
  next(new Error('⛔ Audit logs cannot be deleted'));
});

attendanceAuditLogSchema.pre('deleteMany', function (next) {
  next(new Error('⛔ Audit logs cannot be deleted'));
});

// Indexes for fast queries
attendanceAuditLogSchema.index({ createdAt: -1 });
attendanceAuditLogSchema.index({ editedBy: 1, createdAt: -1 });
attendanceAuditLogSchema.index({ studentId: 1, createdAt: -1 });
attendanceAuditLogSchema.index({ lectureId: 1 });

const AttendanceAuditLog = mongoose.model(
  'AttendanceAuditLog',
  attendanceAuditLogSchema
);

export default AttendanceAuditLog;