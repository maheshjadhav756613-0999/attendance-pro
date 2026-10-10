import Attendance from '../models/Attendance.js';
import AttendanceAuditLog from '../models/AttendanceAuditLog.js';
import Lecture from '../models/Lecture.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Holiday from '../models/Holiday.js';
import { checkStudentLowAttendance } from '../utils/studentNotificationTriggers.js';
import {
  checkRepeatedAbsenceForParent,
  sendDefaulterAlertToParent,
} from '../utils/parentNotificationTriggers.js';
import {
  notifyAttendanceBulk,
  notifyAttendanceRealtime,
} from '../utils/realtimeAttendanceNotify.js';
import { sendPushToRole } from '../services/pushService.js';

// ============================================
// HELPER: Edit limit check
// ============================================
const canEditAttendance = (lectureDate, editLimitDays = 7) => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const lecture = new Date(lectureDate);
  lecture.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - lecture) / (1000 * 60 * 60 * 24));

  return {
    canEdit: diffDays <= editLimitDays,
    daysSince: diffDays,
    limit: editLimitDays,
  };
};

// ============================================
// @desc    एका lecture ची attendance मिळवा
// @route   GET /api/attendance/lecture/:lectureId
// ============================================
export const getLectureAttendance = async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.lectureId)
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name code');

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture सापडला नाही',
      });
    }

    if (lecture.teacherId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'हा lecture तुझा नाही',
      });
    }

    const students = await Student.find({
      classId: lecture.classId._id,
      divisionName: lecture.divisionName,
      isActive: true,
    }).sort({ rollNumber: 1 });

    const existingAttendance = await Attendance.find({
      lectureId: lecture._id,
    });

    const attendanceMap = {};
    existingAttendance.forEach((a) => {
      attendanceMap[a.studentId.toString()] = {
        status: a.status,
        isEdited: a.isEdited,
        editHistory: a.editHistory || [],
        lastEditedAt: a.lastEditedAt,
      };
    });

    const studentsWithAttendance = students.map((s) => {
      const att = attendanceMap[s._id.toString()];
      return {
        _id: s._id,
        name: s.name,
        rollNumber: s.rollNumber,
        seatNumber: s.seatNumber,
        prnNumber: s.prnNumber,
        gender: s.gender,
        status: att?.status || 'Present',
        marked: !!att,
        isEdited: att?.isEdited || false,
        editHistory: att?.editHistory || [],
        lastEditedAt: att?.lastEditedAt || null,
      };
    });

    const total = studentsWithAttendance.length;
    const marked = studentsWithAttendance.filter((s) => s.marked).length;
    const present = studentsWithAttendance.filter(
      (s) => s.status === 'Present' || s.status === 'Late'
    ).length;
    const editedCount = studentsWithAttendance.filter(
      (s) => s.isEdited
    ).length;

    // ✅ Edit permission check
    const editCheck = canEditAttendance(lecture.date, 7);

    res.status(200).json({
      success: true,
      data: {
        lecture,
        students: studentsWithAttendance,
        summary: {
          total,
          marked,
          present,
          absent: marked - present,
          editedCount,
        },
        editPermission: {
          canEdit: editCheck.canEdit,
          daysSince: editCheck.daysSince,
          limit: editCheck.limit,
          message: editCheck.canEdit
            ? `तू ${editCheck.limit} दिवसांपर्यंत attendance edit करू शकतोस`
            : `⛔ ${editCheck.limit} दिवसांपेक्षा जुनी attendance edit करता येत नाही. Admin ला संपर्क करा.`,
        },
      },
    });
  } catch (error) {
    console.error('🔥 GET LECTURE ATTENDANCE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Bulk attendance mark OR update
// @route   POST /api/attendance/bulk
// ============================================
export const markBulkAttendance = async (req, res) => {
  try {
    const { lectureId, attendanceList, updateLectureStatus } = req.body;

    if (!lectureId || !attendanceList || !Array.isArray(attendanceList)) {
      return res.status(400).json({
        success: false,
        message: 'Lecture ID आणि attendance list आवश्यक',
      });
    }

    const lecture = await Lecture.findById(lectureId);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture सापडला नाही',
      });
    }

    if (lecture.teacherId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'हा lecture तुझा नाही',
      });
    }

    // ✅ DATE LOCK — फक्त आजचीच
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lectureDate = new Date(lecture.date);
    lectureDate.setHours(0, 0, 0, 0);

    if (lectureDate.getTime() !== today.getTime()) {
      return res.status(403).json({
        success: false,
        message: '⛔ फक्त आजचीच attendance भरता येते',
        code: 'DATE_LOCKED',
      });
    }

    // ✅ HOLIDAY CHECK
    const allHolidays = await Holiday.find({
      isActive: true,
      $or: [
        { schoolId: lecture.schoolId },
        { schoolId: null },
        { schoolId: { $exists: false } },
      ],
    });

    const isHoliday = allHolidays.some((h) => {
      const hStart = new Date(h.date);
      hStart.setHours(0, 0, 0, 0);
      const hEnd = h.endDate ? new Date(h.endDate) : new Date(h.date);
      hEnd.setHours(23, 59, 59, 999);
      return lectureDate >= hStart && lectureDate <= hEnd;
    });

    if (isHoliday) {
      return res.status(403).json({
        success: false,
        message: '🎉 Holiday आहे — attendance भरता येत नाही',
        code: 'HOLIDAY_LOCKED',
      });
    }

    // ============================================
    // ✅ UPDATE OR CREATE — दोन्ही handle
    // ============================================

    // आधी existing attendance बघ
    const existingAttendance = await Attendance.find({
      lectureId: lecture._id,
      studentId: { $in: attendanceList.map((a) => a.studentId) },
    });

    const existingMap = {};
    existingAttendance.forEach((a) => {
      existingMap[a.studentId.toString()] = a.status;
    });

    // ✅ फक्त बदललेले records (new किंवा status बदललेला)
    const changedAttendance = attendanceList.flatMap((item) => {
      const existingStatus = existingMap[String(item.studentId)];
      if (existingStatus === item.status) return [];
      return [
        {
          studentId: item.studentId,
          status: item.status,
          isUpdate: existingStatus !== undefined,
        },
      ];
    });

    const isUpdate = changedAttendance.some((a) => a.isUpdate);
    const isFirstTime = existingAttendance.length === 0;

    // ============================================
    // DB मध्ये save (Bulk upsert)
    // ============================================
    const operations = attendanceList.map((item) => ({
      updateOne: {
        filter: {
          lectureId: lecture._id,
          studentId: item.studentId,
        },
        update: {
          $set: {
            status: item.status,
            teacherId: req.user.id,
            classId: lecture.classId,
            divisionName: lecture.divisionName,
            subjectId: lecture.subjectId,
            date: lecture.date,
            markedBy: req.user.id,
            markedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

   await Attendance.bulkWrite(operations);

// ✅ AUDIT LOG — प्रत्येक entry साठी log तयार करा
const lectureFull = await Lecture.findById(lectureId)
  .populate('subjectId', 'name')
  .populate('classId', 'name');

// ✅ नवीन (दुरुस्त केलेला) कोड
for (const item of attendanceList) {
  try {
    const existingRecord = await Attendance.findOne({
      lectureId: lecture._id,
      studentId: item.studentId,
    });

    if (!existingRecord) {
      // ✅ 'create' action सह ऑडिट लॉग तयार करा
      const student = await Student.findById(item.studentId);
      await AttendanceAuditLog.create({
        attendanceId: lecture._id, // नवीन रेकॉर्डसाठी lecture._id वापरा
        studentId: item.studentId,
        studentName: student?.name || 'Unknown',
        studentRollNumber: student?.rollNumber || '',
        lectureId: lecture._id,
        lectureDate: lecture.date,
        subjectName: lectureFull?.subjectId?.name,
        className: lectureFull?.classId?.name,
        divisionName: lecture.divisionName,
        action: 'create', // ✅ 'action' फील्ड जोडा
        oldStatus: null,
        newStatus: item.status,
        editedBy: req.user.id,
        editedByName: req.user.name,
        editedByRole: req.user.role,
        reason: 'Initial attendance',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });
    } else if (existingRecord.status !== item.status) {
      // ✅ 'update' action सह ऑडिट लॉग तयार करा
      const student = await Student.findById(item.studentId);
      await AttendanceAuditLog.create({
        attendanceId: existingRecord._id,
        studentId: item.studentId,
        studentName: student?.name || 'Unknown',
        studentRollNumber: student?.rollNumber || '',
        lectureId: lecture._id,
        lectureDate: lecture.date,
        subjectName: lectureFull?.subjectId?.name,
        className: lectureFull?.classId?.name,
        divisionName: lecture.divisionName,
        action: 'update', // ✅ 'action' फील्ड जोडा
        oldStatus: existingRecord.status,
        newStatus: item.status,
        editedBy: req.user.id,
        editedByName: req.user.name,
        editedByRole: req.user.role,
        reason: req.body.editReason || 'Status changed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });
    }
  } catch (logErr) {
    console.error('Audit log failed:', logErr.message);
  }
}

if (updateLectureStatus) {
  lecture.status = 'Conducted';
  await lecture.save();
}
    // ============================================
    // ✅ REAL-TIME NOTIFICATIONS
    // ============================================

    const populatedLecture = await Lecture.findById(lecture._id)
      .populate('subjectId', 'name code')
      .populate('classId', 'name')
      .populate('teacherId', 'name');

    const present = attendanceList.filter(
      (a) => a.status === 'Present' || a.status === 'Late'
    ).length;
    const absent = attendanceList.length - present;
    const percentage = ((present / attendanceList.length) * 100).toFixed(0);

    // 1️⃣ ADMIN ला (फक्त पहिल्यांदा)
    if (isFirstTime) {
      sendPushToRole('admin', {
        title: '✅ Attendance Marked',
        body: `${populatedLecture.teacherId?.name} ने ${populatedLecture.classId?.name}-${lecture.divisionName} • ${populatedLecture.subjectId?.name} मध्ये ${present}/${attendanceList.length} (${percentage}%) नोंदवले`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `attendance-${lecture._id}`,
        data: { url: '/admin/reports' },
      }).catch((err) => console.error('Admin notify failed:', err.message));
    }

    // 2️⃣ Low attendance alert (60% पेक्षा कमी)
    if (parseFloat(percentage) < 60 && isFirstTime) {
      sendPushToRole('admin', {
        title: '⚠️ Low Attendance Alert',
        body: `${populatedLecture.classId?.name}-${lecture.divisionName} • ${populatedLecture.subjectId?.name} मध्ये फक्त ${percentage}% present!`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `low-${lecture._id}`,
        data: { url: '/admin/reports' },
      }).catch((err) => console.error('Low notify failed:', err.message));
    }

    // 3️⃣ ✅ STUDENT + PARENT ला REAL-TIME
    let notificationDelivery = null;
    if (changedAttendance.length > 0) {
      try {
        notificationDelivery = await notifyAttendanceBulk({
          lectureId: lecture._id,
          attendanceList: changedAttendance,
        });
      } catch (err) {
        console.error('Student/Parent notify failed:', err.message);
      }

      // ✅ Low Attendance + Repeated Absence + Defaulter checks
      const uniqueStudentIds = [
        ...new Set(changedAttendance.map((a) => String(a.studentId))),
      ];

      for (const studentId of uniqueStudentIds) {
        // 🎯 Student ची low attendance check
        checkStudentLowAttendance(studentId).catch((err) =>
          console.error('Low att check failed:', err.message)
        );

        // 🎯 Parent checks (async)
        (async () => {
          try {
            const total = await Attendance.countDocuments({ studentId });
            const presentCount = await Attendance.countDocuments({
              studentId,
              status: { $in: ['Present', 'Late'] },
            });
            const pct = total > 0 ? (presentCount / total) * 100 : 0;

            // Defaulter alert (70% ते 75% दरम्यान)
            if (pct < 75 && pct >= 70) {
              await sendDefaulterAlertToParent(studentId, pct);
            }

            // Repeated absence check
            await checkRepeatedAbsenceForParent(studentId);
          } catch (err) {
            console.error('Parent check failed:', err.message);
          }
        })();
      }
    }

    // ============================================
    // Response
    // ============================================
    res.status(200).json({
      success: true,
      message: `✅ Attendance ${isFirstTime ? 'saved' : 'updated'} — ${present}/${attendanceList.length} present`,
      data: {
        total: attendanceList.length,
        present,
        absent,
        percentage,
        isUpdate: isUpdate && !isFirstTime,
        notificationDelivery,
      },
    });
  } catch (error) {
    console.error('🔥 BULK ATTENDANCE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Attendance EDIT कर (already marked)
// @route   PUT /api/attendance/:id
// ============================================
export const editAttendance = async (req, res) => {
  try {
    const { newStatus, reason } = req.body;

    // Validation
    if (!newStatus) {
      return res.status(400).json({
        success: false,
        message: 'New status आवश्यक',
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: '⛔ Edit करण्यासाठी कारण (reason) आवश्यक आहे',
      });
    }

    if (reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'कारण कमीत कमी 5 characters असावे',
      });
    }

    if (!['Present', 'Absent', 'Late', 'Excused'].includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    // Attendance शोध
    const attendance = await Attendance.findById(req.params.id).populate({
      path: 'lectureId',
      select: 'date classId divisionName subjectId',
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance सापडली नाही',
      });
    }

    // Teacher check
    if (attendance.teacherId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'ही attendance तुझी नाही',
      });
    }

    // Edit limit check
    const editCheck = canEditAttendance(attendance.date, 7);
    if (!editCheck.canEdit) {
      return res.status(403).json({
        success: false,
        message: `⛔ ${editCheck.limit} दिवसांपेक्षा जुनी attendance edit करता येत नाही. (${editCheck.daysSince} दिवस झाले)`,
        code: 'EDIT_LOCKED',
      });
    }

    // Same status check
    if (attendance.status === newStatus) {
      return res.status(400).json({
        success: false,
        message: `Status आधीच "${newStatus}" आहे. बदल करण्याची गरज नाही.`,
      });
    }

    // Teacher info
    const teacher = await User.findById(req.user.id).select('name teacherId');

    const oldStatus = attendance.status;

    // ✅ Edit history मध्ये add
    attendance.editHistory.push({
      oldStatus,
      newStatus,
      editedBy: req.user.id,
      editedAt: new Date(),
      reason: reason.trim(),
    });

    attendance.status = newStatus;
    attendance.isEdited = true;
    attendance.lastEditedBy = req.user.id;
    attendance.lastEditedAt = new Date();

    await attendance.save();

    // ✅ Audit log
    await AttendanceAuditLog.create({
      attendanceId: attendance._id,
      lectureId: attendance.lectureId?._id || attendance.lectureId,
      studentId: attendance.studentId,
      teacherId: req.user.id,
      action: 'update',
      oldStatus,
      newStatus,
      reason: reason.trim(),
      editedBy: req.user.id,
      editedByName: teacher?.name,
      editedByTeacherId: teacher?.teacherId,
      date: attendance.date,
    });

    // ✅ Real-time notification
    notifyAttendanceRealtime({
      studentId: attendance.studentId,
      lectureId: attendance.lectureId?._id || attendance.lectureId,
      status: newStatus,
      isUpdate: true,
    }).catch((error) =>
      console.error('Attendance update notification failed:', error.message)
    );

    const populated = await Attendance.findById(attendance._id)
      .populate('studentId', 'name rollNumber')
      .populate('subjectId', 'name code');

    res.status(200).json({
      success: true,
      message: `✅ Attendance edit झाली — ${oldStatus} → ${newStatus}`,
      data: populated,
    });
  } catch (error) {
    console.error('🔥 EDIT ATTENDANCE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Bulk edit attendance (with audit log)
// @route   PUT /api/attendance/bulk-edit
// ============================================
export const bulkEditAttendance = async (req, res) => {
  try {
    const { lectureId, edits } = req.body;

    console.log('═══════════════════════════════════════');
    console.log('🔄 BULK EDIT REQUEST');
    console.log('📝 Lecture ID:', lectureId);
    console.log('📝 Edits count:', edits?.length);

    if (!lectureId || !edits || !Array.isArray(edits) || edits.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Lecture ID आणि edits आवश्यक',
      });
    }

    const lecture = await Lecture.findById(lectureId);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture सापडला नाही',
      });
    }

    // Teacher check
    if (lecture.teacherId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'हा lecture तुझा नाही',
      });
    }

    // Edit window check (7 दिवस)
    const today = new Date();
    const lectureDate = new Date(lecture.date);
    const diffDays = Math.floor(
      (today - lectureDate) / (1000 * 60 * 60 * 24)
    );

    if (diffDays > 7) {
      return res.status(403).json({
        success: false,
        message: `⛔ फक्त 7 दिवसांपर्यंत edit करता येतो`,
      });
    }

    const results = {
      updated: 0,
      skipped: 0,
      errors: [],
    };
    const changedAttendance = [];

    // ============================================
    // प्रत्येक edit process कर
    // ============================================
    for (const edit of edits) {
      try {
        const { studentId, newStatus, reason } = edit;

        console.log('───────────────────────────────────');
        console.log('📌 Processing edit for student:', studentId);
        console.log('   New status:', newStatus);
        console.log('   Reason:', reason);

        if (!studentId || !newStatus || !reason) {
          console.log('   ❌ Missing fields');
          results.errors.push({
            studentId: studentId || 'unknown',
            reason: 'Missing studentId, newStatus किंवा reason',
          });
          continue;
        }

        // ✅ Attendance record शोध
        const attendance = await Attendance.findOne({
          lectureId: lectureId,
          studentId: studentId,
        });

        if (!attendance) {
          console.log('   ❌ Attendance record सापडला नाही');
          results.errors.push({
            studentId,
            reason: 'Attendance record सापडला नाही',
          });
          continue;
        }

        console.log('   ✅ Attendance सापडला:', attendance._id);
        console.log('   Old status:', attendance.status);

        const oldStatus = attendance.status;

        // Status बदलला नाही तर skip
        if (oldStatus === newStatus) {
          console.log('   ⏭️ Status same — skipped');
          results.skipped++;
          continue;
        }

        // ✅ Audit log तयार कर
        const auditData = {
          attendanceId: attendance._id,
          lectureId: lecture._id,
          studentId: studentId,
          action: 'update',
          editedBy: req.user.id,
          oldStatus: oldStatus,
          newStatus: newStatus,
          reason: reason.trim(),
          editedAt: new Date(),
        };

        console.log('   📋 Creating audit log:', auditData);

        await AttendanceAuditLog.create(auditData);

        console.log('   ✅ Audit log created');

        // ✅ Attendance update
        attendance.status = newStatus;
        attendance.editedBy = req.user.id;
        attendance.editedAt = new Date();
        attendance.isEdited = true;

        await attendance.save();

        console.log('   ✅ Attendance updated');
        results.updated++;
        changedAttendance.push({ studentId, status: newStatus, isUpdate: true });
      } catch (err) {
        console.log('   ❌ Error:', err.message);
        results.errors.push({
          studentId: edit.studentId || 'unknown',
          reason: err.message,
        });
      }
    }

    console.log('═══════════════════════════════════════');
    console.log('📊 RESULTS:', results);
    console.log('═══════════════════════════════════════');

    // ✅ Real-time notifications
    if (changedAttendance.length > 0) {
      notifyAttendanceBulk({
        lectureId: lecture._id,
        attendanceList: changedAttendance,
      }).catch((error) =>
        console.error(
          'Bulk attendance update notification failed:',
          error.message
        )
      );

      // ✅ Low attendance + Defaulter checks
      const uniqueStudentIds = [
        ...new Set(changedAttendance.map((a) => String(a.studentId))),
      ];

      for (const studentId of uniqueStudentIds) {
        checkStudentLowAttendance(studentId).catch((err) =>
          console.error('Low att check failed:', err.message)
        );

        (async () => {
          try {
            const total = await Attendance.countDocuments({ studentId });
            const presentCount = await Attendance.countDocuments({
              studentId,
              status: { $in: ['Present', 'Late'] },
            });
            const pct = total > 0 ? (presentCount / total) * 100 : 0;

            if (pct < 75 && pct >= 70) {
              await sendDefaulterAlertToParent(studentId, pct);
            }

            await checkRepeatedAbsenceForParent(studentId);
          } catch (err) {
            console.error('Parent check failed:', err.message);
          }
        })();
      }
    }

    if (results.updated === 0 && results.errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: `❌ ${results.errors.length} edit failed: ${results.errors[0].reason}`,
        data: results,
      });
    }

    res.status(200).json({
      success: true,
      message: `✅ ${results.updated} student${
        results.updated !== 1 ? 's' : ''
      } update झाला${results.skipped > 0 ? ` (${results.skipped} skipped)` : ''}`,
      data: results,
    });
  } catch (error) {
    console.error('🔥 BULK EDIT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Attendance edit history मिळवा
// @route   GET /api/attendance/:id/history
// ============================================
export const getAttendanceHistory = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('studentId', 'name rollNumber')
      .populate('lastEditedBy', 'name teacherId');

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance सापडली नाही',
      });
    }

    if (attendance.teacherId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'ही attendance तुझी नाही',
      });
    }

    const auditLogs = await AttendanceAuditLog.find({
      attendanceId: attendance._id,
    })
      .populate('editedBy', 'name teacherId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        attendance: {
          _id: attendance._id,
          studentName: attendance.studentId?.name,
          rollNumber: attendance.studentId?.rollNumber,
          currentStatus: attendance.status,
          isEdited: attendance.isEdited,
          lastEditedAt: attendance.lastEditedAt,
          lastEditedBy: attendance.lastEditedBy,
        },
        editHistory: attendance.editHistory || [],
        auditLogs,
      },
    });
  } catch (error) {
    console.error('🔥 HISTORY ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Lecture wise edited students list
// @route   GET /api/attendance/lecture/:lectureId/edited
// ============================================
export const getEditedAttendanceForLecture = async (req, res) => {
  try {
    const attendance = await Attendance.find({
      lectureId: req.params.lectureId,
      isEdited: true,
    })
      .populate('studentId', 'name rollNumber')
      .populate('lastEditedBy', 'name teacherId')
      .sort({ lastEditedAt: -1 });

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Student monthly attendance
// @route   GET /api/attendance/student/:studentId/month/:month
// ============================================
export const getStudentMonthlyAttendance = async (req, res) => {
  try {
    const { studentId, month } = req.params;

    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'Month आवश्यक (YYYY-MM)',
      });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);

    const attendance = await Attendance.find({
      studentId,
      date: { $gte: startDate, $lte: endDate },
    })
      .populate('subjectId', 'name code')
      .populate('lectureId', 'startTime endTime status')
      .sort({ date: 1 });

    const totalLectures = attendance.length;
    const present = attendance.filter(
      (a) => a.status === 'Present' || a.status === 'Late'
    ).length;
    const absent = attendance.filter((a) => a.status === 'Absent').length;

    const subjectWise = {};
    attendance.forEach((a) => {
      const subjId = a.subjectId?._id?.toString();
      if (!subjId) return;
      if (!subjectWise[subjId]) {
        subjectWise[subjId] = {
          subjectName: a.subjectId.name,
          subjectCode: a.subjectId.code,
          total: 0,
          present: 0,
        };
      }
      subjectWise[subjId].total++;
      if (a.status === 'Present' || a.status === 'Late') {
        subjectWise[subjId].present++;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        attendance,
        summary: {
          totalLectures,
          present,
          absent,
          percentage:
            totalLectures > 0
              ? ((present / totalLectures) * 100).toFixed(2)
              : 0,
        },
        subjectWise: Object.values(subjectWise),
      },
    });
  } catch (error) {
    console.error('🔥 STUDENT ATTENDANCE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class+Division daily attendance
// @route   GET /api/attendance/class/:classId/:division/date/:date
// ============================================
export const getClassDailyAttendance = async (req, res) => {
  try {
    const { classId, division, date } = req.params;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const attendance = await Attendance.find({
      classId,
      divisionName: division.toUpperCase(),
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .populate('studentId', 'name rollNumber')
      .populate('subjectId', 'name code')
      .populate('lectureId', 'startTime endTime');

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Lecture status update
// @route   PUT /api/attendance/lecture/:lectureId/status
// ============================================
export const updateLectureStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const lecture = await Lecture.findById(req.params.lectureId);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture सापडला नाही',
      });
    }

    if (lecture.teacherId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'हा lecture तुझा नाही',
      });
    }

    if (!['Scheduled', 'Conducted', 'Cancelled', 'Holiday'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    lecture.status = status;
    await lecture.save();

    res.status(200).json({
      success: true,
      message: `✅ Lecture ${status}`,
      data: lecture,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};