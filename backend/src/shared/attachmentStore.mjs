import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { table } from "./db.mjs";

const s3 = new S3Client({});
const bucket = () => table("ATTACHMENTS_BUCKET");
const URL_TTL_SECONDS = 300;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// Every file of a task lives under tasks/{taskId}/{attachmentId}/{fileName}, so S3 itself is the list
const taskPrefix = (taskId) => `tasks/${taskId}/`;

// One-time upload ticket: S3 rejects the upload unless it matches the size limit and declared type
export async function createUploadTicket(taskId, fileName, contentType) {
  const attachmentId = randomUUID();
  const key = `${taskPrefix(taskId)}${attachmentId}/${fileName}`;
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: bucket(),
    Key: key,
    Fields: { "Content-Type": contentType },
    Conditions: [["content-length-range", 1, MAX_ATTACHMENT_BYTES], ["eq", "$Content-Type", contentType]],
    Expires: URL_TTL_SECONDS,
  });
  return { attachmentId, fileName, upload: { url, fields }, expiresIn: URL_TTL_SECONDS };
}

const listObjects = async (prefix) => {
  const objects = [];
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken }));
    objects.push(...(page.Contents ?? []));
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return objects;
};

// Lists a task's files, each with a short-lived download link
export async function listAttachments(taskId) {
  const objects = await listObjects(taskPrefix(taskId));
  const items = await Promise.all(objects.map(async (object) => {
    const [, , attachmentId, ...nameParts] = object.Key.split("/");
    const fileName = nameParts.join("/");
    const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: bucket(),
      Key: object.Key,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    }), { expiresIn: URL_TTL_SECONDS });
    return { attachmentId, fileName, size: object.Size, uploadedAt: object.LastModified?.toISOString(), downloadUrl };
  }));
  return items.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

const deleteObjects = async (objects) => {
  for (let i = 0; i < objects.length; i += 1000) {
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: objects.slice(i, i + 1000).map(({ Key }) => ({ Key })), Quiet: true },
    }));
  }
  return objects.length;
};

export const deleteAttachment = async (taskId, attachmentId) =>
  deleteObjects(await listObjects(`${taskPrefix(taskId)}${attachmentId}/`));

export const deleteTaskAttachments = async (taskId) => deleteObjects(await listObjects(taskPrefix(taskId)));
