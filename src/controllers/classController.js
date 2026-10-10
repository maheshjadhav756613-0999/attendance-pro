import Class from '../models/Class.js';
import School from '../models/School.js';

// ============================================
// @desc    all classes get
// @route   GET /api/classes
// ============================================
export const getClasses = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.schoolId) filter.schoolId = req.query.schoolId;

    const classes = await Class.find(filter)
      .populate('schoolId', 'name code type')
      .populate('divisions.classTeacherId', 'name email teacherId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: classes.length,
      data: classes,
    });
  } catch (error) {
    console.error('🔥 GET CLASSES ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    a class get
// @route   GET /api/classes/:id
// ============================================
export const getClass = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id)
      .populate('schoolId', 'name code')
      .populate('divisions.classTeacherId', 'name email');

    if (!cls) {
      return res.status(404).json({
        success: false,
        message: 'Class not found',
      });
    }

    res.status(200).json({ success: true, data: cls });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class create please
// @route   POST /api/classes
// ============================================
export const createClass = async (req, res) => {
  try {
    const { schoolId, name, academicYear, divisions } = req.body;

    if (!schoolId || !name || !academicYear) {
      return res.status(400).json({
        success: false,
        message: 'School, class name, and academic year are required',
      });
    }

    // School exist is whether?
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    // already is whether?
    const existing = await Class.findOne({ schoolId, name, academicYear });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'this Class this academic year in already is',
      });
    }

    // Divisions clean do
    const cleanDivisions = (divisions || [])
      .filter((d) => d.name && d.name.trim())
      .map((d) => ({
        name: d.name.trim().toUpperCase(),
        classTeacherId: d.classTeacherId || null,
      }));

    const newClass = await Class.create({
      schoolId,
      name,
      academicYear,
      divisions: cleanDivisions,
    });

    const populated = await Class.findById(newClass._id)
      .populate('schoolId', 'name code type')
      .populate('divisions.classTeacherId', 'name email');

    res.status(201).json({
      success: true,
      message: '✅ Class added successfully',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 CREATE CLASS ERROR:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entry — this class already is',
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class update please (School changing permission)
// @route   PUT /api/classes/:id
// ============================================
export const updateClass = async (req, res) => {
  try {
    const { schoolId, name, academicYear, divisions } = req.body;

    // before previous class get
    const existingClass = await Class.findById(req.params.id);
    if (!existingClass) {
      return res.status(404).json({
        success: false,
        message: 'Class not found',
      });
    }

    const updateData = {};

    // ✅ School change give
    if (schoolId && schoolId !== existingClass.schoolId.toString()) {
      const school = await School.findById(schoolId);
      if (!school) {
        return res.status(404).json({
          success: false,
          message: 'new School not found',
        });
      }
      updateData.schoolId = schoolId;
    }

    if (name) updateData.name = name;
    if (academicYear) updateData.academicYear = academicYear;

    if (divisions) {
      updateData.divisions = divisions
        .filter((d) => d.name && d.name.trim())
        .map((d) => ({
          name: d.name.trim().toUpperCase(),
          classTeacherId: d.classTeacherId || null,
        }));
    }

    // ✅ Duplicate check — same school + name + year may be should not
    const finalSchoolId = updateData.schoolId || existingClass.schoolId;
    const finalName = updateData.name || existingClass.name;
    const finalYear = updateData.academicYear || existingClass.academicYear;

    const duplicate = await Class.findOne({
      _id: { $ne: req.params.id },
      schoolId: finalSchoolId,
      name: finalName,
      academicYear: finalYear,
      isActive: true,
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: 'this Class this school + academic year in already is',
      });
    }

    const updated = await Class.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('schoolId', 'name code type')
      .populate('divisions.classTeacherId', 'name email');

    res.status(200).json({
      success: true,
      message: '✅ Class updated',
      data: updated,
    });
  } catch (error) {
    console.error('🔥 UPDATE CLASS ERROR:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entry — this class already is',
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class delete (soft)
// @route   DELETE /api/classes/:id
// ============================================
export const deleteClass = async (req, res) => {
  try {
    const deleted = await Class.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Class not found',
      });
    }

    res.status(200).json({
      success: true,
      message: '✅ Class deleted',
    });
  } catch (error) {
    console.error('🔥 DELETE CLASS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Bulk import classes
// @route   POST /api/classes/bulk
// ============================================
export const createBulkClasses = async (req, res) => {
  try {
    const { classes: classList } = req.body;

    if (!classList || !Array.isArray(classList) || classList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Classes array आवश्यक आहे',
      });
    }

    const results = {
      added: [],
      failed: [],
    };

    for (const c of classList) {
      try {
        if (!c.schoolId || !c.name || !c.academicYear) {
          results.failed.push({
            name: c.name || '?',
            reason: 'School, Class Name, Academic Year आवश्यक',
          });
          continue;
        }

        // School exist check
        const school = await School.findById(c.schoolId);
        if (!school) {
          results.failed.push({
            name: c.name,
            reason: 'School सापडलं नाही',
          });
          continue;
        }

        // Duplicate check
        const existing = await Class.findOne({
          schoolId: c.schoolId,
          name: c.name.trim(),
          academicYear: c.academicYear.trim(),
        });

        if (existing) {
          results.failed.push({
            name: c.name,
            reason: `${school.name} मध्ये ही class आधीच आहे`,
          });
          continue;
        }

        // Divisions clean कर
        const cleanDivisions = (c.divisions || [])
          .filter((d) => d.name && d.name.trim())
          .map((d) => ({
            name: d.name.trim().toUpperCase(),
            classTeacherId: d.classTeacherId || null,
          }));

        // जर divisions empty तर default 'A' टाक
        if (cleanDivisions.length === 0) {
          cleanDivisions.push({ name: 'A', classTeacherId: null });
        }

        const newClass = new Class({
          schoolId: c.schoolId,
          name: c.name.trim(),
          academicYear: c.academicYear.trim(),
          divisions: cleanDivisions,
        });

        await newClass.save();

        results.added.push({
          name: newClass.name,
          academicYear: newClass.academicYear,
          divisions: cleanDivisions.map((d) => d.name),
          school: school.name,
        });
      } catch (err) {
        results.failed.push({
          name: c.name || '?',
          reason: err.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `✅ ${results.added.length} classes add झाल्या, ${results.failed.length} fail`,
      data: results,
    });
  } catch (error) {
    console.error('🔥 BULK CLASSES ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};