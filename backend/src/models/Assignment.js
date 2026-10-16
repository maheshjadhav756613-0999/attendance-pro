import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
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

    // Assignment Details
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
    },

    // Attachments (Teacher's files)
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number,
        _id: false,
      },
    ],

    // Dates
    assignedDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },

    // Settings
    totalMarks: {
      type: Number,
      default: 0,
    },
    submissionType: {
      type: String,
      enum: ['Online', 'Physical', 'Both'],
      default: 'Both',
    },
    allowLateSubmission: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

assignmentSchema.index({ classId: 1, divisionName: 1, dueDate: 1 });
assignmentSchema.index({ teacherId: 1, isActive: 1 });

const Assignment = mongoose.model('Assignment', assignmentSchema);
export default Assignment;