import mongoose from 'mongoose';

const schoolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'School name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'School code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['School', 'College', 'University', 'Institute'],
      default: 'College',
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    principalName: {
      type: String,
      trim: true,
    },
    establishedYear: {
      type: Number,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const School = mongoose.model('School', schoolSchema);

export default School;