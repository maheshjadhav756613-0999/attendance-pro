import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Folders तयार कर
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/assignments';
    if (req.uploadType === 'submission') {
      folder = 'uploads/submissions';
    }
    ensureDir(folder);
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter — सगळ्या formats allow
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
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
  ];

  const allowedExts = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|png|jpe?g|webp|txt|csv|zip)$/i;

  if (
    allowedTypes.includes(file.mimetype) ||
    allowedExts.test(file.originalname)
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not allowed: ${file.mimetype}. Allowed: PDF, Word, Excel, PowerPoint, PNG, JPEG, WEBP, TXT, CSV, ZIP`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
    files: 5,
  },
});

export default upload;