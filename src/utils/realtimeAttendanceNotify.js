import Student from '../models/Student.js';
import Lecture from '../models/Lecture.js';
import {
  getParentNotificationUserIds,
  getStudentNotificationUserId,
} from './studentNotificationRecipients.js';
import { sendPushToUser, sendPushToUsers } from '../services/pushService.js';

export const notifyAttendanceRealtime = async ({
  studentId,
  lectureId,
  status,
  isUpdate = false,
}) => {
  try {
    const student = await Student.findById(studentId).populate('classId', 'name');
    if (!student) {
      console.error(`Attendance notification skipped: student ${studentId} not found`);
      return {
        studentRecipients: 0,
        parentRecipients: 0,
        studentSent: 0,
        parentSent: 0,
        failed: 1,
      };
    }

    const lecture = await Lecture.findById(lectureId)
      .populate('subjectId', 'name code')
      .populate('classId', 'name');
    if (!lecture) {
      console.error(`Attendance notification skipped: lecture ${lectureId} not found`);
      return {
        studentRecipients: 0,
        parentRecipients: 0,
        studentSent: 0,
        parentSent: 0,
        failed: 1,
      };
    }

    const statusEmoji = {
      Present: '✅',
      Absent: '❌',
      Late: '⏰',
      Excused: '🏖️',
    };
    const emoji = statusEmoji[status] || '📝';
    const studentName = student.name || 'Student';
    const firstName = studentName.split(' ')[0];
    const subjectName = lecture.subjectId?.name || 'Class';
    const statusText = status || 'updated';
    const timeStr = `${lecture.startTime} - ${lecture.endTime}`;
    const dateStr = new Date(lecture.date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
    const studentUserId = await getStudentNotificationUserId(student);
    const parentUserIds = await getParentNotificationUserIds(student);
    const commonOptions = {
      icon: '/logo192.png',
      badge: '/logo192.png',
      renotify: true,
    };
    const data = {
      type: 'attendance-update',
      status,
      lectureId: lecture._id,
    };
    const deliveries = [];

    if (studentUserId) {
      deliveries.push({
        audience: 'student',
        promise: sendPushToUser(studentUserId, {
          ...commonOptions,
          title: isUpdate ? `${emoji} Attendance Updated` : `${emoji} Attendance Marked`,
          body: isUpdate
            ? `${subjectName} (${dateStr}) — तुझी attendance बदलली: ${statusText}`
            : `${subjectName} (${timeStr}) — तू ${statusText} ${emoji}`,
          tag: `att-${lecture._id}-${student._id}`,
          data: { ...data, url: '/student/dashboard' },
        }),
      });
    } else {
      console.warn(`No student account linked for attendance notification: ${student._id}`);
    }

    if (parentUserIds.length > 0) {
      deliveries.push({
        audience: 'parent',
        promise: sendPushToUsers(parentUserIds, {
          ...commonOptions,
          title: isUpdate
            ? `${emoji} Attendance Update — ${firstName}`
            : `${emoji} Attendance — ${firstName}`,
          body: isUpdate
            ? `${subjectName} (${dateStr}) — ${firstName} ची attendance बदलली: ${statusText}`
            : `${subjectName} (${timeStr}) — ${firstName} ${statusText} ${emoji}`,
          tag: `att-parent-${lecture._id}-${student._id}`,
          data: {
            ...data,
            url: '/parent/dashboard',
            studentId: student._id,
          },
        }),
      });
    } else {
      console.warn(`No parent account linked for attendance notification: ${student._id}`);
    }

    const results = await Promise.allSettled(
      deliveries.map(({ promise }) => promise)
    );
    const counts = {
      studentRecipients: studentUserId ? 1 : 0,
      parentRecipients: parentUserIds.length,
      studentSent: 0,
      parentSent: 0,
      failed: 0,
    };

    results.forEach((result, index) => {
      const { audience } = deliveries[index];
      if (result.status === 'rejected') {
        counts.failed++;
        console.error(
          `Attendance push failed for ${audience} of student ${student._id}:`,
          result.reason
        );
        return;
      }

      counts[`${audience}Sent`] += result.value.sent;
      if (result.value.sent === 0) {
        console.warn(
          `No active ${audience} push subscriptions for student ${student._id}`
        );
      }
    });

    return counts;
  } catch (error) {
    console.error('Real-time attendance notify error:', error);
    return {
      studentRecipients: 0,
      parentRecipients: 0,
      studentSent: 0,
      parentSent: 0,
      failed: 1,
    };
  }
};

export const notifyAttendanceBulk = async ({
  lectureId,
  attendanceList,
  isUpdate = false,
}) => {
  const results = {
    total: attendanceList.length,
    studentRecipients: 0,
    parentRecipients: 0,
    studentSent: 0,
    parentSent: 0,
    failed: 0,
  };

  const perStudentResults = await Promise.all(
    attendanceList.map((item) =>
      notifyAttendanceRealtime({
        studentId: item.studentId,
        lectureId,
        status: item.status,
        isUpdate: item.isUpdate ?? isUpdate,
      })
    )
  );

  perStudentResults.forEach((result) => {
    results.studentRecipients += result.studentRecipients;
    results.parentRecipients += result.parentRecipients;
    results.studentSent += result.studentSent;
    results.parentSent += result.parentSent;
    results.failed += result.failed;
  });

  console.log(
    `Attendance push: ${results.studentSent}/${results.studentRecipients} student accounts and ${results.parentSent}/${results.parentRecipients} parent accounts received it; ${results.failed} failed`
  );
  return results;
};
