import { HttpError, readBody, respond } from "../../shared/helper.mjs";
import { getUser } from "../../shared/auth.mjs";
import {
  ALLOWED_CONTENT_TYPES, MAX_ATTACHMENT_BYTES, createUploadTicket, deleteAttachment, listAttachments,
} from "../../shared/attachmentStore.mjs";
import { getTaskId, loadTaskForUser } from "./taskStore.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const invalid = (message) => new HttpError(400, "VALIDATION_ERROR", message);

// Keeps letters, digits, dots, dashes and underscores so the name is safe as part of an S3 key
const safeFileName = (name) => {
  if (typeof name !== "string" || !name.trim()) throw invalid("fileName is required");
  const cleaned = name.trim().split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-150);
  if (!cleaned) throw invalid("fileName is invalid");
  return cleaned;
};

export async function handleRequestUpload(event) {
  const taskId = getTaskId(event);
  await loadTaskForUser(taskId, getUser(event));

  const { fileName, contentType, size } = readBody(event);
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) throw invalid("This file type is not allowed");
  if (!Number.isInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
    throw invalid(`File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`);
  }

  return respond(201, await createUploadTicket(taskId, safeFileName(fileName), contentType));
}

export async function handleListAttachments(event) {
  const taskId = getTaskId(event);
  await loadTaskForUser(taskId, getUser(event));
  return respond(200, { items: await listAttachments(taskId) });
}

export async function handleDeleteAttachment(event) {
  const taskId = getTaskId(event);
  await loadTaskForUser(taskId, getUser(event));

  const attachmentId = event.pathParameters?.attachmentId;
  if (!UUID.test(attachmentId ?? "")) throw invalid("attachmentId is invalid");

  if ((await deleteAttachment(taskId, attachmentId)) === 0) {
    throw new HttpError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
  }
  return respond(204);
}
