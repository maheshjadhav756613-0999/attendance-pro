
import CoursePlan from '../models/CoursePlan.js';
import User from '../models/User.js';

// Helper: Teacher access check
const hasTeacherAccess = (teacher, classId, divisionName, subjectId) => {
  if (!teacher?.assignments) return false;
  return teacher.assignments.some(
    (a) =>
      (a.classId?._id || a.classId)?.toString() === classId?.toString() &&
      a.divisionName === divisionName?.toUpperCase() &&
      (a.subjectId?._id || a.subjectId)?.toString() === subjectId?.toString()
  );
};

// @desc    Create/Update course plan
// @route   POST /api/course-plan
export const createOrUpdateCoursePlan = async (req, res) => {
  try {
    const {
      schoolId,
      classId,
      divisionName,
      subjectId,
      academicYear,
      semester,
      title,
      weeks,
    } = req.body;

    if (
      !schoolId ||
      !classId ||
      !divisionName ||
      !subjectId ||
      !academicYear
    ) {
      return res.status(400).json({
        success: false,
        message: 'सगळी fields आवश्यक',
      });
    }

    // Teacher access check
    if (req.user.role === 'teacher') {
      const teacher = await User.findById(req.user.id);
      const hasAccess = hasTeacherAccess(
        teacher,
        classId,
        divisionName,
        subjectId
      );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'तू या class+subject ला assigned नाही',
        });
      }
    }

    // Calculate totals
    const totalLectures = (weeks || []).reduce(
      (sum, w) => sum + (w.plannedLectures || 0),
      0
    );
    const totalHours = (weeks || []).reduce(
      (sum, w) => sum + (w.plannedHours || 0),
      0
    );

    // Check if exists
    let plan = await CoursePlan.findOne({
      classId,
      divisionName: divisionName.toUpperCase(),
      subjectId,
      academicYear,
    });

    if (plan) {
      // Update
      plan.weeks = weeks;
      plan.title = title || plan.title;
      plan.semester = semester || plan.semester;
      plan.totalLectures = totalLectures;
      plan.totalHours = totalHours;
      await plan.save();
    } else {
      // Create
      plan = await CoursePlan.create({
        schoolId,
        classId,
        divisionName: divisionName.toUpperCase(),
        subjectId,
        teacherId: req.user.id,
        academicYear,
        semester,
        title: title || 'Course Plan',
        weeks,
        totalLectures,
        totalHours,
      });
    }

    const populated = await CoursePlan.findById(plan._id)
      .populate('classId', 'name academicYear')
      .populate('subjectId', 'name code type')
      .populate('teacherId', 'name teacherId')
      .populate('schoolId', 'name code');

    res.status(200).json({
      success: true,
      message: '✅ Course Plan saved',
      data: populated,
    });
  } catch (error) {
    console.error('Course plan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get my course plans (teacher)
// @route   GET /api/course-plan/my
export const getMyCoursePlans = async (req, res) => {
  try {
    const plans = await CoursePlan.find({
      teacherId: req.user.id,
      isActive: true,
    })
      .populate('classId', 'name academicYear')
      .populate('subjectId', 'name code')
      .populate('schoolId', 'name code')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single course plan
// @route   GET /api/course-plan/:id
export const getCoursePlanById = async (req, res) => {
  try {
    const plan = await CoursePlan.findById(req.params.id)
      .populate('classId', 'name academicYear')
      .populate('subjectId', 'name code type')
      .populate('teacherId', 'name teacherId')
      .populate('schoolId', 'name code');

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Course Plan सापडला नाही',
      });
    }

    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update week progress
// @route   PUT /api/course-plan/:id/week/:weekNumber
export const updateWeekProgress = async (req, res) => {
  try {
    const { id, weekNumber } = req.params;
    const { completedLectures, completedHours, notes, status } = req.body;

    const plan = await CoursePlan.findById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan नाही' });
    }

    const week = plan.weeks.find((w) => w.weekNumber === parseInt(weekNumber));
    if (!week) {
      return res.status(404).json({ success: false, message: 'Week नाही' });
    }

    if (completedLectures !== undefined)
      week.completedLectures = completedLectures;
    if (completedHours !== undefined) week.completedHours = completedHours;
    if (notes !== undefined) week.notes = notes;

    // Auto status
    if (completedLectures !== undefined) {
      if (completedLectures >= week.plannedLectures) week.status = 'completed';
      else if (completedLectures > 0) week.status = 'in-progress';
      else week.status = 'pending';
    }

    if (status) week.status = status;

    await plan.save();

    res.status(200).json({
      success: true,
      message: '✅ Progress updated',
      data: plan,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all course plans (admin)
// @route   GET /api/course-plan/all
export const getAllCoursePlans = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.subjectId) filter.subjectId = req.query.subjectId;
    if (req.query.teacherId) filter.teacherId = req.query.teacherId;

    const plans = await CoursePlan.find(filter)
      .populate('classId', 'name academicYear')
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name teacherId')
      .populate('schoolId', 'name code')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: plans.length,
      data: plans,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete course plan
// @route   DELETE /api/course-plan/:id
export const deleteCoursePlan = async (req, res) => {
  try {
    const plan = await CoursePlan.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!plan) {
      return res
        .status(404)
        .json({ success: false, message: 'Plan सापडला नाही' });
    }

    res.status(200).json({ success: true, message: '✅ Plan deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};