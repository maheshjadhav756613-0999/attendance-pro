import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Assignment from '../models/Assignment.js';
import Submission from '../models/Submission.js';
import { uploadFileToSupabase, generateStoragePath } from '../services/supabaseStorage.js';

dotenv.config();

const migrateFiles = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const assignments = await Assignment.find({ 'attachments.0': { $exists: true } });
    const submissions = await Submission.find({ 'files.0': { $exists: true } })
      .populate('assignmentId', 'schoolId');
    let migrated = 0, failed = 0, skipped = 0;

    const migrateRecordFiles = async (record, field, folder) => {
      for (let i = 0; i < record[field].length; i++) {
        const file = record[field][i];
        const normalizedUrl = file.fileUrl?.replace(/\\/g, '/');

        if (!normalizedUrl?.startsWith('/uploads/')) {
          skipped++;
          continue;
        }

        const localFilePath = path.resolve(
          process.cwd(),
          normalizedUrl.replace(/^\/+/, '')
        );
        if (!fs.existsSync(localFilePath)) {
          console.log(`❌ File not found: ${localFilePath}`);
          failed++;
          continue;
        }

        const newStoragePath = generateStoragePath(
          folder.schoolId,
          folder.classId,
          folder.name,
          file.fileName
        );

        try {
          const fileBuffer = fs.readFileSync(localFilePath);
          const result = await uploadFileToSupabase(
            fileBuffer,
            newStoragePath,
            file.fileType
          );
          record[field][i].fileUrl = result.storagePath;
          await record.save();
          migrated++;
          console.log(`✅ Migrated: ${file.fileName}`);
        } catch (error) {
          failed++;
          console.error(`❌ Failed: ${file.fileName}`, error.message);
        }
      }
    };

    for (const assignment of assignments) {
      await migrateRecordFiles(assignment, 'attachments', {
        schoolId: assignment.schoolId,
        classId: assignment.classId,
        name: 'assignments',
      });
    }

    for (const submission of submissions) {
      const assignment = submission.assignmentId;
      if (!assignment?.schoolId) {
        failed++;
        console.error(`❌ Assignment not found for submission ${submission._id}`);
        continue;
      }

      await migrateRecordFiles(submission, 'files', {
        schoolId: assignment.schoolId,
        classId: submission.classId,
        name: `submissions/${assignment._id}/${submission.studentId}`,
      });
    }

    console.log(`\n📊 MIGRATION REPORT:`);
    console.log(`✅ Migrated: ${migrated}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️ Skipped: ${skipped}`);

    process.exit(0);
  } catch (error) {
    console.error('Migration Error:', error);
    process.exit(1);
  }
};

migrateFiles();