import Exam from '../models/Exam.js';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { sendPushToUser, sendPushToRole } from '../services/pushService.js';

// ============================================
// @desc    सगळ्या exams मिळवा
// @route   GET /api/exams
// ============================================
export const getExams = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.academicYear) filter.academicYear = req.query.academicYear;

    const exams = await Exam.find(filter)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('subjects.subjectId', 'name code')
      .sort({ startDate: -1 });

    res.status(200).json({
      success: true,
      count: exams.length,
      data: exams,
    });
  } catch (error) {
    console.error('🔥 GET EXAMS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    एक exam मिळवा
// @route   GET /api/exams/:id
// ============================================
export const getExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('subjects.subjectId', 'name code');

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam सापडला नाही' });
    }

    res.status(200).json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Exam create
// @route   POST /api/exams
// ============================================
export const createExam = async (req, res) => {
  try {
    const {
      schoolId,
      classId,
      divisionName,
      name,
      examType,
      startDate,
      endDate,
      subjects,
      academicYear,
      minimumAttendance,
      description,
    } = req.body;

    // Validation
    if (!schoolId || !classId || !name || !startDate || !endDate || !academicYear) {
      return res.status(400).json({
        success: false,
        message: 'School, Class, Name, Dates आणि Academic Year आवश्यक',
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'End Date Start Date पेक्षा मोठा असावा',
      });
    }

    const exam = await Exam.create({
      schoolId,
      classId,
      divisionName: divisionName?.toUpperCase() || '',
      name,
      examType: examType || 'Mid-Term',
      startDate,
      endDate,
      subjects: subjects || [],
      academicYear,
      minimumAttendance: minimumAttendance || 75,
      description,
      createdBy: req.user.id,
    });

    const populated = await Exam.findById(exam._id)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('subjects.subjectId', 'name code');

    // ✅ सगळ्या Class Teachers ला notify कर
    try {
      const teachers = await User.find({
        role: 'teacher',
        isActive: true,
        'assignments.classId': classId,
        'assignments.role': 'ClassTeacher',
      }).select('_id');

      for (const t of teachers) {
        await sendPushToUser(t._id, {
          title: '📝 New Exam Scheduled',
          body: `${name} — ${populated.classId?.name} | ${new Date(startDate).toLocaleDateString('en-IN')} ते ${new Date(endDate).toLocaleDateString('en-IN')}`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `exam-${exam._id}`,
          data: { url: '/admin/exams' },
        });
      }
    } catch (err) {
      console.error('Exam notify failed:', err.message);
    }

    res.status(201).json({
      success: true,
      message: '✅ Exam created successfully',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 CREATE EXAM ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Exam update
// @route   PUT /api/exams/:id
// ============================================
export const updateExam = async (req, res) => {
  try {
    const updated = await Exam.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('subjects.subjectId', 'name code');

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Exam सापडला नाही' });
    }

    res.status(200).json({
      success: true,
      message: '✅ Exam updated',
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Exam delete (soft)
// @route   DELETE /api/exams/:id
// ============================================
export const deleteExam = async (req, res) => {
  try {
    const deleted = await Exam.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Exam सापडला नाही' });
    }

    res.status(200).json({ success: true, message: '✅ Exam deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Exam ची eligibility check कर
//          कोण eligible, कोण नाही
// @route   GET /api/exams/:id/eligibility
// ============================================
export const getExamEligibility = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name');

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam सापडला नाही' });
    }

    // Students fetch
    const students = await Student.find({
      classId: exam.classId._id,
      ...(exam.divisionName && { divisionName: exam.divisionName }),
      isActive: true,
    }).sort({ rollNumber: 1 });

    // प्रत्येक student ची attendance
    const studentData = await Promise.all(
      students.map(async (s) => {
        const total = await Attendance.countDocuments({ studentId: s._id });
        const present = await Attendance.countDocuments({
          studentId: s._id,
          status: { $in: ['Present', 'Late'] },
        });
        const percentage =
          total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0;

        return {
          _id: s._id,
          name: s.name,
          rollNumber: s.rollNumber,
          prnNumber: s.prnNumber,
          studentId: s.studentId,
          divisionName: s.divisionName,
          category: s.category,
          mobile: s.mobile,
          parentEmail: s.parentEmail,
          total,
          present,
          absent: total - present,
          percentage,
          isEligible: percentage >= exam.minimumAttendance,
        };
      })
    );

    const eligible = studentData.filter((s) => s.isEligible);
    const notEligible = studentData.filter((s) => !s.isEligible);

    res.status(200).json({
      success: true,
      data: {
        exam: {
          name: exam.name,
          startDate: exam.startDate,
          endDate: exam.endDate,
          minimumAttendance: exam.minimumAttendance,
          className: exam.classId?.name,
          divisionName: exam.divisionName,
          schoolName: exam.schoolId?.name,
        },
        eligible,
        notEligible,
        summary: {
          total: studentData.length,
          eligible: eligible.length,
          notEligible: notEligible.length,
        },
      },
    });
  } catch (error) {
    console.error('🔥 ELIGIBILITY ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Not-eligible parents ला notification पाठव
// @route   POST /api/exams/:id/notify-parents
// ============================================
export const notifyEligibilityParents = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('classId', 'name');

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam सापडला नाही' });
    }

    const students = await Student.find({
      classId: exam.classId._id,
      ...(exam.divisionName && { divisionName: exam.divisionName }),
      isActive: true,
    });

    let notified = 0;
    let failed = 0;

    for (const s of students) {
      const total = await Attendance.countDocuments({ studentId: s._id });
      if (total === 0) continue;

      const present = await Attendance.countDocuments({
        studentId: s._id,
        status: { $in: ['Present', 'Late'] },
      });
      const percentage = (present / total) * 100;

      // जर not eligible असेल
      if (percentage < exam.minimumAttendance) {
        // Class Teacher शोध
        const classTeacher = await User.findOne({
          role: 'teacher',
          isActive: true,
          assignments: {
            $elemMatch: {
              classId: exam.classId._id,
              divisionName: s.divisionName,
              role: 'ClassTeacher',
            },
          },
        });

        if (classTeacher) {
          try {
            await sendPushToUser(classTeacher._id, {
              title: '⚠️ Exam Eligibility Alert',
              body: `${s.name} (${s.rollNumber}) — ${exam.name} साठी ineligible आहे. Attendance: ${percentage.toFixed(1)}% (आवश्यक: ${exam.minimumAttendance}%)`,
              icon: '/logo192.png',
              badge: '/logo192.png',
              tag: `eligibility-${exam._id}-${s._id}`,
              data: { url: '/admin/exams' },
              actions: [
                { action: 'whatsapp', title: 'Send WhatsApp' },
                { action: 'view', title: 'View Student' },
              ],
            });
            notified++;
          } catch (err) {
            failed++;
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `✅ ${notified} Class Teachers ला notify केलं`,
      data: { notified, failed },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};