import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema(
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
      trim: true,
    },
    academicYear: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Student name आवश्यक आहे'],
      trim: true,
    },
    prnNumber: {
      type: String,
      required: [true, 'PRN number आवश्यक आहे'],
      trim: true,
      uppercase: true,
    },
    seatNumber: {
      type: String,
      required: [true, 'Seat number आवश्यक आहे'],
      trim: true,
    },
    rollNumber: {
      type: String,
      required: [true, 'Roll number आवश्यक आहे'],
      trim: true,
    },
    studentId: {
      type: String,
      required: [true, 'Student ID आवश्यक आहे'],
      trim: true,
      uppercase: true,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      default: 'Male',
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    mobile: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },

    // ✅ NAAC Fields
    category: {
      type: String,
      enum: ['General', 'OBC', 'SC', 'ST', 'EWS', 'Other'],
      default: 'General',
    },
    programme: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    isFirstGraduate: {
      type: Boolean,
      default: false,
    },
    hostel: {
      type: Boolean,
      default: false,
    },
    admissionYear: {
      type: String,
      trim: true,
      default: '',
    },

    // ✅ Parent Info
    parentName: {
      type: String,
      trim: true,
      default: '',
    },
    parentEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    parentPhone: {
      type: String,
      trim: true,
      default: '',
    },

    // ✅ Login Flags
    hasParentLogin: {
      type: Boolean,
      default: false,
    },
    hasStudentLogin: {
      type: Boolean,
      default: false,
    },

    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ✅ Student चा login account
userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  default: null,
},
// ✅ Parent चा login account
parentUserId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  default: null,
},
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Unique constraints per class+division+academicYear
studentSchema.index(
  { classId: 1, divisionName: 1, rollNumber: 1, academicYear: 1 },
  { unique: true }
);
studentSchema.index(
  { classId: 1, divisionName: 1, seatNumber: 1, academicYear: 1 },
  { unique: true }
);
studentSchema.index(
  { classId: 1, divisionName: 1, prnNumber: 1, academicYear: 1 },
  { unique: true }
);
studentSchema.index(
  { classId: 1, divisionName: 1, studentId: 1, academicYear: 1 },
  { unique: true }
);

const Student = mongoose.model('Student', studentSchema);

export default Student;