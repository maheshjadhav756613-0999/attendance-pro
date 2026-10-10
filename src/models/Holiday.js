import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Holiday name is required'],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    endDate: {
      type: Date,
      default: null,
    },
    type: {
      type: String,
      enum: ['Public', 'College', 'Exam', 'Vacation', 'Other'],
      default: 'Public',
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      default: null, // null = all schools for
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

holidaySchema.index({ date: 1, schoolId: 1 });

const Holiday = mongoose.model('Holiday', holidaySchema);

export default Holiday;