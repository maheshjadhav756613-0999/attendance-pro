import Lecture from '../models/Lecture.js';
import Holiday from '../models/Holiday.js';

// one timetable rule for lectures generate do
export const generateLecturesFromTimetable = async (timetable) => {
  const lectures = [];
  const start = new Date(timetable.repeatFrom);
  const end = new Date(timetable.repeatTo);

  // Holidays fetch do (school specific + global)
  const holidays = await Holiday.find({
    isActive: true,
    $or: [
      { schoolId: timetable.schoolId },
      { schoolId: null },
    ],
    date: { $gte: start, $lte: end },
  });

  // Holiday dates of set create (YYYY-MM-DD format in)
  const holidayDates = new Set();
  holidays.forEach((h) => {
    const hStart = new Date(h.date);
    const hEnd = h.endDate ? new Date(h.endDate) : hStart;

    for (let d = new Date(hStart); d <= hEnd; d.setDate(d.getDate() + 1)) {
      holidayDates.add(d.toISOString().split('T')[0]);
    }
  });

  // Day-by-day iterate
  const current = new Date(start);
  while (current <= end) {
    if (current.getDay() === timetable.dayOfWeek) {
      const dateStr = current.toISOString().split('T')[0];

      // Holiday is then skip
      if (!holidayDates.has(dateStr)) {
        lectures.push({
          timetableId: timetable._id,
          teacherId: timetable.teacherId,
          schoolId: timetable.schoolId,
          classId: timetable.classId,
          divisionName: timetable.divisionName,
          subjectId: timetable.subjectId,
          date: new Date(current),
          startTime: timetable.startTime,
          endTime: timetable.endTime,
          room: timetable.room,
          status: 'Scheduled',
        });
      }
    }
    current.setDate(current.getDate() + 1);
  }

  if (lectures.length > 0) {
    await Lecture.insertMany(lectures);
  }

  return lectures.length;
};

// one timetable for lectures delete do (update/delete for)
export const deleteLecturesByTimetable = async (timetableId) => {
  await Lecture.deleteMany({
    timetableId,
    status: 'Scheduled', // only scheduled lectures delete do (conducted ones preserve)
  });
};