import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const assignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    divisionName: { type: String, trim: true, uppercase: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    role: { type: String, enum: ['ClassTeacher', 'SubjectTeacher'], default: 'SubjectTeacher' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: {
      type: String,
      // ✅ Parent + Student add केले
      enum: ['admin', 'teacher', 'parent', 'student'],
      required: true,
    },
    phone: { type: String, trim: true },
    teacherId: { type: String, unique: true, sparse: true, trim: true },

    // ✅ Parent/Student Link
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      sparse: true,
    },

    assignments: [assignmentSchema],
    isActive: { type: Boolean, default: true },
    // ✅ कोणी add केला ते track कर
addedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  default: null,
},
addedByRole: {
  type: String,
  enum: ['admin', 'teacher', null],
  default: null,
},
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;