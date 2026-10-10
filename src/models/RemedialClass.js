import mongoose from 'mongoose';

const remedialClassSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    className: String,
    divisionName: String,

    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    subjectName: String,

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teacherName: String,

    date: {
      type: Date,
      required: true,
    },
    startTime: String,
    endTime: String,
    room: String,

    reason: {
      type: String,
      default: 'Extra session for defaulters',
    },

    // Students attending
    students: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Student',
        },
        name: String,
        rollNumber: String,
        present: {
          type: Boolean,
          default: false,
        },
        _id: false,
      },
    ],

    status: {
      type: String,
      enum: ['scheduled', 'conducted', 'cancelled'],
      default: 'scheduled',
    },

    notes: String,
  },
  { timestamps: true }
);

remedialClassSchema.index({ teacherId: 1, date: -1 });

const RemedialClass = mongoose.model('RemedialClass', remedialClassSchema);

export default RemedialClass;