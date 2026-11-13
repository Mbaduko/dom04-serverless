import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { readBody, respond } from "../../shared/helper.mjs";
import { db } from "../../shared/db.mjs";
import { getUser } from "../../shared/auth.mjs";
import { validateTaskUpdate } from "../../shared/validation.mjs";
import { getTaskId, loadTaskForUser, TASKS_TABLE } from "./taskStore.mjs";

export async function handleUpdateTask(event) {
  const user = getUser(event);
  const taskId = getTaskId(event);
  const changes = validateTaskUpdate(readBody(event), user.isAdmin);

  const task = await loadTaskForUser(taskId, user);
  const now = new Date().toISOString();

  changes.updatedAt = now;
  changes.updatedBy = user.sub;
  if (changes.status === "DONE" && task.status !== "DONE") changes.completedAt = now;

  const remove = changes.status && changes.status !== "DONE" && task.completedAt ? ["completedAt"] : [];
  // A new deadline gets fresh "due soon" and "overdue" reminders
  if (changes.deadline && changes.deadline !== task.deadline) remove.push("dueSoonNotifiedAt", "overdueNotifiedAt");

  const names = {};
  const values = {};
  const sets = Object.entries(changes).map(([field, value]) => {
    names[`#${field}`] = field;
    values[`:${field}`] = value;
    return `#${field} = :${field}`;
  });
  remove.forEach((field) => { names[`#${field}`] = field; });

  const { Attributes } = await db.send(new UpdateCommand({
    TableName: TASKS_TABLE,
    Key: { taskId },
    UpdateExpression: `SET ${sets.join(", ")}${remove.length ? ` REMOVE ${remove.map((f) => `#${f}`).join(", ")}` : ""}`,
    ConditionExpression: "attribute_exists(taskId)",
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ReturnValues: "ALL_NEW",
  }));

  return respond(200, Attributes);
}
