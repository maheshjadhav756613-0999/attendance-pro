import mongoose from 'mongoose';

const timetableSchema = new mongoose.Schema(
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
      trim: true,
      uppercase: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    dayOfWeek: {
      type: Number, // 0=Sunday, 1=Monday... 6=Saturday
      required: true,
      min: 0,
      max: 6,
    },
    startTime: {
      type: String, // "09:00"
      required: true,
    },
    endTime: {
      type: String, // "10:00"
      required: true,
    },
    room: {
      type: String,
      trim: true,
      default: '',
    },
    repeatFrom: {
      type: Date,
      required: true,
    },
    repeatTo: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

timetableSchema.index({
  teacherId: 1,
  classId: 1,
  divisionName: 1,
  dayOfWeek: 1,
  startTime: 1,
});

const Timetable = mongoose.model('Timetable', timetableSchema);
export default Timetable;