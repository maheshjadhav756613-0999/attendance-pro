import {
  deleteFileFromSupabase,
  generateStoragePath,
  getSignedUrl,
  uploadFileToSupabase,
} from '../services/supabaseStorage.js';

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });

const isLegacyUrl = (url) =>
  /^https?:\/\//i.test(url) || url.startsWith('/uploads/');

export const validateUploadMetadata = (files) => {
  if (files === undefined) return [];
  if (!Array.isArray(files) || files.length > 5) {
    throw badRequest('Maximum 5 files allowed');
  }

  const allowedExtensions = new Set([
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.png', '.jpg', '.jpeg', '.webp', '.txt', '.csv', '.zip',
  ]);
  const allowedMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/octet-stream',
  ]);

  return files.map((file) => {
    if (
      !file ||
      typeof file.fileName !== 'string' ||
      !file.fileName.trim() ||
      typeof file.fileType !== 'string' ||
      (file.fileType && !allowedMimeTypes.has(file.fileType)) ||
      !Number.isFinite(Number(file.fileSize)) ||
      Number(file.fileSize) < 0 ||
      Number(file.fileSize) > 20 * 1024 * 1024
    ) {
      throw badRequest('Invalid file metadata or file exceeds the 20 MB limit');
    }

    const extension = file.fileName.match(/\.[^/.]+$/)?.[0]?.toLowerCase();
    if (!extension || !allowedExtensions.has(extension)) {
      throw badRequest(`File type not allowed: ${file.fileName}`);
    }

    return {
      fileName: file.fileName.trim(),
      fileType: file.fileType || 'application/octet-stream',
      fileSize: Number(file.fileSize),
    };
  });
};

export const uploadRequestFiles = async (
  files = [],
  schoolId,
  classId,
  folder
) => {
  const metadata = validateUploadMetadata(
    files.map((file) => ({
      fileName: file.originalname,
      fileType: file.mimetype || 'application/octet-stream',
      fileSize: file.size,
    }))
  );
  const uploaded = [];

  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const storagePath = generateStoragePath(
        schoolId,
        classId,
        folder,
        file.originalname
      );
      const result = await uploadFileToSupabase(
        file.buffer,
        storagePath,
        file.mimetype || 'application/octet-stream'
      );
      uploaded.push({ ...metadata[index], fileUrl: result.storagePath });
    }
  } catch (error) {
    await deleteStoredFiles(uploaded);
    throw error;
  }

  return uploaded;
};

export const deleteStoredFiles = async (files = []) => {
  const results = await Promise.allSettled(
    files.map((file) => deleteFileFromSupabase(file.fileUrl))
  );
  const failedDeletes = results.filter((result) => result.status === 'rejected');
  if (failedDeletes.length) {
    failedDeletes.forEach((result) =>
      console.error('❌ Failed to clean up uploaded Supabase file:', result.reason)
    );
    throw new Error(`Failed to clean up ${failedDeletes.length} uploaded file(s)`);
  }
};

export const signStorageFiles = async (files = []) =>
  Promise.all(
    files.map(async (file) => {
      if (!file.fileUrl || isLegacyUrl(file.fileUrl)) return file;
      return { ...file, fileUrl: await getSignedUrl(file.fileUrl) };
    })
  );

export const signAssignmentFiles = async (assignment) => {
  const data = assignment?.toObject ? assignment.toObject() : { ...assignment };
  if (data.attachments?.length) {
    data.attachments = await signStorageFiles(data.attachments);
  }
  return data;
};

export const signSubmissionFiles = async (submission) => {
  const data = submission?.toObject ? submission.toObject() : { ...submission };
  if (data.files?.length) {
    data.files = await signStorageFiles(data.files);
  }
  if (data.photoUrl && !isLegacyUrl(data.photoUrl)) {
    data.photoUrl = await getSignedUrl(data.photoUrl);
  }
  if (data.assignmentId?.attachments?.length) {
    data.assignmentId = await signAssignmentFiles(data.assignmentId);
  }
  return data;
};
