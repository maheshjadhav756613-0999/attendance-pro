import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Backup from '../models/Backup.js';

// Backups folder path
const BACKUP_DIR = path.join(process.cwd(), 'backups');

// Folder नसेल तर तयार कर
const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

// ============================================
// @desc    List all backups
// @route   GET /api/backup/list
// ============================================
export const listBackups = async (req, res) => {
  try {
    const backups = await Backup.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      count: backups.length,
      data: backups,
    });
  } catch (error) {
    console.error('🔥 LIST BACKUPS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Create manual backup
// @route   POST /api/backup/create
// ============================================
export const createBackup = async (req, res) => {
  try {
    ensureBackupDir();

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    const backup = {
      timestamp: new Date().toISOString(),
      database: db.databaseName,
      version: '1.0.0',
      collections: {},
    };

    let totalRecords = 0;

    for (const collection of collections) {
      const data = await db.collection(collection.name).find({}).toArray();
      backup.collections[collection.name] = data;
      totalRecords += data.length;
    }

    // Filename
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `backup-${timestamp}.json`;
    const filePath = path.join(BACKUP_DIR, filename);

    // File write
    const jsonData = JSON.stringify(backup, null, 2);
    fs.writeFileSync(filePath, jsonData);
    const fileSize = fs.statSync(filePath).size;

    // Save metadata
    const backupRecord = await Backup.create({
      name: `Backup ${new Date().toLocaleDateString('en-IN')}`,
      filename,
      filePath,
      fileSize,
      type: req.body.type || 'manual',
      status: 'completed',
      collections: collections.length,
      totalRecords,
      createdBy: req.user.id,
      createdByName: req.user.name || 'Admin',
      notes: req.body.notes || '',
    });

    console.log(
      `✅ Backup created: ${filename} (${(fileSize / 1024).toFixed(2)} KB)`
    );

    res.status(201).json({
      success: true,
      message: `✅ Backup created — ${collections.length} collections, ${totalRecords} records`,
      data: backupRecord,
    });
  } catch (error) {
    console.error('🔥 CREATE BACKUP ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Download backup by ID
// @route   GET /api/backup/download/:id
// ============================================
export const downloadBackupById = async (req, res) => {
  try {
    const backup = await Backup.findById(req.params.id);

    if (!backup || !backup.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Backup सापडला नाही',
      });
    }

    if (!fs.existsSync(backup.filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file सापडली नाही',
      });
    }

    res.download(backup.filePath, backup.filename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
    });
  } catch (error) {
    console.error('🔥 DOWNLOAD ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Download direct backup (no save)
// @route   GET /api/backup/download
// ============================================
export const downloadBackup = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    const backup = {
      timestamp: new Date().toISOString(),
      database: db.databaseName,
      version: '1.0.0',
      collections: {},
    };

    for (const collection of collections) {
      const data = await db.collection(collection.name).find({}).toArray();
      backup.collections[collection.name] = data;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=backup-${new Date().toISOString().split('T')[0]}.json`
    );

    res.status(200).json(backup);
  } catch (error) {
    console.error('🔥 BACKUP ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Get backup statistics
// @route   GET /api/backup/stats
// ============================================
export const getBackupStats = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    const stats = [];

    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      stats.push({
        name: collection.name,
        count,
      });
    }

    const totalBackups = await Backup.countDocuments({ isActive: true });
    const totalSize = await Backup.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: '$fileSize' } } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        database: db.databaseName,
        totalCollections: collections.length,
        totalBackups,
        totalSize: totalSize[0]?.total || 0,
        collections: stats,
      },
    });
  } catch (error) {
    console.error('🔥 BACKUP STATS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Restore from backup file
// @route   POST /api/backup/restore/:id
// ============================================
export const restoreBackup = async (req, res) => {
  try {
    const backup = await Backup.findById(req.params.id);

    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup सापडला नाही',
      });
    }

    if (!fs.existsSync(backup.filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file सापडली नाही',
      });
    }

    const fileData = JSON.parse(fs.readFileSync(backup.filePath, 'utf8'));

    if (!fileData.collections) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup format',
      });
    }

    const db = mongoose.connection.db;
    const results = {};

    for (const [collectionName, data] of Object.entries(
      fileData.collections
    )) {
      if (Array.isArray(data) && data.length > 0) {
        await db.collection(collectionName).deleteMany({});
        await db.collection(collectionName).insertMany(data);
        results[collectionName] = data.length;
      }
    }

    res.status(200).json({
      success: true,
      message: '✅ Backup restore झाला',
      data: results,
    });
  } catch (error) {
    console.error('🔥 RESTORE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Delete backup
// @route   DELETE /api/backup/:id
// ============================================
export const deleteBackup = async (req, res) => {
  try {
    const backup = await Backup.findById(req.params.id);

    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup सापडला नाही',
      });
    }

    // File delete
    if (fs.existsSync(backup.filePath)) {
      try {
        fs.unlinkSync(backup.filePath);
      } catch (err) {
        console.error('File delete error:', err);
      }
    }

    // Metadata delete
    await Backup.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: '✅ Backup delete झाला',
    });
  } catch (error) {
    console.error('🔥 DELETE BACKUP ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};