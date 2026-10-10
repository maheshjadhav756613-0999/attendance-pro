import Student from '../models/Student.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Parent from '../models/Parent.js';

// ============================================
// HELPER 1: Class Teacher Check
// ============================================
const isClassTeacherOf = (teacher, classId, divisionName) => {
  if (!teacher || !teacher.assignments) return false;
  return teacher.assignments.some((a) => {
    const aClassId = (a.classId?._id || a.classId)?.toString();
    return (
      aClassId === classId?.toString() &&
      a.divisionName === divisionName?.toUpperCase() &&
      a.role === 'ClassTeacher'
    );
  });
};

// ============================================
// HELPER 2: Auto Student ID Generate
// ============================================
const generateStudentId = async (classId, divisionName, academicYear) => {
  let prefix = 'STU';

  try {
    const cls = await Class.findById(classId);
    if (cls && cls.name) {
      const cleaned = cls.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (cleaned.length >= 3) {
        prefix = cleaned.substring(0, 3);
      } else if (cleaned.length > 0) {
        prefix = cleaned.padEnd(3, 'X');
      }
    }
  } catch (err) {
    console.error('Class fetch error for prefix:', err);
  }

  const existing = await Student.find({
    classId,
    divisionName: divisionName.toUpperCase(),
    academicYear,
    isActive: true,
    studentId: { $regex: `^${prefix}\\d+$` },
  }).select('studentId');

  if (existing.length === 0) {
    return `${prefix}001`;
  }

  const maxNum = existing.reduce((max, s) => {
    const match = s.studentId.match(new RegExp(`^${prefix}(\\d+)$`));
    return Math.max(max, match ? parseInt(match[1]) : 0);
  }, 0);

  const nextNum = maxNum + 1;
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
};

// ============================================
// HELPER 3: ✅ Generate Unique Student Password
// Format: First 3 letters of Name (upper) + DOB Year
// उदा: Rahul Patil (2004) → RAH2004
// ============================================
const generateStudentPassword = (studentName, dateOfBirth) => {
  const namePrefix = (studentName || 'STU')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .substring(0, 3)
    .padEnd(3, 'X');

  let year = '2024';
  if (dateOfBirth) {
    const d = new Date(dateOfBirth);
    if (!isNaN(d.getTime())) {
      year = d.getFullYear().toString();
    }
  }

  return `${namePrefix}${year}`;
};

// ============================================
// HELPER 4: ✅ Generate Unique Parent Password
// Format: First 3 letters of Parent Name + Last 4 digits of Phone
// उदा: Suresh Patil (9876543210) → SUR3210
// ============================================
const generateParentPassword = (parentName, parentPhone) => {
  const namePrefix = (parentName || 'PAR')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .substring(0, 3)
    .padEnd(3, 'X');

  const phoneClean = (parentPhone || '0000').replace(/[^0-9]/g, '');
  const phoneSuffix = phoneClean.slice(-4).padStart(4, '0');

  return `${namePrefix}${phoneSuffix}`;
};

const linkParentAccount = async (student, parentUser) => {
  student.parentUserId = parentUser._id;

  let parent = await Parent.findOne({ email: parentUser.email });
  if (!parent) {
    parent = new Parent({
      userId: parentUser._id,
      name: parentUser.name,
      email: parentUser.email,
      phone: parentUser.phone,
    });
  }

  parent.userId = parentUser._id;
  if (!parent.children.some((child) => child.studentId?.equals(student._id))) {
    parent.children.push({ studentId: student._id });
  }
  await parent.save();
};

// ============================================
// @desc    Students मिळवा (class + division)
// @route   GET /api/students
// ============================================
export const getStudents = async (req, res) => {
  try {
    const { classId, division } = req.query;

    if (!classId || !division) {
      return res.status(400).json({
        success: false,
        message: 'Class आणि Division आवश्यक आहे',
      });
    }

    const students = await Student.find({
      classId,
      divisionName: division.toUpperCase(),
      isActive: true,
    })
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .sort({ rollNumber: 1 });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    console.error('🔥 GET STUDENTS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    एक student मिळवा
// @route   GET /api/students/:id
// ============================================
export const getStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    res.status(200).json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Next Student ID Preview
// @route   GET /api/students/next-id
// ============================================
export const getNextStudentId = async (req, res) => {
  try {
    const { classId, division, academicYear } = req.query;

    if (!classId || !division || !academicYear) {
      return res.status(400).json({
        success: false,
        message: 'Class, Division आणि Academic Year आवश्यक',
      });
    }

    const nextId = await generateStudentId(
      classId,
      division.toUpperCase(),
      academicYear
    );

    res.status(200).json({
      success: true,
      data: { studentId: nextId },
    });
  } catch (error) {
    console.error('🔥 NEXT STUDENT ID ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Student create (single) — with unique passwords
// @route   POST /api/students
// ============================================
export const createStudent = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);

    if (!teacher) {
      return res.status(401).json({
        success: false,
        message: 'Teacher सापडला नाही',
      });
    }

    const {
      schoolId,
      classId,
      divisionName,
      academicYear,
      name,
      prnNumber,
      seatNumber,
      rollNumber,
      studentId,
      gender,
      dateOfBirth,
      mobile,
      email,
      category,
      programme,
      parentName,
      parentEmail,
      parentPhone,
    } = req.body;

    // Validation
    const missing = [];
    if (!schoolId) missing.push('School');
    if (!classId) missing.push('Class');
    if (!divisionName) missing.push('Division');
    if (!academicYear) missing.push('Academic Year');
    if (!name?.trim()) missing.push('Name');
    if (!prnNumber?.trim()) missing.push('PRN Number');
    if (!seatNumber?.trim()) missing.push('Seat Number');
    if (!rollNumber?.trim()) missing.push('Roll Number');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `हे fields भरा: ${missing.join(', ')}`,
      });
    }

    // Class Teacher check
    const isCT = isClassTeacherOf(teacher, classId, divisionName);
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class+division चा Class Teacher नाही',
      });
    }

    const divUpper = divisionName.toUpperCase();

    // Auto Student ID
    let finalStudentId = studentId?.toUpperCase().trim();
    if (!finalStudentId) {
      finalStudentId = await generateStudentId(
        classId,
        divUpper,
        academicYear
      );
    }

    // Duplicate checks
    const dupRoll = await Student.findOne({
      classId,
      divisionName: divUpper,
      rollNumber: rollNumber.toString().trim(),
      academicYear,
      isActive: true,
    });
    if (dupRoll) {
      return res.status(400).json({
        success: false,
        message: `Roll No ${rollNumber} आधीच आहे (या class मध्ये)`,
      });
    }

    const dupSeat = await Student.findOne({
      classId,
      divisionName: divUpper,
      seatNumber: seatNumber.toString().trim(),
      academicYear,
      isActive: true,
    });
    if (dupSeat) {
      return res.status(400).json({
        success: false,
        message: `Seat No ${seatNumber} आधीच आहे (या class मध्ये)`,
      });
    }

    const dupPrn = await Student.findOne({
      classId,
      divisionName: divUpper,
      prnNumber: prnNumber.toUpperCase().trim(),
      academicYear,
      isActive: true,
    });
    if (dupPrn) {
      return res.status(400).json({
        success: false,
        message: `PRN ${prnNumber} आधीच आहे (या class मध्ये)`,
      });
    }

    const dupStudentId = await Student.findOne({
      classId,
      divisionName: divUpper,
      studentId: finalStudentId,
      academicYear,
      isActive: true,
    });
    if (dupStudentId) {
      return res.status(400).json({
        success: false,
        message: `Student ID ${finalStudentId} आधीच आहे (या class मध्ये)`,
      });
    }

    // Create student
    const student = new Student({
      schoolId,
      classId,
      divisionName: divUpper,
      academicYear,
      name: name.trim(),
      prnNumber: prnNumber.toUpperCase().trim(),
      seatNumber: seatNumber.toString().trim(),
      rollNumber: rollNumber.toString().trim(),
      studentId: finalStudentId,
      gender: gender || 'Male',
      dateOfBirth: dateOfBirth || null,
      mobile: mobile?.trim() || '',
      email: email?.trim().toLowerCase() || '',
      category: category || 'General',
      programme: programme?.toUpperCase().trim() || '',
      parentName: parentName?.trim() || '',
      parentEmail: parentEmail?.trim().toLowerCase() || '',
      parentPhone: parentPhone?.trim() || '',
      addedBy: teacher._id,
    });

    await student.save();

    // ✅ Track credentials
    const credentialsResponse = {
      student: null,
      parent: null,
    };

    // ============================================
    // ✅ Parent login auto-create (Unique Password)
    // ============================================
    if (parentEmail && parentEmail.trim()) {
      try {
        const parentEmailClean = parentEmail.toLowerCase().trim();
        const existingParent = await User.findOne({ email: parentEmailClean });

        if (!existingParent) {
          // ✅ Generate unique password
          const parentPassword = generateParentPassword(
            parentName,
            parentPhone || mobile
          );

          const parentUser = await User.create({
            name: parentName?.trim() || `Parent of ${name}`,
            email: parentEmailClean,
            password: parentPassword,
            role: 'parent',
            phone: parentPhone?.trim() || mobile?.trim() || '',
            studentId: student._id,
          });
          await linkParentAccount(student, parentUser);

          student.hasParentLogin = true;

          credentialsResponse.parent = {
            name: parentName?.trim() || `Parent of ${name}`,
            email: parentEmailClean,
            password: parentPassword,
          };
        } else if (existingParent.role === 'parent') {
          await linkParentAccount(student, existingParent);
          student.hasParentLogin = true;
        }
      } catch (err) {
        console.error('Parent login create failed:', err.message);
      }
    }

    // ============================================
    // ✅ Student login auto-create (Unique Password)
    // ============================================
    try {
      const studentEmail =
        email?.trim().toLowerCase() ||
        `${finalStudentId.toLowerCase()}@student.com`;

      const existingStudentUser = await User.findOne({ email: studentEmail });

      if (!existingStudentUser) {
        // ✅ Generate unique password
        const studentPassword = generateStudentPassword(name, dateOfBirth);

        const studentUser = await User.create({
          name: name.trim(),
          email: studentEmail,
          password: studentPassword,
          role: 'student',
          studentId: student._id,
        });
        student.userId = studentUser._id;

        student.hasStudentLogin = true;

        credentialsResponse.student = {
          name: name.trim(),
          email: studentEmail,
          password: studentPassword,
        };
      } else if (existingStudentUser.role === 'student') {
        student.userId = existingStudentUser._id;
        student.hasStudentLogin = true;
      }
    } catch (err) {
      console.error('Student login create failed:', err.message);
    }

    await student.save();

    const populated = await Student.findById(student._id)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear');

    res.status(201).json({
      success: true,
      message: `✅ Student add झाला — ID: ${finalStudentId}`,
      data: populated,
      credentials: credentialsResponse,
    });
  } catch (error) {
    console.error('🔥 CREATE STUDENT ERROR:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: errors.join(', '),
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entry — काही fields आधीच आहेत',
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================
// @desc    Bulk students create — with unique passwords
// @route   POST /api/students/bulk
// ============================================
export const createBulkStudents = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);

    if (!teacher) {
      return res.status(401).json({
        success: false,
        message: 'Teacher सापडला नाही',
      });
    }

    const { schoolId, classId, divisionName, academicYear, students } =
      req.body;

    if (
      !schoolId ||
      !classId ||
      !divisionName ||
      !academicYear ||
      !students ||
      !Array.isArray(students) ||
      students.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'सगळी fields आणि students array आवश्यक',
      });
    }

    const isCT = isClassTeacherOf(teacher, classId, divisionName);
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class+division चा Class Teacher नाही',
      });
    }

    const divUpper = divisionName.toUpperCase();
    const results = {
      added: [],
      failed: [],
      credentials: [],
    };

    for (const s of students) {
      try {
        if (!s.name || !s.rollNumber || !s.seatNumber || !s.prnNumber) {
          results.failed.push({
            rollNumber: s.rollNumber || '?',
            name: s.name || '?',
            reason: 'Missing required fields',
          });
          continue;
        }

        let finalStudentId = s.studentId?.toUpperCase().trim();
        if (!finalStudentId) {
          finalStudentId = await generateStudentId(
            classId,
            divUpper,
            academicYear
          );
        }

        const dup = await Student.findOne({
          classId,
          divisionName: divUpper,
          academicYear,
          isActive: true,
          $or: [
            { rollNumber: s.rollNumber.toString().trim() },
            { seatNumber: s.seatNumber.toString().trim() },
            { prnNumber: s.prnNumber.toUpperCase().trim() },
            { studentId: finalStudentId },
          ],
        });

        if (dup) {
          results.failed.push({
            rollNumber: s.rollNumber,
            name: s.name,
            reason: 'Duplicate Roll/Seat/PRN/ID',
          });
          continue;
        }

        const student = new Student({
          schoolId,
          classId,
          divisionName: divUpper,
          academicYear,
          name: s.name.trim(),
          prnNumber: s.prnNumber.toUpperCase().trim(),
          seatNumber: s.seatNumber.toString().trim(),
          rollNumber: s.rollNumber.toString().trim(),
          studentId: finalStudentId,
          gender: s.gender || 'Male',
          dateOfBirth: s.dateOfBirth || null,
          mobile: s.mobile?.trim() || '',
          email: s.email?.trim().toLowerCase() || '',
          category: s.category || 'General',
          programme: s.programme?.toUpperCase().trim() || '',
          parentName: s.parentName?.trim() || '',
          parentEmail: s.parentEmail?.trim().toLowerCase() || '',
          parentPhone: s.parentPhone?.trim() || '',
          addedBy: teacher._id,
        });

        await student.save();

        const creds = { student: null, parent: null };

        // ✅ Parent login
        if (s.parentEmail && s.parentEmail.trim()) {
          try {
            const parentEmailClean = s.parentEmail.toLowerCase().trim();
            const existingParent = await User.findOne({
              email: parentEmailClean,
            });

            if (!existingParent) {
              const parentPassword = generateParentPassword(
                s.parentName,
                s.parentPhone || s.mobile
              );

              const parentUser = await User.create({
                name: s.parentName?.trim() || `Parent of ${s.name}`,
                email: parentEmailClean,
                password: parentPassword,
                role: 'parent',
                phone: s.parentPhone?.trim() || s.mobile?.trim() || '',
                studentId: student._id,
              });
              await linkParentAccount(student, parentUser);

              student.hasParentLogin = true;

              creds.parent = {
                name: s.parentName,
                email: parentEmailClean,
                password: parentPassword,
              };
            } else if (existingParent.role === 'parent') {
              await linkParentAccount(student, existingParent);
              student.hasParentLogin = true;
            }
          } catch (err) {
            console.error('Parent create failed:', err.message);
          }
        }

        // ✅ Student login
        try {
          const studentEmail =
            s.email?.trim().toLowerCase() ||
            `${finalStudentId.toLowerCase()}@student.com`;

          const existing = await User.findOne({ email: studentEmail });

          if (!existing) {
            const studentPassword = generateStudentPassword(
              s.name,
              s.dateOfBirth
            );

            const studentUser = await User.create({
              name: s.name.trim(),
              email: studentEmail,
              password: studentPassword,
              role: 'student',
              studentId: student._id,
            });
            student.userId = studentUser._id;

            student.hasStudentLogin = true;

            creds.student = {
              name: s.name,
              email: studentEmail,
              password: studentPassword,
            };
          } else if (existing.role === 'student') {
            student.userId = existing._id;
            student.hasStudentLogin = true;
          }
        } catch (err) {
          console.error('Student login create failed:', err.message);
        }

        await student.save();
        results.added.push(student);
        results.credentials.push({
          rollNumber: s.rollNumber,
          name: s.name,
          ...creds,
        });
      } catch (err) {
        results.failed.push({
          rollNumber: s.rollNumber,
          name: s.name,
          reason: err.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `✅ ${results.added.length} students add झाले, ${results.failed.length} fail`,
      data: results,
    });
  } catch (error) {
    console.error('🔥 BULK STUDENTS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Student update
// @route   PUT /api/students/:id
// ============================================
export const updateStudent = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    const isCT = isClassTeacherOf(
      teacher,
      student.classId.toString(),
      student.divisionName
    );
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class+division चा Class Teacher नाही',
      });
    }

    const {
      name,
      prnNumber,
      seatNumber,
      rollNumber,
      studentId,
      gender,
      dateOfBirth,
      mobile,
      email,
      category,
      programme,
      parentName,
      parentEmail,
      parentPhone,
    } = req.body;

    // Duplicate checks
    if (rollNumber && rollNumber.toString().trim() !== student.rollNumber) {
      const dup = await Student.findOne({
        classId: student.classId,
        divisionName: student.divisionName,
        rollNumber: rollNumber.toString().trim(),
        academicYear: student.academicYear,
        isActive: true,
        _id: { $ne: student._id },
      });
      if (dup) {
        return res.status(400).json({
          success: false,
          message: `Roll No ${rollNumber} आधीच आहे`,
        });
      }
    }

    if (seatNumber && seatNumber.toString().trim() !== student.seatNumber) {
      const dup = await Student.findOne({
        classId: student.classId,
        divisionName: student.divisionName,
        seatNumber: seatNumber.toString().trim(),
        academicYear: student.academicYear,
        isActive: true,
        _id: { $ne: student._id },
      });
      if (dup) {
        return res.status(400).json({
          success: false,
          message: `Seat No ${seatNumber} आधीच आहे`,
        });
      }
    }

    if (prnNumber && prnNumber.toUpperCase().trim() !== student.prnNumber) {
      const dup = await Student.findOne({
        classId: student.classId,
        divisionName: student.divisionName,
        prnNumber: prnNumber.toUpperCase().trim(),
        academicYear: student.academicYear,
        isActive: true,
        _id: { $ne: student._id },
      });
      if (dup) {
        return res.status(400).json({
          success: false,
          message: `PRN ${prnNumber} आधीच आहे`,
        });
      }
    }

    // Update fields
    if (name) student.name = name.trim();
    if (prnNumber) student.prnNumber = prnNumber.toUpperCase().trim();
    if (seatNumber) student.seatNumber = seatNumber.toString().trim();
    if (rollNumber) student.rollNumber = rollNumber.toString().trim();
    if (studentId) student.studentId = studentId.toUpperCase().trim();
    if (gender) student.gender = gender;
    if (dateOfBirth !== undefined) student.dateOfBirth = dateOfBirth || null;
    if (mobile !== undefined) student.mobile = mobile?.trim() || '';
    if (email !== undefined) student.email = email?.trim().toLowerCase() || '';
    if (category) student.category = category;
    if (programme !== undefined)
      student.programme = programme?.toUpperCase().trim() || '';
    if (parentName !== undefined) student.parentName = parentName?.trim() || '';
    if (parentEmail !== undefined)
      student.parentEmail = parentEmail?.trim().toLowerCase() || '';
    if (parentPhone !== undefined)
      student.parentPhone = parentPhone?.trim() || '';

    await student.save();

    const populated = await Student.findById(student._id)
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear');

    res.status(200).json({
      success: true,
      message: '✅ Student update झाला',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 UPDATE STUDENT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Student delete (HARD DELETE)
// @route   DELETE /api/students/:id
// ============================================
export const deleteStudent = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    const isCT = isClassTeacherOf(
      teacher,
      student.classId.toString(),
      student.divisionName
    );
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class+division चा Class Teacher नाही',
      });
    }

    // Attendance delete
    const Attendance = (await import('../models/Attendance.js')).default;
    const attendanceDeleted = await Attendance.deleteMany({
      studentId: student._id,
    });

    // ✅ Parent/Student login delete
    await User.deleteMany({ studentId: student._id });

    // Student delete
    await Student.findByIdAndDelete(req.params.id);

    console.log(
      `🗑️ Student HARD DELETED: ${student.name} (${attendanceDeleted.deletedCount} attendance records, logins deleted)`
    );

    res.status(200).json({
      success: true,
      message: `✅ Student delete झाला (${attendanceDeleted.deletedCount} attendance records + logins पण delete)`,
    });
  } catch (error) {
    console.error('🔥 DELETE STUDENT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// ✅ BONUS: Reset Student/Parent Password
// @desc    Teacher can reset student/parent passwords
// @route   POST /api/students/:id/reset-passwords
// ============================================
export const resetStudentPasswords = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    const isCT = isClassTeacherOf(
      teacher,
      student.classId.toString(),
      student.divisionName
    );
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class+division चा Class Teacher नाही',
      });
    }

    const credentials = { student: null, parent: null };

    // Reset Student Password
    if (student.hasStudentLogin) {
      const studentEmail =
        student.email?.trim().toLowerCase() ||
        `${student.studentId.toLowerCase()}@student.com`;

      const studentUser = await User.findOne({
        email: studentEmail,
        role: 'student',
      });

      if (studentUser) {
        const newPassword = generateStudentPassword(
          student.name,
          student.dateOfBirth
        );
        studentUser.password = newPassword;
        await studentUser.save();

        credentials.student = {
          email: studentEmail,
          password: newPassword,
        };
      }
    }

    // Reset Parent Password
    if (student.hasParentLogin && student.parentEmail) {
      const parentUser = await User.findOne({
        email: student.parentEmail.toLowerCase().trim(),
        role: 'parent',
      });

      if (parentUser) {
        const newPassword = generateParentPassword(
          student.parentName,
          student.parentPhone || student.mobile
        );
        parentUser.password = newPassword;
        await parentUser.save();

        credentials.parent = {
          email: student.parentEmail.toLowerCase().trim(),
          password: newPassword,
        };
      }
    }

    res.status(200).json({
      success: true,
      message: '✅ Passwords reset झाले',
      credentials,
    });
  } catch (error) {
    console.error('🔥 RESET PASSWORDS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};