import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import School from '../models/School.js';
import mongoose from 'mongoose';

// @desc    all subjects get
// @route   GET /api/subjects
export const getSubjects = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.classId) filter.classId = req.query.classId;

    const subjects = await Subject.find(filter)
      .populate({
        path: 'classId',
        select: 'name academicYear schoolId',
        populate: {
          path: 'schoolId',
          select: 'name code',
        },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: subjects.length,
      data: subjects,
    });
  } catch (error) {
    console.error('🔥 GET SUBJECTS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    a subject get
// @route   GET /api/subjects/:id
export const getSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id).populate({
      path: 'classId',
      populate: { path: 'schoolId', select: 'name code' },
    });

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found',
      });
    }

    res.status(200).json({ success: true, data: subject });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Subject create
// @route   POST /api/subjects
export const createSubject = async (req, res) => {
  try {
    const { classId, name, code, type, credits, semester, description } = req.body;

    // ✅ Validation: classId requires (schoolId should not)
    if (!classId || !name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Class, name, and code are required',
      });
    }

    const cls = await Class.findById(classId);
    if (!cls) {
      return res.status(404).json({
        success: false,
        message: 'Class not found',
      });
    }

    const existing = await Subject.findOne({
      classId,
      code: code.toUpperCase(),
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'this Subject Code this Class in already is',
      });
    }

    const subject = await Subject.create({
      classId,
      name,
      code,
      type,
      credits,
      semester,
      description,
    });

    const populated = await Subject.findById(subject._id).populate({
      path: 'classId',
      select: 'name academicYear schoolId',
      populate: { path: 'schoolId', select: 'name code' },
    });

    res.status(201).json({
      success: true,
      message: '✅ Subject added successfully',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 CREATE SUBJECT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Subject update
// @route   PUT /api/subjects/:id
export const updateSubject = async (req, res) => {
  try {
    const updated = await Subject.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate({
      path: 'classId',
      select: 'name academicYear schoolId',
      populate: { path: 'schoolId', select: 'name code' },
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found',
      });
    }

    res.status(200).json({
      success: true,
      message: '✅ Subject updated',
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Subject delete (soft)
// @route   DELETE /api/subjects/:id
export const deleteSubject = async (req, res) => {
  try {
    const deleted = await Subject.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found',
      });
    }

    res.status(200).json({
      success: true,
      message: '✅ Subject deleted',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Bulk subjects create (Excel/CSV Import)
// @route   POST /api/subjects/bulk
// ============================================
export const createBulkSubjects = async (req, res) => {
  try {
    const { classId, schoolId, subjects } = req.body;

    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Subjects array आवश्यक',
      });
    }

    if (
      !classId &&
      subjects.some((subject) => !subject?.class && !subject?.className)
    ) {
      return res.status(404).json({
        success: false,
        message: 'Select a default class or provide a class for every subject',
      });
    }

    const results = { added: [], failed: [] };

    for (const row of subjects) {
      const s = row && typeof row === 'object' ? row : {};
      const subjectName = typeof s.name === 'string' ? s.name.trim() : '';
      const subjectCode = typeof s.code === 'string' ? s.code.trim() : '';
      try {
        if (!subjectName || !subjectCode) {
          results.failed.push({
            name: subjectName || '?',
            code: subjectCode || '?',
            reason: 'Name आणि Code आवश्यक',
          });
          continue;
        }

        const schoolReference = s.school || s.schoolId || schoolId;
        let resolvedSchoolId = null;
        if (schoolReference) {
          const schoolRef = String(schoolReference).trim();
          const school = mongoose.Types.ObjectId.isValid(schoolRef)
            ? await School.findById(schoolRef)
            : await School.findOne({
                $or: [
                  { name: new RegExp(`^${schoolRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                  { code: new RegExp(`^${schoolRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                ],
              });
          if (!school) {
            results.failed.push({
              name: subjectName,
              code: subjectCode,
              reason: `School "${schoolRef}" not found`,
            });
            continue;
          }
          resolvedSchoolId = school._id;
        }

        const classReference = s.classId || s.class || s.className || classId;
        let cls = null;
        const classRef = String(classReference || '').trim();
        if (mongoose.Types.ObjectId.isValid(classRef)) {
          cls = await Class.findById(classRef);
        } else if (classRef) {
          const classQuery = resolvedSchoolId
            ? { schoolId: resolvedSchoolId }
            : {};
          const possibleClasses = await Class.find(classQuery).populate(
            'schoolId',
            'name code'
          );
          const matchingClasses = possibleClasses.filter((candidate) => {
            const name = candidate.name.toLowerCase();
            const fullName =
              `${candidate.name} - ${candidate.academicYear}`.toLowerCase();
            return (
              name === classRef.toLowerCase() ||
              fullName === classRef.toLowerCase()
            );
          });
          if (matchingClasses.length === 1) {
            cls = matchingClasses[0];
          } else if (matchingClasses.length > 1) {
            results.failed.push({
              name: subjectName,
              code: subjectCode,
              reason:
                'Class name is ambiguous; include its academic year or use Class ID',
            });
            continue;
          }
        }

        if (!cls) {
          results.failed.push({
            name: subjectName,
            code: subjectCode,
            reason: `Class "${classRef || '?'}" not found`,
          });
          continue;
        }

        if (
          resolvedSchoolId &&
          cls.schoolId.toString() !== resolvedSchoolId.toString()
        ) {
          results.failed.push({
            name: subjectName,
            code: subjectCode,
            reason: 'Selected class does not belong to the specified school',
          });
          continue;
        }

        const dup = await Subject.findOne({
          classId: cls._id,
          code: subjectCode.toUpperCase(),
          isActive: true,
        });

        if (dup) {
          results.failed.push({
            name: subjectName,
            code: subjectCode,
            reason: `Code ${subjectCode} आधीच आहे`,
          });
          continue;
        }

        const subject = await Subject.create({
          classId: cls._id,
          name: subjectName,
          code: subjectCode.toUpperCase(),
          type: s.type || 'Theory',
          credits: parseInt(s.credits, 10) || 4,
          semester: typeof s.semester === 'string' ? s.semester.trim() : '',
          description:
            typeof s.description === 'string' ? s.description.trim() : '',
        });

        results.added.push(subject);
      } catch (err) {
        results.failed.push({
          name: subjectName,
          code: subjectCode,
          reason: err.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `✅ ${results.added.length} subjects add झाले, ${results.failed.length} fail`,
      data: results,
    });
  } catch (error) {
    console.error('🔥 BULK SUBJECTS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};