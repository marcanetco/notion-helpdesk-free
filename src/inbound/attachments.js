// Attachments of an inbound email, stored on its Ticket through the Notion
// File Upload API: start an upload per file, send the file, then attach the
// upload ids to the Ticket. Pure functions, no imports (ADR 0008).

const FILE_UPLOADS = 'https://api.notion.com/v1/file_uploads';

// n8n's IMAP trigger puts attachment n in binary key attachment_<n>.
const ATTACHMENT_KEY = /^attachment_(\d+)$/;

const fallbackName = (index, mimeType) => {
  const subtype = /^[a-z]+\/([a-z0-9]+)$/i.exec(mimeType ?? '')?.[1];
  return `attachment-${index + 1}${subtype && subtype !== 'octet' && !/stream/.test(subtype) ? `.${subtype}` : ''}`;
};

// The request's multipart body (the file itself) is set in the Send file node.
export function sendFileRequest(uploadId) {
  return { method: 'POST', url: `${FILE_UPLOADS}/${uploadId}/send` };
}

export function startUploadRequest(filename, contentType) {
  return {
    method: 'POST',
    url: FILE_UPLOADS,
    body: { mode: 'single_part', filename, content_type: contentType },
  };
}

const attachmentFiles = (binary) => Object.entries(binary ?? {})
  .map(([key, file]) => ({ n: Number(ATTACHMENT_KEY.exec(key)?.[1]), file }))
  .filter(({ n }) => Number.isInteger(n))
  .sort((a, b) => a.n - b.n);

export const attachmentCount = (binary) => attachmentFiles(binary).length;

// One n8n item per attachment, each pointing back to the email (item 0 of the
// loop's batch of one) so later nodes can still reach the email's data.
export function attachmentItems(binary) {
  return attachmentFiles(binary).map(({ file }, i) => {
    const filename = file.fileName || fallbackName(i, file.mimeType);
    const contentType = file.mimeType || 'application/octet-stream';
    return {
      json: { filename, startUpload: startUploadRequest(filename, contentType) },
      binary: { file },
      pairedItem: { item: 0 },
    };
  });
}

// uploads: [{ filename, started, sent }], the Notion answers to the start and
// send steps, or n8n's { error } for a step that failed (the nodes continue on error).
export function collectUploads(uploads) {
  const files = [];
  const failed = [];
  for (const { filename, started, sent } of uploads) {
    if (sent?.object === 'file_upload' && sent.status === 'uploaded') files.push({ id: sent.id, name: filename });
    else failed.push({ name: filename, reason: started?.error?.message || sent?.error?.message || `upload status: ${sent?.status ?? 'unknown'}` });
  }
  return { files, failed };
}
