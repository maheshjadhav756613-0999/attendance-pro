import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema(
  {
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
    },
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

    // Submission Type
    submissionType: {
      type: String,
      enum: ['Online', 'Physical', 'Photo'],
      required: true,
    },

    // Online Files
    files: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number,
        _id: false,
      },
    ],

    // Physical submission note
    physicalNote: {
      type: String,
      trim: true,
      default: '',
    },

    // Photo (Proof of physical submission)
    photoUrl: {
      type: String,
      default: '',
    },

    // Student's note
    studentRemark: {
      type: String,
      trim: true,
      default: '',
    },

    // Submission timing
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    isLate: {
      type: Boolean,
      default: false,
    },

    // Teacher Approval
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    marks: {
      type: Number,
      default: null,
    },
    teacherRemark: {
      type: String,
      trim: true,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
      default: null,
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
  },
  { timestamps: true }
);

submissionSchema.index(
  { assignmentId: 1, studentId: 1 },
  { unique: true }
);

const Submission = mongoose.model('Submission', submissionSchema);
export default Submission;