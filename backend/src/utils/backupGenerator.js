import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import School from '../models/School.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Lecture from '../models/Lecture.js';
import Attendance from '../models/Attendance.js';
import Holiday from '../models/Holiday.js';
import Timetable from '../models/Timetable.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// Backups folder तयार कर
// ============================================
const BACKUPS_DIR = path.join(__dirname, '../../backups');

if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// ============================================
// Admin Backup — सगळा data
// ============================================
export const generateAdminBackup = async (adminUserId) => {
  const [schools, classes, subjects, teachers, students, lectures, attendance, holidays, timetables] =
    await Promise.all([
      School.find({ isActive: true }).lean(),
      Class.find({ isActive: true }).lean(),
      Subject.find({ isActive: true }).lean(),
      User.find({ role: 'teacher', isActive: true }).select('-password').lean(),
      Student.find({ isActive: true }).lean(),
      Lecture.find({ isActive: true }).lean(),
      Attendance.find().lean(),
      Holiday.find({ isActive: true }).lean(),
      Timetable.find({ isActive: true }).lean(),
    ]);

  const backupData = {
    meta: {
      type: 'admin-full-backup',
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      generatedBy: adminUserId,
      appName: 'AttendancePro',
    },
    counts: {
      schools: schools.length,
      classes: classes.length,
      subjects: subjects.length,
      teachers: teachers.length,
      students: students.length,
      lectures: lectures.length,
      attendance: attendance.length,
      holidays: holidays.length,
      timetables: timetables.length,
    },
    data: {
      schools,
      classes,
      subjects,
      teachers,
      students,
      lectures,
      attendance,
      holidays,
      timetables,
    },
  };

  return backupData;
};

// ============================================
// Teacher Backup — फक्त स्वतःचा data
// ============================================
export const generateTeacherBackup = async (teacherUserId) => {
  const teacher = await User.findById(teacherUserId)
    .select('-password')
    .populate('assignments.schoolId', 'name code')
    .populate('assignments.classId', 'name academicYear')
    .populate('assignments.subjectId', 'name code')
    .lean();

  if (!teacher) {
    throw new Error('Teacher सापडला नाही');
  }

  // Teacher चे class+division शोध
  const classDivPairs = (teacher.assignments || [])
    .filter((a) => a.classId && a.divisionName)
    .map((a) => ({
      classId: a.classId?._id || a.classId,
      divisionName: a.divisionName,
    }));

  // या class+divisions चे students
  const students = await Student.find({
    isActive: true,
    $or: classDivPairs.map((p) => ({
      classId: p.classId,
      divisionName: p.divisionName,
    })),
  }).lean();

  const studentIds = students.map((s) => s._id);

  // Teacher चे lectures
  const lectures = await Lecture.find({
    teacherId: teacherUserId,
    isActive: true,
  }).lean();

  const lectureIds = lectures.map((l) => l._id);

  // Teacher चे attendance
  const attendance = await Attendance.find({
    $or: [
      { teacherId: teacherUserId },
      { lectureId: { $in: lectureIds } },
    ],
  }).lean();

  // Teacher चे timetables
  const timetables = await Timetable.find({
    teacherId: teacherUserId,
    isActive: true,
  }).lean();

  // संबंधित subjects
  const subjectIds = [
    ...new Set(
      (teacher.assignments || [])
        .map((a) => a.subjectId?._id?.toString() || a.subjectId?.toString())
        .filter(Boolean)
    ),
  ];

  const subjects = await Subject.find({
    _id: { $in: subjectIds },
    isActive: true,
  }).lean();

  // संबंधित classes
  const classIds = [
    ...new Set(
      (teacher.assignments || [])
        .map((a) => a.classId?._id?.toString() || a.classId?.toString())
        .filter(Boolean)
    ),
  ];

  const classes = await Class.find({
    _id: { $in: classIds },
    isActive: true,
  }).lean();

  const backupData = {
    meta: {
      type: 'teacher-backup',
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      generatedBy: teacherUserId,
      teacherName: teacher.name,
      teacherId: teacher.teacherId,
      appName: 'AttendancePro',
    },
    counts: {
      classes: classes.length,
      subjects: subjects.length,
      students: students.length,
      lectures: lectures.length,
      attendance: attendance.length,
      timetables: timetables.length,
    },
    data: {
      teacherProfile: teacher,
      classes,
      subjects,
      students,
      lectures,
      attendance,
      timetables,
    },
  };

  return backupData;
};

// ============================================
// Backup फाइल Save कर
// ============================================
export const saveBackupToFile = (backupData, prefix = 'backup') => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);

  const fileName = `${prefix}-${timestamp}.json`;
  const filePath = path.join(BACKUPS_DIR, fileName);

  const jsonString = JSON.stringify(backupData, null, 2);
  fs.writeFileSync(filePath, jsonString, 'utf-8');

  const stats = fs.statSync(filePath);

  return {
    fileName,
    filePath,
    fileSize: stats.size,
    dataCount: Object.values(backupData.counts || {}).reduce(
      (sum, n) => sum + n,
      0
    ),
  };
};

// ============================================
// Backup फाइल Delete कर
// ============================================
export const deleteBackupFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Delete backup file error:', error);
    return false;
  }
};

// ============================================
// जुन्या Backups Cleanup (30 दिवसांपेक्षा जुने)
// ============================================
export const cleanupOldBackups = (daysToKeep = 30) => {
  try {
    const files = fs.readdirSync(BACKUPS_DIR);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    files.forEach((file) => {
      const filePath = path.join(BACKUPS_DIR, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    return deletedCount;
  } catch (error) {
    console.error('Cleanup error:', error);
    return 0;
  }
};

export { BACKUPS_DIR };