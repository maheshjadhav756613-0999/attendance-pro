import mongoose from 'mongoose';

const parentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    // ✅ Multiple children (एक parent, अनेक मुले)
    children: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Student',
        },
        relationship: {
          type: String,
          enum: ['Father', 'Mother', 'Guardian', 'Other'],
          default: 'Father',
        },
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

const Parent = mongoose.model('Parent', parentSchema);
export default Parent;