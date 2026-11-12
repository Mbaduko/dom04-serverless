import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { readBody, respond } from "../../shared/helper.mjs";
import { db } from "../../shared/db.mjs";
import { getUser, requireAdmin } from "../../shared/auth.mjs";
import { validateNewTask } from "../../shared/validation.mjs";
import { TASKS_TABLE } from "./taskStore.mjs";

export async function handleCreateTask(event) {
  const user = getUser(event);
  requireAdmin(user);

  const input = validateNewTask(readBody(event));
  const now = new Date().toISOString();

  const task = {
    ...input,
    taskId: randomUUID(),
    status: "TODO",
    createdBy: user.sub,
    createdAt: now,
    updatedAt: now,
  };

  await db.send(new PutCommand({
    TableName: TASKS_TABLE,
    Item: task,
    ConditionExpression: "attribute_not_exists(taskId)",
  }));

  return respond(201, task);
}
