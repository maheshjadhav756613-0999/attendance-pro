import mongoose from 'mongoose';

const coursePlanSchema = new mongoose.Schema(
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
      required: true,
      uppercase: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
    },
    semester: String,

    // Plan details
    title: {
      type: String,
      default: 'Course Plan',
    },
    totalLectures: {
      type: Number,
      default: 0,
    },
    totalHours: {
      type: Number,
      default: 0,
    },

    // Weekly breakdown
    weeks: [
      {
        weekNumber: Number,
        topic: String,
        subtopics: [String],
        plannedHours: Number,
        plannedLectures: Number,
        completedHours: { type: Number, default: 0 },
        completedLectures: { type: Number, default: 0 },
        status: {
          type: String,
          enum: ['pending', 'in-progress', 'completed'],
          default: 'pending',
        },
        notes: String,
        _id: false,
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

coursePlanSchema.index(
  { classId: 1, divisionName: 1, subjectId: 1, academicYear: 1 },
  { unique: true }
);

const CoursePlan = mongoose.model('CoursePlan', coursePlanSchema);

export default CoursePlan;