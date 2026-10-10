import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    lectureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lecture',
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Excused'],
      default: 'Present',
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },

    // ✅ Edit Tracking
    isEdited: {
      type: Boolean,
      default: false,
    },
    editHistory: [
      {
        oldStatus: {
          type: String,
          enum: ['Present', 'Absent', 'Late', 'Excused'],
        },
        newStatus: {
          type: String,
          enum: ['Present', 'Absent', 'Late', 'Excused'],
        },
        editedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        editedAt: {
          type: Date,
          default: Date.now,
        },
        reason: {
          type: String,
          trim: true,
        },
        _id: false,
      },
    ],
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lastEditedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// ✅ एका lecture + student combination unique
attendanceSchema.index({ lectureId: 1, studentId: 1 }, { unique: true });
attendanceSchema.index({ studentId: 1, date: 1 });
attendanceSchema.index({ teacherId: 1, date: 1 });
attendanceSchema.index({ isEdited: 1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;