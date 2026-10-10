import mongoose from 'mongoose';

const lectureSchema = new mongoose.Schema(
  {
    timetableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Timetable',
      default: null,
    },
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
    room: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Scheduled', 'Conducted', 'Cancelled', 'Holiday'],
      default: 'Scheduled',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

lectureSchema.index({ teacherId: 1, date: 1 });
lectureSchema.index({ classId: 1, divisionName: 1, date: 1 });

const Lecture = mongoose.model('Lecture', lectureSchema);
export default Lecture;