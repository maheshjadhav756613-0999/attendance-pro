import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// ✅ __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// Database
// ============================================
import connectDB from './config/db.js';

// ============================================
// Routes
// ============================================
import authRoutes from './routes/authRoutes.js';
import schoolRoutes from './routes/schoolRoutes.js';
import classRoutes from './routes/classRoutes.js';
import subjectRoutes from './routes/subjectRoutes.js';
import teacherRoutes from './routes/teacherRoutes.js';
import holidayRoutes from './routes/holidayRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import teacherDashboardRoutes from './routes/teacherDashboardRoutes.js';
import timetableRoutes from './routes/timetableRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import teacherNotificationRoutes from './routes/teacherNotificationRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import teacherSettingsRoutes from './routes/teacherSettingsRoutes.js';
import monthlyReportRoutes from './routes/monthlyReportRoutes.js';
import teacherReportRoutes from './routes/teacherReportRoutes.js';
import adminTimetableRoutes from './routes/adminTimetableRoutes.js';
import selfRoutes from './routes/selfRoutes.js';
import pushRoutes from './routes/pushRoutes.js';
import noticeRoutes from './routes/noticeRoutes.js';
import examRoutes from './routes/examRoutes.js';
import ptmRoutes from './routes/ptmRoutes.js';
import teacherSubjectRoutes from './routes/teacherSubjectRoutes.js';
import classTeacherRoutes from './routes/classTeacherRoutes.js';
import dateWiseReportRoutes from './routes/dateWiseReportRoutes.js';
import backupRoutes from './routes/backupRoutes.js';
import matrixReportRoutes from './routes/matrixReportRoutes.js';
import auditLogRoutes from './routes/auditLogRoutes.js';
import coursePlanRoutes from './routes/coursePlanRoutes.js';
import parentCommRoutes from './routes/parentCommRoutes.js';
import undertakingRoutes from './routes/undertakingRoutes.js';
import remedialRoutes from './routes/remedialRoutes.js';
import examEligibilityRoutes from './routes/examEligibilityRoutes.js';
import studentAuthRoutes from './routes/studentAuthRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import studentNotificationRoutes from './routes/studentNotificationRoutes.js';

// ✅ NEW — Assignment + Submission
import assignmentRoutes from './routes/assignmentRoutes.js';
import submissionRoutes from './routes/submissionRoutes.js';

// ============================================
// Jobs (Background tasks)
// ============================================
import './jobs/scheduledNotifications.js';
import './jobs/monthlyEmail.js';
import './jobs/autoBackup.js';

// ============================================
// Connect DB
// ============================================
connectDB();

const app = express();

// ============================================
// CORS Configuration
// ============================================
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      // Development
      if (origin.includes('localhost')) return callback(null, true);
      if (/^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin))
        return callback(null, true);

      // ✅ Production
      if (origin.includes('netlify.app')) return callback(null, true);
      if (origin.includes('attendancepro.in')) return callback(null, true);
      if (origin.includes('ngrok-free')) return callback(null, true);

      console.log('❌ CORS blocked:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// ============================================
// Body Parsers
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// ✅ Static Files — Uploads Folder
// ============================================
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================
// Request Logger
// ============================================
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.originalUrl}`);
  next();
});

// ============================================
// API Routes
// ============================================
// Auth
app.use('/api/auth', authRoutes);
app.use('/api/student-auth', studentAuthRoutes);

// Academic Setup
app.use('/api/schools', schoolRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/holidays', holidayRoutes);

// Reports
app.use('/api/reports', reportRoutes);
app.use('/api/teacher-reports', teacherReportRoutes);
app.use('/api/monthly-report', monthlyReportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/date-wise-report', dateWiseReportRoutes);
app.use('/api/matrix-report', matrixReportRoutes);

// Teacher
app.use('/api/teacher-dashboard', teacherDashboardRoutes);
app.use('/api/teacher-settings', teacherSettingsRoutes);
app.use('/api/teacher-subjects', teacherSubjectRoutes);
app.use('/api/class-teacher', classTeacherRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/admin-timetable', adminTimetableRoutes);

// Students
app.use('/api/students', studentRoutes);

// Attendance
app.use('/api/attendance', attendanceRoutes);

// Notifications
app.use('/api/teacher-notifications', teacherNotificationRoutes);
app.use('/api/student-notifications', studentNotificationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushRoutes);

// ✅ Assignments + Submissions
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);

// Leaves
app.use('/api/leaves', leaveRoutes);

// Other Modules
app.use('/api/self', selfRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/ptms', ptmRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/course-plan', coursePlanRoutes);
app.use('/api/parent-communication', parentCommRoutes);
app.use('/api/undertaking', undertakingRoutes);
app.use('/api/remedial', remedialRoutes);
app.use('/api/exam-eligibility', examEligibilityRoutes);
app.use('/api/settings', settingsRoutes);

// ============================================
// Health Check
// ============================================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🎓 AttendancePro API चालू आहे!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// 404 Handler
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} सापडला नाही`,
  });
});

// ============================================
// Global Error Handler
// ============================================
app.use((err, req, res, next) => {
  console.error('🔥 SERVER ERROR:', err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Something went wrong!',
  });
});

// ============================================
// Start Server
// ============================================
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('🚀 AttendancePro Backend Server Started');
  console.log('═══════════════════════════════════════════════');
  console.log(`📍 Local:    http://localhost:${PORT}`);
  console.log(`📱 Network:  http://[YOUR_IP]:${PORT}`);
  console.log(`📁 Uploads:  http://localhost:${PORT}/uploads`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('📚 Assignment System: Ready');
  console.log('📝 Leave System: Ready');
  console.log('🔔 Notifications: Ready');
  console.log('');
});