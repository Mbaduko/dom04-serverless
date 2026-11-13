import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { db, table } from "./db.mjs";

const STATUS_LABELS = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done" };

export const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: process.env.NOTIFICATION_TIME_ZONE || "UTC",
      timeZoneName: "short",
    })
    : "No deadline";

export const formatField = (field, value) => {
  if (field === "status") return STATUS_LABELS[value] ?? value;
  if (field === "deadline") return formatDate(value);
  return value ?? "(empty)";
};

export const taskDetails = (task) => [
  `Task: ${task.title}`,
  ...(task.description ? [`Description: ${task.description}`] : []),
  `Status: ${formatField("status", task.status)}`,
  `Priority: ${task.priority}`,
  `Deadline: ${formatDate(task.deadline)}`,
];

// Builds a plain-text email body: intro, optional extra lines, task details and a link to the app
export const emailBody = (intro, task, extra = []) =>
  [intro, "", ...extra, ...(extra.length ? [""] : []), ...taskDetails(task), "", `Open Task Manager: ${process.env.APP_URL}`].join("\n");

export const getUserEmail = async (userId) => {
  if (!userId) return undefined;
  const { Item } = await db.send(new GetCommand({ TableName: table("USERS_TABLE"), Key: { userId } }));
  return Item?.email;
};
