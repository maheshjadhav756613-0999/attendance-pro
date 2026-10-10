import mongoose from 'mongoose';

const examSchema = new mongoose.Schema(
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
      default: '', // जर सगळ्या divisions साठी असेल तर empty
    },
    name: {
      type: String,
      required: [true, 'Exam name आवश्यक'],
      trim: true,
      // उदा: "Mid-Term Exam", "Final Exam", "Unit Test 1"
    },
    examType: {
      type: String,
      enum: ['Unit Test', 'Mid-Term', 'Final', 'Practical', 'Internal', 'External'],
      default: 'Mid-Term',
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    subjects: [
      {
        subjectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Subject',
        },
        examDate: Date,
        startTime: String,
        endTime: String,
        room: String,
        maxMarks: {
          type: Number,
          default: 100,
        },
        _id: false,
      },
    ],
    academicYear: {
      type: String,
      required: true,
    },
    minimumAttendance: {
      type: Number,
      default: 75,
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

const Exam = mongoose.model('Exam', examSchema);
export default Exam;