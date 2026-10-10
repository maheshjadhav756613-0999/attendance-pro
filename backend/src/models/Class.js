import mongoose from 'mongoose';

const classSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: [true, 'School is required'],
    },
    name: {
      type: String,
      required: [true, 'Class name is required'],
      trim: true,
      // e.g.: "FY BSc", "SY BSc", "10th", "12th"
    },
    academicYear: {
      type: String,
      required: [true, 'Academic Year is required'],
      trim: true,
      // e.g.: "2026-27"
    },
    divisions: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
          uppercase: true,
          // e.g.: "A", "B", "C"
        },
        classTeacherId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        _id: false, // subdocument to separate _id should not
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// one school in same academic year to same class name should not
classSchema.index({ schoolId: 1, name: 1, academicYear: 1 }, { unique: true });

const Class = mongoose.model('Class', classSchema);

export default Class;