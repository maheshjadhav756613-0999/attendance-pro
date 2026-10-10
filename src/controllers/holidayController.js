import Holiday from '../models/Holiday.js';
import School from '../models/School.js';
import mongoose from 'mongoose';
import { notifyHolidayAdded } from '../utils/notificationTriggers.js';

// @desc    all holidays get
// @route   GET /api/holidays
export const getHolidays = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.schoolId) {
      filter.$or = [
        { schoolId: req.query.schoolId },
        { schoolId: null },
      ];
    }
    if (req.query.year) {
      const year = parseInt(req.query.year);
      filter.date = {
        $gte: new Date(`${year}-01-01`),
        $lte: new Date(`${year}-12-31`),
      };
    }

    const holidays = await Holiday.find(filter)
      .populate('schoolId', 'name code')
      .sort({ date: 1 });

    res.status(200).json({
      success: true,
      count: holidays.length,
      data: holidays,
    });
  } catch (error) {
    console.error('🔥 GET HOLIDAYS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    a holiday get
// @route   GET /api/holidays/:id
export const getHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id).populate(
      'schoolId',
      'name code'
    );
    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found',
      });
    }
    res.status(200).json({ success: true, data: holiday });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Holiday create
// @route   POST /api/holidays
export const createHoliday = async (req, res) => {
  try {
    const { name, date, endDate, type, schoolId, description } = req.body;

    if (!name || !date) {
      return res.status(400).json({
        success: false,
        message: 'Name and Date is required',
      });
    }

    const holiday = await Holiday.create({
      name,
      date,
      endDate: endDate || null,
      type,
      schoolId: schoolId || null,
      description,
    });

    const populated = await Holiday.findById(holiday._id).populate(
      'schoolId',
      'name code'
    );

    void notifyHolidayAdded(populated).catch((error) => {
      console.error('Holiday notify failed:', error);
    });

    res.status(201).json({
      success: true,
      message: '✅ Holiday added successfully',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 CREATE HOLIDAY ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk import holidays
// @route   POST /api/holidays/bulk
export const createBulkHolidays = async (req, res) => {
  try {
    const { holidays: holidayList } = req.body;

    if (!Array.isArray(holidayList) || holidayList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Holidays array आवश्यक आहे',
      });
    }

    const schools = await School.find().select('_id name code');
    const results = { added: [], failed: [] };
    const addedHolidays = [];

    for (const item of holidayList) {
      const row = item && typeof item === 'object' ? item : {};
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const dateValue = typeof row.date === 'string' ? row.date.trim() : '';
      const date = new Date(dateValue);
      const endDateValue =
        typeof row.endDate === 'string' ? row.endDate.trim() : '';
      const endDate = endDateValue ? new Date(endDateValue) : null;
      const type =
        typeof row.type === 'string' ? row.type.trim() || 'Public' : 'Public';
      const schoolValue =
        typeof row.school === 'string' ? row.school.trim() : '';

      const fail = (reason) => {
        results.failed.push({ name: name || '?', date: dateValue || '?', reason });
      };

      const isValidDate =
        /^\d{4}-\d{2}-\d{2}$/.test(dateValue) &&
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === dateValue;
      if (!name || !isValidDate) {
        fail('Holiday name and a valid date (YYYY-MM-DD) are required');
        continue;
      }

      if (
        endDateValue &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(endDateValue) ||
          Number.isNaN(endDate.getTime()) ||
          endDate.toISOString().slice(0, 10) !== endDateValue ||
          endDate < date)
      ) {
        fail('End date must be valid and on or after the start date');
        continue;
      }

      if (!['Public', 'College', 'Exam', 'Vacation', 'Other'].includes(type)) {
        fail('Type must be Public, College, Exam, Vacation, or Other');
        continue;
      }

      let schoolId = null;
      if (schoolValue) {
        const school = mongoose.Types.ObjectId.isValid(schoolValue)
          ? schools.find((candidate) => candidate._id.toString() === schoolValue)
          : schools.find(
              (candidate) =>
                candidate.name.toLowerCase() === schoolValue.toLowerCase() ||
                candidate.code.toLowerCase() === schoolValue.toLowerCase()
            );

        if (!school) {
          fail(`School "${schoolValue}" was not found`);
          continue;
        }
        schoolId = school._id;
      }

      try {
        const duplicate = await Holiday.findOne({
          name: new RegExp(
            `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i'
          ),
          date,
          schoolId,
          isActive: true,
        });
        if (duplicate) {
          fail('This holiday already exists for the selected date and school');
          continue;
        }

        const holiday = await Holiday.create({
          name,
          date,
          endDate,
          type,
          schoolId,
          description:
            typeof row.description === 'string' ? row.description.trim() : '',
        });
        addedHolidays.push(holiday);
        results.added.push({ name: holiday.name, date: holiday.date });
      } catch (error) {
        fail(error.message);
      }
    }

    for (const holiday of addedHolidays) {
      void notifyHolidayAdded(holiday).catch((error) => {
        console.error('Bulk holiday notify failed:', error);
      });
    }

    res.status(201).json({
      success: true,
      message: `${results.added.length} holidays added, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    console.error('🔥 BULK HOLIDAYS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Holiday update
// @route   PUT /api/holidays/:id
export const updateHoliday = async (req, res) => {
  try {
    const updated = await Holiday.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('schoolId', 'name code');

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found',
      });
    }

    res.status(200).json({
      success: true,
      message: '✅ Holiday updated',
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Holiday delete (soft)
// @route   DELETE /api/holidays/:id
export const deleteHoliday = async (req, res) => {
  try {
    const deleted = await Holiday.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found',
      });
    }

    res.status(200).json({
      success: true,
      message: '✅ Holiday deleted',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};