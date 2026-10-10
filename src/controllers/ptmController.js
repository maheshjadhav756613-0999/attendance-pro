import PTM from '../models/PTM.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import { sendPushToUser, sendPushToRole } from '../services/pushService.js';

// ============================================
// @desc    सगळ्या PTMs मिळवा
// @route   GET /api/ptms
// ============================================
export const getPTMs = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.classId) filter.classId = req.query.classId;

    const ptms = await PTM.find(filter)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('slots.studentId', 'name rollNumber')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      count: ptms.length,
      data: ptms,
    });
  } catch (error) {
    console.error('🔥 GET PTMS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    एक PTM मिळवा
// @route   GET /api/ptms/:id
// ============================================
export const getPTM = async (req, res) => {
  try {
    const ptm = await PTM.findById(req.params.id)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('slots.studentId', 'name rollNumber mobile parentEmail');

    if (!ptm) {
      return res.status(404).json({ success: false, message: 'PTM सापडला नाही' });
    }

    res.status(200).json({ success: true, data: ptm });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    PTM create + auto-generate slots
// @route   POST /api/ptms
// ============================================
export const createPTM = async (req, res) => {
  try {
    const {
      schoolId,
      classId,
      divisionName,
      title,
      date,
      startTime,
      endTime,
      venue,
      slotDuration,
      academicYear,
      description,
      autoGenerateSlots,
    } = req.body;

    if (!schoolId || !classId || !title || !date || !startTime || !endTime || !academicYear) {
      return res.status(400).json({
        success: false,
        message: 'सगळी आवश्यक fields भरा',
      });
    }

    let slots = [];

    // ✅ Auto-generate time slots
    if (autoGenerateSlots) {
      slots = generateTimeSlots(startTime, endTime, slotDuration || 10);
    }

    const ptm = await PTM.create({
      schoolId,
      classId,
      divisionName: divisionName?.toUpperCase() || '',
      title,
      date,
      startTime,
      endTime,
      venue: venue || '',
      slotDuration: slotDuration || 10,
      slots,
      academicYear,
      description,
      createdBy: req.user.id,
    });

    const populated = await PTM.findById(ptm._id)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear');

    // ✅ सगळ्या Class Teachers ला notify
    try {
      const teachers = await User.find({
        role: 'teacher',
        isActive: true,
        'assignments.classId': classId,
      }).select('_id');

      for (const t of teachers) {
        await sendPushToUser(t._id, {
          title: '📞 PTM Scheduled',
          body: `${title} — ${populated.classId?.name} | ${new Date(date).toLocaleDateString('en-IN')} @ ${startTime}`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `ptm-${ptm._id}`,
          data: { url: '/admin/ptm' },
        });
      }
    } catch (err) {
      console.error('PTM notify failed:', err.message);
    }

    res.status(201).json({
      success: true,
      message: '✅ PTM created successfully',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 CREATE PTM ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// Helper — Auto-generate time slots
// ============================================
const generateTimeSlots = (startTime, endTime, duration) => {
  const slots = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);

  let current = sh * 60 + sm;
  const end = eh * 60 + em;

  while (current + duration <= end) {
    const slotStart = current;
    const slotEnd = current + duration;

    const fmt = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    slots.push({
      startTime: fmt(slotStart),
      endTime: fmt(slotEnd),
      status: 'Available',
    });

    current = slotEnd;
  }

  return slots;
};

// ============================================
// @desc    PTM update
// @route   PUT /api/ptms/:id
// ============================================
export const updatePTM = async (req, res) => {
  try {
    const updated = await PTM.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('slots.studentId', 'name rollNumber');

    if (!updated) {
      return res.status(404).json({ success: false, message: 'PTM सापडला नाही' });
    }

    res.status(200).json({
      success: true,
      message: '✅ PTM updated',
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    PTM delete
// @route   DELETE /api/ptms/:id
// ============================================
export const deletePTM = async (req, res) => {
  try {
    const deleted = await PTM.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'PTM सापडला नाही' });
    }

    res.status(200).json({ success: true, message: '✅ PTM deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Student ला slot assign कर
// @route   POST /api/ptms/:id/assign-slot
// ============================================
export const assignSlot = async (req, res) => {
  try {
    const { slotIndex, studentId } = req.body;

    const ptm = await PTM.findById(req.params.id);
    if (!ptm) {
      return res.status(404).json({ success: false, message: 'PTM सापडला नाही' });
    }

    if (!ptm.slots[slotIndex]) {
      return res.status(400).json({ success: false, message: 'Slot सापडला नाही' });
    }

    ptm.slots[slotIndex].studentId = studentId;
    ptm.slots[slotIndex].status = 'Booked';

    await ptm.save();

    const populated = await PTM.findById(ptm._id)
      .populate('slots.studentId', 'name rollNumber');

    res.status(200).json({
      success: true,
      message: '✅ Slot assigned',
      data: populated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    PTM चे सगळे slots मिळवा with student info
// @route   GET /api/ptms/:id/slots
// ============================================
export const getPTMSlots = async (req, res) => {
  try {
    const ptm = await PTM.findById(req.params.id)
      .populate('classId', 'name')
      .populate('slots.studentId', 'name rollNumber mobile parentEmail parentName');

    if (!ptm) {
      return res.status(404).json({ success: false, message: 'PTM सापडला नाही' });
    }

    res.status(200).json({
      success: true,
      data: {
        ptm: {
          title: ptm.title,
          date: ptm.date,
          startTime: ptm.startTime,
          endTime: ptm.endTime,
          venue: ptm.venue,
          className: ptm.classId?.name,
          divisionName: ptm.divisionName,
        },
        slots: ptm.slots,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};