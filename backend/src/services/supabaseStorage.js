import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';

dotenv.config();

const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'homework-files';
let supabase;

const getSupabaseClient = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured');
  }

  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return supabase;
};

/**
 * Generate a unique, safe file path
 * Format: schoolId/classId/homeworkId/UUID.ext
 */
export const generateStoragePath = (schoolId, classId, folder, originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();
  return `${schoolId}/${classId}/${folder}/${timestamp}-${uniqueId}${ext}`;
};

/**
 * Upload file to Supabase Storage
 * @param {Buffer} fileBuffer - File buffer from Multer memory storage
 * @param {String} storagePath - Path inside the bucket
 * @param {String} mimeType - File MIME type
 */
export const uploadFileToSupabase = async (fileBuffer, storagePath, mimeType) => {
  try {
    const { data, error } = await getSupabaseClient().storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error('❌ Supabase Upload Error:', error.message);
      throw new Error(`Supabase Upload Error: ${error.message}`);
    }

    return {
      success: true,
      storagePath: data.path,
      bucket: BUCKET_NAME,
    };
  } catch (error) {
    console.error('❌ Storage Service Error:', error);
    throw error;
  }
};

/**
 * Generate a Signed URL for secure viewing (Expires in 1 hour)
 * @param {String} storagePath - Path inside the bucket
 * @param {Number} expiresIn - Seconds (Default: 3600 = 1 hour)
 */
export const getSignedUrl = async (storagePath, expiresIn = 3600) => {
  try {
    const { data, error } = await getSupabaseClient().storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error('❌ Supabase Signed URL Error:', error.message);
      throw new Error(`Signed URL Error: ${error.message}`);
    }

    return data.signedUrl;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete file from Supabase
 * @param {String} storagePath - Path inside the bucket
 */
export const deleteFileFromSupabase = async (storagePath) => {
  try {
    const { data, error } = await getSupabaseClient().storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      console.error('❌ Supabase Delete Error:', error.message);
      throw new Error(`Delete Error: ${error.message}`);
    }

    return { success: true, data };
  } catch (error) {
    throw error;
  }
};