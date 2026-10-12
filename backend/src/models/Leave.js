import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    divisionName: {
      type: String,
      required: true,
      uppercase: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },

    // Leave Details
    fromDate: {
      type: Date,
      required: true,
    },
    toDate: {
      type: Date,
      required: true,
    },
    totalDays: {
      type: Number,
      required: true,
    },
    leaveType: {
      type: String,
      enum: [
        'Sick Leave',
        'Family Function',
        'Emergency',
        'Personal',
        'Other',
      ],
      default: 'Personal',
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    attachment: {
      type: String,
      default: '',
    },

    // ✅ Applied By (Student / Parent)
    appliedBy: {
      type: String,
      enum: ['student', 'parent'],
      default: 'student',
    },
    appliedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Approval
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    teacherRemark: {
      type: String,
      trim: true,
      default: '',
    },

    // Notification tracking
    notificationReadByTeacher: {
      type: Boolean,
      default: false,
    },
    notificationReadByStudent: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

leaveSchema.index({ studentId: 1, status: 1 });
leaveSchema.index({ classId: 1, divisionName: 1, status: 1 });

const Leave = mongoose.model('Leave', leaveSchema);
export default Leave;