// ============================================
// 🔔 TRIGGER 8: Repeated Absence Alert (#2)
// ============================================
export const checkRepeatedAbsenceAlert = async (studentId, days = 3) => {
  try {
    const Attendance = (await import('../models/Attendance.js')).default;
    const Student = (await import('../models/Student.js')).default;
    const User = (await import('../models/User.js')).default;

    const student = await Student.findById(studentId)
      .populate('classId', 'name');

    if (!student) return;

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    fromDate.setHours(0, 0, 0, 0);

    const attendance = await Attendance.find({
      studentId,
      date: { $gte: fromDate },
    });

    // Group by date
    const dateMap = {};
    attendance.forEach((a) => {
      const dateStr = new Date(a.date).toISOString().split('T')[0];
      if (!dateMap[dateStr]) dateMap[dateStr] = { present: 0, total: 0 };
      dateMap[dateStr].total++;
      if (a.status === 'Present' || a.status === 'Late') {
        dateMap[dateStr].present++;
      }
    });

    const absentDates = Object.entries(dateMap).filter(
      ([_, data]) => data.present === 0 && data.total > 0
    );

    if (absentDates.length < days) return;

    // Class Teacher शोध
    const classTeacher = await User.findOne({
      role: 'teacher',
      isActive: true,
      assignments: {
        $elemMatch: {
          classId: student.classId._id,
          divisionName: student.divisionName,
          role: 'ClassTeacher',
        },
      },
    });

    const totalMissed = absentDates.reduce(
      (sum, [_, data]) => sum + data.total,
      0
    );

    const payload = {
      title: '🚨 Repeated Absence Alert',
      body: `${student.name} (${student.classId?.name}-${student.divisionName}) ${days} दिवस सलग absent — ${totalMissed} lectures missed!`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `repeated-absent-${studentId}`,
      data: {
        url: '/teacher/students',
        studentId: student._id,
      },
      actions: [
        { action: 'call-parent', title: 'Call Parent' },
        { action: 'view', title: 'View Student' },
      ],
    };

    if (classTeacher) {
      await sendPushToUser(classTeacher._id, payload);
    }

    // Admin ला पण
    await sendPushToRole('admin', payload);

    console.log(`🚨 Repeated absence alert: ${student.name}`);
  } catch (error) {
    console.error('Repeated absence error:', error);
  }
};

// ============================================
// 🏆 TRIGGER 9: Perfect Attendance (#3)
// ============================================
export const checkPerfectAttendance = async (month) => {
  try {
    const Attendance = (await import('../models/Attendance.js')).default;
    const Student = (await import('../models/Student.js')).default;

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);

    const students = await Student.find({ isActive: true })
      .populate('classId', 'name')
      .populate('schoolId', 'name');

    const perfectStudents = [];

    for (const student of students) {
      const attendance = await Attendance.find({
        studentId: student._id,
        date: { $gte: startDate, $lte: endDate },
      });

      if (attendance.length < 5) continue; // कमीत कमी 5 lectures

      const present = attendance.filter(
        (a) => a.status === 'Present' || a.status === 'Late'
      ).length;

      if (present === attendance.length) {
        perfectStudents.push({
          name: student.name,
          rollNumber: student.rollNumber,
          className: student.classId?.name,
          divisionName: student.divisionName,
          schoolName: student.schoolId?.name,
          total: attendance.length,
        });
      }
    }

    if (perfectStudents.length === 0) return;

    // Group by class
    const byClass = {};
    perfectStudents.forEach((s) => {
      const key = `${s.className}-${s.divisionName}`;
      if (!byClass[key]) byClass[key] = [];
      byClass[key].push(s);
    });

    // Admin ला summary
    await sendPushToRole('admin', {
      title: '🏆 Perfect Attendance!',
      body: `${perfectStudents.length} students ने ${month} मध्ये 100% attendance ठेवली`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'perfect-attendance',
      data: { url: '/admin/reports' },
    });

    // प्रत्येक class च्या teacher ला
    for (const [classKey, list] of Object.entries(byClass)) {
      const first = list[0];

      const classTeacher = await User.findOne({
        role: 'teacher',
        isActive: true,
        assignments: {
          $elemMatch: {
            role: 'ClassTeacher',
          },
        },
      });

      if (classTeacher) {
        await sendPushToUser(classTeacher._id, {
          title: `🏆 Perfect Attendance — ${classKey}`,
          body: `${list.length} students ने 100% attendance ठेवली! ${list.map((s) => s.name).slice(0, 3).join(', ')}${list.length > 3 ? '...' : ''}`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `perfect-${classKey}`,
          data: { url: '/teacher/students' },
        });
      }
    }

    console.log(`🏆 Perfect attendance: ${perfectStudents.length} students`);
  } catch (error) {
    console.error('Perfect attendance error:', error);
  }
};

// ============================================
// 🎓 TRIGGER 10: Exam Eligibility Alert (#4)
// ============================================
export const notifyExamEligibility = async (exam) => {
  try {
    const Attendance = (await import('../models/Attendance.js')).default;
    const Student = (await import('../models/Student.js')).default;

    const students = await Student.find({
      classId: exam.classId,
      isActive: true,
    });

    const defaulters = [];
    const eligible = [];

    for (const student of students) {
      const total = await Attendance.countDocuments({ studentId: student._id });
      if (total === 0) continue;

      const present = await Attendance.countDocuments({
        studentId: student._id,
        status: { $in: ['Present', 'Late'] },
      });

      const percentage = (present / total) * 100;

      if (percentage < exam.minimumAttendance) {
        defaulters.push({
          name: student.name,
          rollNumber: student.rollNumber,
          percentage: parseFloat(percentage.toFixed(1)),
        });
      } else {
        eligible.push(student);
      }
    }

    if (defaulters.length === 0) {
      console.log(`✅ All students eligible for ${exam.name}`);
      return;
    }

    // Admin ला alert
    await sendPushToRole('admin', {
      title: '📝 Exam Eligibility Alert',
      body: `${exam.name} (${new Date(exam.startDate).toLocaleDateString('en-IN')}) मध्ये ${defaulters.length} students NOT ELIGIBLE`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `exam-elig-${exam._id}`,
      data: {
        url: '/admin/reports',
        examId: exam._id,
      },
      requireInteraction: true,
    });

    // Class Teacher ला
    const classTeacher = await User.findOne({
      role: 'teacher',
      isActive: true,
      assignments: {
        $elemMatch: {
          classId: exam.classId,
          role: 'ClassTeacher',
        },
      },
    });

    if (classTeacher) {
      await sendPushToUser(classTeacher._id, {
        title: `⚠️ Exam Alert — ${exam.name}`,
        body: `${defaulters.length} students NOT ELIGIBLE (min ${exam.minimumAttendance}%). कृपया parents ला कळवा.`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `exam-elig-teacher-${exam._id}`,
        data: { url: '/teacher/students' },
      });
    }

    console.log(`📝 Exam eligibility: ${defaulters.length} defaulters`);
  } catch (error) {
    console.error('Exam eligibility error:', error);
  }
};

// ============================================
// 📢 TRIGGER 11: New Notice (#5)
// ============================================
export const notifyNewNotice = async (notice) => {
  try {
    const priorityEmoji = {
      Low: '📌',
      Normal: '📢',
      High: '🔔',
      Urgent: '🚨',
    };

    const emoji = priorityEmoji[notice.priority] || '📢';

    // Target audience ला पाठव
    for (const role of notice.targetAudience) {
      if (role === 'admin') continue; // Admin नेच पाठवलं

      await sendPushToRole(role, {
        title: `${emoji} New Notice: ${notice.title}`,
        body: notice.content.substring(0, 150) + (notice.content.length > 150 ? '...' : ''),
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `notice-${notice._id}`,
        data: {
          url:
            role === 'teacher'
              ? '/teacher/notifications'
              : '/login',
          noticeId: notice._id,
        },
        requireInteraction: notice.priority === 'Urgent',
      });
    }

    console.log(`📢 Notice sent to: ${notice.targetAudience.join(', ')}`);
  } catch (error) {
    console.error('Notice notify error:', error);
  }
};

// ============================================
// 📈 TRIGGER 12: Attendance Trend Alert (#6)
// ============================================
export const checkAttendanceTrend = async () => {
  try {
    const Attendance = (await import('../models/Attendance.js')).default;

    const now = new Date();

    // हा आठवडा (last 7 days)
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    thisWeekStart.setHours(0, 0, 0, 0);

    // मागचा आठवडा
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekTotal = await Attendance.countDocuments({
      date: { $gte: thisWeekStart, $lt: now },
    });
    const thisWeekPresent = await Attendance.countDocuments({
      date: { $gte: thisWeekStart, $lt: now },
      status: { $in: ['Present', 'Late'] },
    });

    const lastWeekTotal = await Attendance.countDocuments({
      date: { $gte: lastWeekStart, $lt: thisWeekStart },
    });
    const lastWeekPresent = await Attendance.countDocuments({
      date: { $gte: lastWeekStart, $lt: thisWeekStart },
      status: { $in: ['Present', 'Late'] },
    });

    if (thisWeekTotal === 0 || lastWeekTotal === 0) return;

    const thisPct = (thisWeekPresent / thisWeekTotal) * 100;
    const lastPct = (lastWeekPresent / lastWeekTotal) * 100;
    const diff = thisPct - lastPct;

    // फक्त 5% पेक्षा जास्त drop असल्यास alert
    if (diff >= -5) {
      console.log('📈 Attendance trend normal');
      return;
    }

    await sendPushToRole('admin', {
      title: '📉 Attendance Drop Alert',
      body: `हा आठवडा: ${thisPct.toFixed(1)}% | मागचा: ${lastPct.toFixed(1)}% | ${Math.abs(diff).toFixed(1)}% घट!`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'attendance-trend',
      data: { url: '/admin/reports' },
      requireInteraction: true,
    });

    console.log(`📉 Trend drop: ${diff.toFixed(1)}%`);
  } catch (error) {
    console.error('Attendance trend error:', error);
  }
};

// ============================================
// 📊 TRIGGER 13: Subject-wise Warning (#7)
// ============================================
export const checkSubjectWiseWarning = async () => {
  try {
    const Subject = (await import('../models/Subject.js')).default;
    const Lecture = (await import('../models/Lecture.js')).default;
    const Attendance = (await import('../models/Attendance.js')).default;
    const User = (await import('../models/User.js')).default;

    const subjects = await Subject.find({ isActive: true })
      .populate('classId', 'name')
      .populate('schoolId', 'name');

    for (const subject of subjects) {
      const lectures = await Lecture.find({
        subjectId: subject._id,
        status: 'Conducted',
      }).select('_id');

      if (lectures.length === 0) continue;

      const lectureIds = lectures.map((l) => l._id);
      const total = await Attendance.countDocuments({
        lectureId: { $in: lectureIds },
      });

      if (total === 0) continue;

      const present = await Attendance.countDocuments({
        lectureId: { $in: lectureIds },
        status: { $in: ['Present', 'Late'] },
      });

      const percentage = (present / total) * 100;

      if (percentage >= 75) continue;

      // Subject teacher शोध
      const subjectTeacher = await User.findOne({
        role: 'teacher',
        isActive: true,
        assignments: {
          $elemMatch: {
            subjectId: subject._id,
            role: 'SubjectTeacher',
          },
        },
      });

      const payload = {
        title: '📉 Subject-wise Warning',
        body: `${subject.classId?.name}-${subject.code} ची average attendance ${percentage.toFixed(1)}% आहे (75% पेक्षा कमी)`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `subject-warn-${subject._id}`,
        data: {
          url: '/admin/reports',
          subjectId: subject._id,
        },
      };

      // Admin ला
      await sendPushToRole('admin', payload);

      // Subject teacher ला
      if (subjectTeacher) {
        await sendPushToUser(subjectTeacher._id, payload);
      }

      console.log(`📉 Subject warning: ${subject.name} — ${percentage.toFixed(1)}%`);
    }
  } catch (error) {
    console.error('Subject warning error:', error);
  }
};

// ============================================
// 🤖 TRIGGER 14: AI Defaulter Prediction (#10)
// ============================================
export const predictDefaulters = async () => {
  try {
    const Attendance = (await import('../models/Attendance.js')).default;
    const Student = (await import('../models/Student.js')).default;
    const User = (await import('../models/User.js')).default;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const students = await Student.find({ isActive: true })
      .populate('classId', 'name')
      .populate('schoolId', 'name');

    const atRisk = [];

    for (const student of students) {
      const attendance = await Attendance.find({
        studentId: student._id,
        date: { $gte: monthStart },
      });

      if (attendance.length < 3) continue;

      const present = attendance.filter(
        (a) => a.status === 'Present' || a.status === 'Late'
      ).length;

      const percentage = (present / attendance.length) * 100;

      // 75-80% range मध्ये असेल तर — at risk
      if (percentage >= 75 && percentage <= 80) {
        atRisk.push({
          studentId: student._id,
          name: student.name,
          rollNumber: student.rollNumber,
          className: student.classId?.name,
          divisionName: student.divisionName,
          schoolName: student.schoolId?.name,
          percentage: parseFloat(percentage.toFixed(1)),
          trend: 'declining',
        });
      }
    }

    if (atRisk.length === 0) {
      console.log('✅ No at-risk students');
      return;
    }

    // Admin ला
    await sendPushToRole('admin', {
      title: '🤖 AI Prediction — At Risk Students',
      body: `${atRisk.length} students पुढच्या काही दिवसांत defaulter होण्याची शक्यता आहे`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'ai-prediction',
      data: {
        url: '/admin/reports',
        atRisk: atRisk.slice(0, 5),
      },
      requireInteraction: true,
    });

    // Class Teacher ला
    const byClass = {};
    atRisk.forEach((s) => {
      const key = `${s.className}-${s.divisionName}`;
      if (!byClass[key]) byClass[key] = [];
      byClass[key].push(s);
    });

    for (const [classKey, list] of Object.entries(byClass)) {
      const first = list[0];

      const classTeacher = await User.findOne({
        role: 'teacher',
        isActive: true,
        assignments: {
          $elemMatch: {
            role: 'ClassTeacher',
          },
        },
      });

      if (classTeacher) {
        await sendPushToUser(classTeacher._id, {
          title: `🤖 At Risk — ${classKey}`,
          body: `${list.length} students 75-80% range मध्ये आहेत. लवकर action घ्या!`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `ai-risk-${classKey}`,
          data: { url: '/teacher/students' },
        });
      }
    }

    console.log(`🤖 AI Prediction: ${atRisk.length} at-risk students`);
  } catch (error) {
    console.error('AI prediction error:', error);
  }
};

// ============================================
// 📞 TRIGGER 15: PTM Reminder (#13)
// ============================================
export const notifyPTMReminder = async (ptm, daysBefore = 2) => {
  try {
    const Student = (await import('../models/Student.js')).default;
    const User = (await import('../models/User.js')).default;

    const dateStr = new Date(ptm.date).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Teachers ला
    const teachers = await User.find({
      role: 'teacher',
      isActive: true,
      assignments: {
        $elemMatch: {
          classId: ptm.classId,
          divisionName: ptm.divisionName,
        },
      },
    });

    for (const teacher of teachers) {
      await sendPushToUser(teacher._id, {
        title: `📞 PTM Reminder — ${daysBefore} दिवस`,
        body: `Parent-Teacher Meeting ${dateStr} ला ${ptm.startTime}-${ptm.endTime}${ptm.venue ? ` at ${ptm.venue}` : ''}`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `ptm-teacher-${ptm._id}`,
        data: { url: '/teacher/dashboard' },
      });
    }

    // Admin ला
    await sendPushToRole('admin', {
      title: `📞 PTM — ${daysBefore} दिवस`,
      body: `${ptm.title} ${dateStr} ला ${ptm.startTime}-${ptm.endTime}${ptm.venue ? ` at ${ptm.venue}` : ''}`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `ptm-admin-${ptm._id}`,
      data: { url: '/admin/dashboard' },
    });

    console.log(`📞 PTM reminder sent for ${dateStr}`);
  } catch (error) {
    console.error('PTM reminder error:', error);
  }
};