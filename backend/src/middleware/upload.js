import multer from 'multer';

const allowedExtensions =
  /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|png|jpe?g|webp|txt|csv|zip)$/i;

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, callback) => {
    if (
      allowedMimeTypes.has(file.mimetype) ||
      allowedExtensions.test(file.originalname)
    ) {
      callback(null, true);
      return;
    }

    callback(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

export const uploadFiles = (fieldName) => (req, res, next) => {
  upload.array(fieldName, 5)(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next();
  });
};
