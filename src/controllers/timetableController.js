import Timetable from '../models/Timetable.js';
import Lecture from '../models/Lecture.js';
import User from '../models/User.js';
import Holiday from '../models/Holiday.js';
import {
  generateLecturesFromTimetable,
  deleteLecturesByTimetable,
} from '../utils/generateLectures.js';
import { notifyAdminNewTimetable } from '../utils/notificationTriggers.js';

// ============================================
// HELPER 1: Time Overlap Check
// ============================================
const doTimesOverlap = (start1, end1, start2, end2) => {
  // "09:00" format मध्ये string comparison चालतं
  return start1 < end2 && end1 > start2;
};

// ============================================
// HELPER 2: Conflict Check — Teacher + Class + Room
// ============================================
const checkConflicts = async ({
  teacherId,
  classId,
  divisionName,
  subjectId,
  dayOfWeek,
  startTime,
  endTime,
  room,
  repeatFrom,
  repeatTo,
  excludeId = null,
}) => {
  const divUpper = divisionName.toUpperCase();
  const from = new Date(repeatFrom);
  const to = new Date(repeatTo);

  // Base date range query
  const dateRangeQuery = {
    isActive: true,
    dayOfWeek: dayOfWeek,
    repeatFrom: { $lte: to },
    repeatTo: { $gte: from },
  };

  if (excludeId) {
    dateRangeQuery._id = { $ne: excludeId };
  }

  // ============================================
  // 🔴 1. TEACHER CONFLICT
  //    एकच teacher एकाच वेळी दुसऱ्या class मध्ये नको
  // ============================================
  const teacherLectures = await Timetable.find({
    ...dateRangeQuery,
    teacherId,
  })
    .populate('subjectId', 'name code')
    .populate('classId', 'name');

  const teacherConflict = teacherLectures.find((t) =>
    doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
  );

  if (teacherConflict) {
    const sameClass =
      teacherConflict.classId?._id?.toString() === classId?.toString() &&
      teacherConflict.divisionName === divUpper;

    return {
      conflict: true,
      type: sameClass ? 'self' : 'teacher',
      message: sameClass
        ? `⛔ या वेळेला तुझाच "${teacherConflict.subjectId?.name}" चा lecture आहे`
        : `⛔ या वेळेला तू "${teacherConflict.classId?.name}-${teacherConflict.divisionName}" मध्ये "${teacherConflict.subjectId?.name}" शिकवतोस`,
      existing: {
        subjectName: teacherConflict.subjectId?.name,
        subjectCode: teacherConflict.subjectId?.code,
        className: teacherConflict.classId?.name,
        divisionName: teacherConflict.divisionName,
        startTime: teacherConflict.startTime,
        endTime: teacherConflict.endTime,
        room: teacherConflict.room,
      },
    };
  }

  // ============================================
  // 🔴 2. CLASS CONFLICT
  //    एकच class+division मध्ये एकाच वेळी 2 lectures नको
  // ============================================
  const classLectures = await Timetable.find({
    ...dateRangeQuery,
    classId,
    divisionName: divUpper,
  })
    .populate('subjectId', 'name code')
    .populate('teacherId', 'name teacherId');

  const classConflict = classLectures.find((t) =>
    doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
  );

  if (classConflict) {
    return {
      conflict: true,
      type: 'class',
      message: `⛔ या class मध्ये या वेळेला "${classConflict.subjectId?.name}" चा lecture आधीच आहे (${classConflict.teacherId?.name})`,
      existing: {
        subjectName: classConflict.subjectId?.name,
        subjectCode: classConflict.subjectId?.code,
        teacherName: classConflict.teacherId?.name,
        teacherCode: classConflict.teacherId?.teacherId,
        startTime: classConflict.startTime,
        endTime: classConflict.endTime,
        room: classConflict.room,
      },
    };
  }

  // ============================================
  // 🟡 3. ROOM CONFLICT (Warning, Block नाही)
  //    एकच room मध्ये एकाच वेळी 2 lectures
  // ============================================
  let roomWarning = null;

  if (room && room.trim()) {
    const roomLectures = await Timetable.find({
      ...dateRangeQuery,
      room: room.trim(),
    })
      .populate('subjectId', 'name')
      .populate('teacherId', 'name')
      .populate('classId', 'name');

    const roomConflict = roomLectures.find((t) =>
      doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
    );

    if (roomConflict) {
      roomWarning = {
        subjectName: roomConflict.subjectId?.name,
        className: roomConflict.classId?.name,
        divisionName: roomConflict.divisionName,
        teacherName: roomConflict.teacherId?.name,
        startTime: roomConflict.startTime,
        endTime: roomConflict.endTime,
      };
    }
  }

  // ============================================
  // 🟡 4. SUBJECT CONFLICT (Soft Warning)
  //    Same day, same subject, different time
  // ============================================
  const sameSubjectLectures = await Timetable.find({
    ...dateRangeQuery,
    classId,
    divisionName: divUpper,
    subjectId,
  }).populate('subjectId', 'name');

  const subjectConflict = sameSubjectLectures.find(
    (t) => t.startTime !== startTime
  );

  return {
    conflict: false,
    roomWarning,
    subjectConflict: subjectConflict
      ? {
          subjectName: subjectConflict.subjectId?.name,
          startTime: subjectConflict.startTime,
          endTime: subjectConflict.endTime,
        }
      : null,
  };
};

// ============================================
// @desc    Teacher चे सगळे timetables
// @route   GET /api/timetable/my
// ============================================
export const getMyTimetables = async (req, res) => {
  try {
    const timetables = await Timetable.find({
      teacherId: req.user.id,
      isActive: true,
    })
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('subjectId', 'name code')
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      count: timetables.length,
      data: timetables,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher Holidays
// @route   GET /api/timetable/holidays
// ============================================
export const getTeacherHolidays = async (req, res) => {
  try {
    const { month } = req.query;
    const teacher = await User.findById(req.user.id);

    if (!teacher) {
      return res
        .status(404)
        .json({ success: false, message: 'Teacher सापडला नाही' });
    }

    const schoolIds = [
      ...new Set(
        (teacher.assignments || [])
          .map((a) => a.schoolId?._id?.toString() || a.schoolId?.toString())
          .filter(Boolean)
      ),
    ];

    const filter = {
      isActive: true,
      $or: [
        { schoolId: { $in: schoolIds } },
        { schoolId: null },
        { schoolId: { $exists: false } },
      ],
    };

    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      filter.date = {
        $gte: new Date(year, monthNum - 1, 1),
        $lte: new Date(year, monthNum, 0, 23, 59, 59),
      };
    }

    const holidays = await Holiday.find(filter).sort({ date: 1 });

    res
      .status(200)
      .json({ success: true, count: holidays.length, data: holidays });
  } catch (error) {
    console.error('🔥 TEACHER HOLIDAYS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class+Division चा full timetable
// @route   GET /api/timetable/class/:classId/:division
// ============================================
export const getTimetableByClass = async (req, res) => {
  try {
    const { classId, division } = req.params;

    const timetables = await Timetable.find({
      teacherId: req.user.id,
      classId,
      divisionName: division.toUpperCase(),
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      count: timetables.length,
      data: timetables,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Timetable create — Full conflict check
// @route   POST /api/timetable
// ============================================
export const createTimetable = async (req, res) => {
  try {
    const {
      schoolId,
      classId,
      divisionName,
      subjectId,
      dayOfWeek,
      startTime,
      endTime,
      room,
      repeatFrom,
      repeatTo,
      forceCreate = false,
    } = req.body;

    // Validation
    if (
      !schoolId ||
      !classId ||
      !divisionName ||
      !subjectId ||
      dayOfWeek === undefined ||
      !startTime ||
      !endTime ||
      !repeatFrom ||
      !repeatTo
    ) {
      return res.status(400).json({
        success: false,
        message: 'सगळी fields आवश्यक आहेत',
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: 'End time Start time पेक्षा मोठा असावा',
      });
    }

    if (new Date(repeatFrom) > new Date(repeatTo)) {
      return res.status(400).json({
        success: false,
        message: 'End date Start date पेक्षा मोठा असावा',
      });
    }

    // Teacher assigned आहे का?
    const teacher = await User.findById(req.user.id);
    const isAssigned = teacher.assignments.some(
      (a) =>
        a.classId?.toString() === classId &&
        a.divisionName === divisionName.toUpperCase()
    );

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'तू या class+division ला assigned नाही',
      });
    }

    // ✅ Comprehensive conflict check
    const conflictResult = await checkConflicts({
      teacherId: req.user.id,
      classId,
      divisionName,
      subjectId,
      dayOfWeek,
      startTime,
      endTime,
      room,
      repeatFrom,
      repeatTo,
    });

    // Hard block conflicts
    if (conflictResult.conflict) {
      return res.status(400).json({
        success: false,
        message: conflictResult.message,
        conflictType: conflictResult.type,
        existingLecture: conflictResult.existing,
      });
    }

    // Subject warning — same subject same day
    if (conflictResult.subjectConflict && !forceCreate) {
      return res.status(409).json({
        success: false,
        message: `⚠️ या दिवशी "${conflictResult.subjectConflict.subjectName}" आधीच ${conflictResult.subjectConflict.startTime} ला आहे. तरीही add करायचा?`,
        conflictType: 'subject',
        requiresConfirmation: true,
        existingLecture: conflictResult.subjectConflict,
      });
    }

    // Create timetable
    const timetable = await Timetable.create({
      teacherId: req.user.id,
      schoolId,
      classId,
      divisionName: divisionName.toUpperCase(),
      subjectId,
      dayOfWeek,
      startTime,
      endTime,
      room: room || '',
      repeatFrom: new Date(repeatFrom),
      repeatTo: new Date(repeatTo),
    });

   const lectureCount = await generateLecturesFromTimetable(timetable);

const populated = await Timetable.findById(timetable._id)
  .populate('schoolId', 'name code')
  .populate('classId', 'name academicYear')
  .populate('subjectId', 'name code')
  .populate('teacherId', 'name teacherId');

// ✅ Admin ला notification पाठव
try {
  await notifyAdminNewTimetable({
    teacherName: populated.teacherId?.name || 'Unknown',
    teacherId: populated.teacherId?.teacherId || '',
    subjectName: populated.subjectId?.name || 'Unknown',
    className: populated.classId?.name || 'Unknown',
    divisionName: populated.divisionName,
    dayOfWeek: populated.dayOfWeek,
    startTime: populated.startTime,
    endTime: populated.endTime,
    room: populated.room,
  });
} catch (err) {
  console.error('Admin notification failed:', err.message);
  // Notification fail झालं तरी timetable create होईल
}

res.status(201).json({
  success: true,
  message: `✅ Timetable add झाला — ${lectureCount} lectures generate झाले`,
  data: populated,
  lecturesGenerated: lectureCount,
});
  } catch (error) {
    console.error('🔥 CREATE TIMETABLE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Timetable update — Full conflict check
// @route   PUT /api/timetable/:id
// ============================================
export const updateTimetable = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      subjectId,
      dayOfWeek,
      startTime,
      endTime,
      room,
      repeatFrom,
      repeatTo,
      forceCreate = false,
    } = req.body;

    const timetable = await Timetable.findOne({
      _id: id,
      teacherId: req.user.id,
    });

    if (!timetable) {
      return res
        .status(404)
        .json({ success: false, message: 'Timetable सापडला नाही' });
    }

    // New values किंवा existing values वापर
    const newStartTime = startTime || timetable.startTime;
    const newEndTime = endTime || timetable.endTime;
    const newDay = dayOfWeek !== undefined ? dayOfWeek : timetable.dayOfWeek;
    const newSubject = subjectId || timetable.subjectId;
    const newRoom = room !== undefined ? room : timetable.room;
    const newFrom = repeatFrom ? new Date(repeatFrom) : timetable.repeatFrom;
    const newTo = repeatTo ? new Date(repeatTo) : timetable.repeatTo;

    if (newStartTime >= newEndTime) {
      return res.status(400).json({
        success: false,
        message: 'End time Start time पेक्षा मोठा असावा',
      });
    }

    // ✅ Conflict check (self exclude)
    const conflictResult = await checkConflicts({
      teacherId: req.user.id,
      classId: timetable.classId,
      divisionName: timetable.divisionName,
      subjectId: newSubject,
      dayOfWeek: newDay,
      startTime: newStartTime,
      endTime: newEndTime,
      room: newRoom,
      repeatFrom: newFrom,
      repeatTo: newTo,
      excludeId: id,
    });

    if (conflictResult.conflict) {
      return res.status(400).json({
        success: false,
        message: conflictResult.message,
        conflictType: conflictResult.type,
        existingLecture: conflictResult.existing,
      });
    }

    if (conflictResult.subjectConflict && !forceCreate) {
      return res.status(409).json({
        success: false,
        message: `⚠️ या दिवशी "${conflictResult.subjectConflict.subjectName}" आधीच ${conflictResult.subjectConflict.startTime} ला आहे. तरीही update करायचा?`,
        conflictType: 'subject',
        requiresConfirmation: true,
      });
    }

    // Update fields
    if (subjectId) timetable.subjectId = subjectId;
    if (dayOfWeek !== undefined) timetable.dayOfWeek = dayOfWeek;
    if (startTime) timetable.startTime = startTime;
    if (endTime) timetable.endTime = endTime;
    if (room !== undefined) timetable.room = room;
    if (repeatFrom) timetable.repeatFrom = new Date(repeatFrom);
    if (repeatTo) timetable.repeatTo = new Date(repeatTo);

    await timetable.save();

    // Lectures regenerate
    await deleteLecturesByTimetable(timetable._id);
    const lectureCount = await generateLecturesFromTimetable(timetable);

    const populated = await Timetable.findById(timetable._id)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('subjectId', 'name code');

    res.status(200).json({
      success: true,
      message: `✅ Timetable update झाला — ${lectureCount} lectures regenerate झाले`,
      data: populated,
      lecturesGenerated: lectureCount,
    });
  } catch (error) {
    console.error('🔥 UPDATE TIMETABLE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Timetable delete
// @route   DELETE /api/timetable/:id
// ============================================
export const deleteTimetable = async (req, res) => {
  try {
    const timetable = await Timetable.findOne({
      _id: req.params.id,
      teacherId: req.user.id,
    });

    if (!timetable) {
      return res
        .status(404)
        .json({ success: false, message: 'Timetable सापडला नाही' });
    }

    await deleteLecturesByTimetable(timetable._id);
    timetable.isActive = false;
    await timetable.save();

    res
      .status(200)
      .json({ success: true, message: '✅ Timetable delete झाला' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Single lecture update
// @route   PUT /api/timetable/lecture/:id
// ============================================
export const updateLecture = async (req, res) => {
  try {
    const { id } = req.params;
    const { startTime, endTime, room, status } = req.body;

    const lecture = await Lecture.findOne({
      _id: id,
      teacherId: req.user.id,
    });

    if (!lecture) {
      return res
        .status(404)
        .json({ success: false, message: 'Lecture सापडला नाही' });
    }

    if (startTime && endTime && startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: 'End time Start time पेक्षा मोठा असावा',
      });
    }

    if (startTime) lecture.startTime = startTime;
    if (endTime) lecture.endTime = endTime;
    if (room !== undefined) lecture.room = room;
    if (status) lecture.status = status;

    await lecture.save();

    const populated = await Lecture.findById(lecture._id)
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear');

    res.status(200).json({
      success: true,
      message: '✅ Lecture update झाला',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 UPDATE LECTURE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Single lecture delete
// @route   DELETE /api/timetable/lecture/:id
// ============================================
export const deleteLecture = async (req, res) => {
  try {
    const lecture = await Lecture.findOne({
      _id: req.params.id,
      teacherId: req.user.id,
    });

    if (!lecture) {
      return res
        .status(404)
        .json({ success: false, message: 'Lecture सापडला नाही' });
    }

    lecture.isActive = false;
    await lecture.save();

    res.status(200).json({ success: true, message: '✅ Lecture delete झाला' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Calendar साठी lectures
// @route   GET /api/timetable/lectures
// ============================================
export const getLectures = async (req, res) => {
  try {
    const { month, classId, division } = req.query;

    if (!month) {
      return res
        .status(400)
        .json({ success: false, message: 'Month आवश्यक (YYYY-MM)' });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);

    const filter = {
      teacherId: req.user.id,
      date: { $gte: startDate, $lte: endDate },
      isActive: true,
    };

    if (classId) filter.classId = classId;
    if (division) filter.divisionName = division.toUpperCase();

    const lectures = await Lecture.find(filter)
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear')
      .sort({ date: 1, startTime: 1 });

    res
      .status(200)
      .json({ success: true, count: lectures.length, data: lectures });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    एका दिवसाचे lectures
// @route   GET /api/timetable/lectures/day
// ============================================
export const getLecturesByDay = async (req, res) => {
  try {
    const { date, classId, division } = req.query;

    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: 'Date आवश्यक आहे' });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const filter = {
      teacherId: req.user.id,
      date: { $gte: startOfDay, $lte: endOfDay },
      isActive: true,
    };

    if (classId) filter.classId = classId;
    if (division) filter.divisionName = division.toUpperCase();

    const lectures = await Lecture.find(filter)
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear')
      .sort({ startTime: 1 });

    res
      .status(200)
      .json({ success: true, count: lectures.length, data: lectures });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class + Division चा FULL timetable
//         (सगळ्या teachers चे lectures)
// @route   GET /api/timetable/full-class
// ============================================
export const getFullClassTimetable = async (req, res) => {
  try {
    const { classId, division } = req.query;

    if (!classId || !division) {
      return res
        .status(400)
        .json({ success: false, message: 'Class आणि Division आवश्यक' });
    }

    const teacher = await User.findById(req.user.id);
    const isAssigned = teacher.assignments?.some(
      (a) =>
        (a.classId?._id || a.classId)?.toString() === classId &&
        a.divisionName === division.toUpperCase()
    );

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'तू या class+division मध्ये assigned नाही',
      });
    }

    const timetables = await Timetable.find({
      classId,
      divisionName: division.toUpperCase(),
      isActive: true,
    })
      .populate('teacherId', 'name teacherId')
      .populate('subjectId', 'name code')
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      count: timetables.length,
      data: timetables,
    });
  } catch (error) {
    console.error('🔥 FULL CLASS TIMETABLE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class + Division चे सगळे lectures
// @route   GET /api/timetable/lectures/full-class
// ============================================
export const getFullClassLectures = async (req, res) => {
  try {
    const { classId, division, month } = req.query;

    if (!classId || !division) {
      return res
        .status(400)
        .json({ success: false, message: 'Class आणि Division आवश्यक' });
    }

    const teacher = await User.findById(req.user.id);
    const isAssigned = teacher.assignments?.some(
      (a) =>
        (a.classId?._id || a.classId)?.toString() === classId &&
        a.divisionName === division.toUpperCase()
    );

    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'तू या class+division मध्ये assigned नाही',
      });
    }

    let dateFilter = {};
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      dateFilter = {
        $gte: new Date(year, monthNum - 1, 1),
        $lte: new Date(year, monthNum, 0, 23, 59, 59),
      };
    } else {
      const now = new Date();
      dateFilter = {
        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      };
    }

    const lectures = await Lecture.find({
      classId,
      divisionName: division.toUpperCase(),
      date: dateFilter,
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('teacherId', 'name teacherId')
      .sort({ date: 1, startTime: 1 });

    res
      .status(200)
      .json({ success: true, count: lectures.length, data: lectures });
  } catch (error) {
    console.error('🔥 FULL CLASS LECTURES ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Lecture Cancel कर (आजची lecture)
// @route   PUT /api/timetable/lecture/:id/cancel
// ============================================
export const cancelLecture = async (req, res) => {
  try {
    const Lecture = (await import('../models/Lecture.js')).default;

    const lecture = await Lecture.findOne({
      _id: req.params.id,
      teacherId: req.user.id,
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture सापडला नाही',
      });
    }

    if (lecture.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Lecture आधीच cancelled आहे',
      });
    }

    lecture.status = 'Cancelled';
    await lecture.save();

    res.status(200).json({
      success: true,
      message: '✅ Lecture cancelled',
      data: lecture,
    });
  } catch (error) {
    console.error('🔥 CANCEL LECTURE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};