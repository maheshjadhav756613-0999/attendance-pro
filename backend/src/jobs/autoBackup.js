import cron from 'node-cron';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Backup from '../models/Backup.js';

const BACKUP_DIR = path.join(process.cwd(), 'backups');

const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

// ============================================
// ⏰ Auto Backup — रोज रात्री 2:00 AM
// ============================================
cron.schedule('0 2 * * *', async () => {
  try {
    console.log('💾 Auto backup starting...');

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

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `auto-backup-${timestamp}.json`;
    const filePath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
    const fileSize = fs.statSync(filePath).size;

    await Backup.create({
      name: `Auto Backup ${new Date().toLocaleDateString('en-IN')}`,
      filename,
      filePath,
      fileSize,
      type: 'auto',
      status: 'completed',
      collections: collections.length,
      totalRecords,
      createdByName: 'System',
    });

    console.log(`✅ Auto backup complete: ${filename}`);

    // ✅ जुने backups delete कर (30 दिवसांपेक्षा जुने)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldBackups = await Backup.find({
      type: 'auto',
      createdAt: { $lt: thirtyDaysAgo },
    });

    for (const old of oldBackups) {
      if (fs.existsSync(old.filePath)) {
        try {
          fs.unlinkSync(old.filePath);
        } catch (err) {
          console.error('Old backup delete error:', err);
        }
      }
      await Backup.findByIdAndDelete(old._id);
    }

    if (oldBackups.length > 0) {
      console.log(`🗑️ Cleaned up ${oldBackups.length} old backups`);
    }
  } catch (error) {
    console.error('🔥 Auto backup error:', error);
  }
});

console.log('💾 Auto backup job initialized (Daily 2:00 AM)');