import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { MAX_FILE_SIZE, UPLOAD_DIR } from './env.js';
import { BLOCKED_FILE_EXTENSIONS } from '../utils/constants.js';
import { ValidationError } from '../utils/errors.js';
import fs from 'fs';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = UPLOAD_DIR || 'uploads';
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Stored under a random name — the user-supplied name is never used on disk
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

/**
 * Accept any document / archive / image / media file, but reject executables,
 * scripts and active web content (see BLOCKED_FILE_EXTENSIONS).
 * Downloads are always served as attachments, so files are never rendered by the browser.
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (BLOCKED_FILE_EXTENSIONS.includes(ext)) {
    return cb(new ValidationError(`File type "${ext}" is not allowed for security reasons`), false);
  }

  cb(null, true);
};

const limits = {
  fileSize: parseInt(MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
};

const upload = multer({
  storage,
  fileFilter,
  limits: { ...limits, files: 1 },
});

export const uploadDocuments = multer({
  storage,
  fileFilter,
  limits: { ...limits, files: 5 },
});

export default upload;
