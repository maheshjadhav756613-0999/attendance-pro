import School from '../models/School.js';

// @desc    all schools get
// @route   GET /api/schools
export const getSchools = async (req, res) => {
  try {
    const schools = await School.find({ isActive: true }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: schools.length,
      data: schools,
    });
  } catch (error) {
    console.error('🔥 GET SCHOOLS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    a school get
// @route   GET /api/schools/:id
export const getSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }
    res.status(200).json({ success: true, data: school });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    School create please
// @route   POST /api/schools
export const createSchool = async (req, res) => {
  try {
    const { name, code, type, address, city, state, pincode, phone, email, website, principalName, establishedYear } = req.body;

    // Validation
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Name and code are required',
      });
    }

    // Code already is whether?
    const existing = await School.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'this School Code already in use is',
      });
    }

    const school = await School.create({
      name,
      code,
      type,
      address,
      city,
      state,
      pincode,
      phone,
      email,
      website,
      principalName,
      establishedYear,
    });

    res.status(201).json({
      success: true,
      message: '✅ School added successfully',
      data: school,
    });
  } catch (error) {
    console.error('🔥 CREATE SCHOOL ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    School update please
// @route   PUT /api/schools/:id
export const updateSchool = async (req, res) => {
  try {
    const school = await School.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    res.status(200).json({
      success: true,
      message: '✅ School updated',
      data: school,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    School delete please (soft delete)
// @route   DELETE /api/schools/:id
export const deleteSchool = async (req, res) => {
  try {
    const school = await School.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    res.status(200).json({
      success: true,
      message: '✅ School deleted',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Bulk import schools/departments
// @route   POST /api/schools/bulk
// ============================================
export const createBulkSchools = async (req, res) => {
  try {
    const { schools } = req.body;

    if (!schools || !Array.isArray(schools) || schools.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Schools array आवश्यक आहे',
      });
    }

    const results = {
      added: [],
      failed: [],
    };

    for (const s of schools) {
      try {
        // Validation
        if (!s.name?.trim() || !s.code?.trim()) {
          results.failed.push({
            code: s.code || '?',
            name: s.name || '?',
            reason: 'Name आणि Code आवश्यक',
          });
          continue;
        }

        const codeUpper = s.code.toUpperCase().trim();

        // Duplicate code check
        const existing = await School.findOne({ code: codeUpper });
        if (existing) {
          results.failed.push({
            code: codeUpper,
            name: s.name,
            reason: `Code ${codeUpper} आधीच आहे`,
          });
          continue;
        }

        const school = await School.create({
          name: s.name.trim(),
          code: codeUpper,
          type: s.type || 'College',
          address: s.address?.trim() || '',
          city: s.city?.trim() || '',
          state: s.state?.trim() || '',
          pincode: s.pincode?.trim() || '',
          phone: s.phone?.trim() || '',
          email: s.email?.trim().toLowerCase() || '',
          website: s.website?.trim() || '',
          principalName: s.principalName?.trim() || '',
          establishedYear: s.establishedYear || null,
        });

        results.added.push({
          _id: school._id,
          name: school.name,
          code: school.code,
          type: school.type,
        });
      } catch (err) {
        results.failed.push({
          code: s.code || '?',
          name: s.name || '?',
          reason: err.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `✅ ${results.added.length} departments add झाले, ${results.failed.length} fail`,
      data: results,
    });
  } catch (error) {
    console.error('🔥 BULK SCHOOLS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};