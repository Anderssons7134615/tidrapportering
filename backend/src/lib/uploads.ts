import fs from 'fs';
import path from 'path';

export function getUploadDir() {
  if (process.env.UPLOAD_DIR) {
    return path.resolve(process.env.UPLOAD_DIR);
  }

  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === 'backend'
    ? path.resolve(cwd, '../uploads')
    : path.resolve(cwd, 'uploads');
}

export function ensureUploadDir() {
  const uploadDir = getUploadDir();
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}
