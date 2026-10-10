import mongoose from 'mongoose';

const ptmSchema = new mongoose.Schema(
  {
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
      uppercase: true,
      trim: true,
      default: '',
    },
    title: {
      type: String,
      required: [true, 'PTM title आवश्यक'],
      trim: true,
      // उदा: "Parent-Teacher Meeting - October 2026"
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    venue: {
      type: String,
      trim: true,
      default: '',
    },
    slotDuration: {
      type: Number, // minutes मध्ये
      default: 10,
    },
    // ✅ Time slots
    slots: [
      {
        startTime: String,
        endTime: String,
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Student',
        },
        status: {
          type: String,
          enum: ['Available', 'Booked', 'Completed', 'No Show'],
          default: 'Available',
        },
        notes: String,
        _id: false,
      },
    ],
    academicYear: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const PTM = mongoose.model('PTM', ptmSchema);
export default PTM;