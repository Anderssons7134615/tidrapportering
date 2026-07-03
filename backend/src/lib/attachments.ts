import fs from 'fs';

type AttachmentFile = {
  path: string;
};

type LoggerLike = {
  warn: (payload: unknown, message?: string) => void;
};

export function deleteAttachmentFiles(attachments: AttachmentFile[], logger?: LoggerLike) {
  for (const attachment of attachments) {
    try {
      if (attachment.path && fs.existsSync(attachment.path)) {
        fs.unlinkSync(attachment.path);
      }
    } catch (error) {
      logger?.warn({ error, path: attachment.path }, 'Kunde inte ta bort bilagefil');
    }
  }
}
