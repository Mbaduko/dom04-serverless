import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { HttpError, respond } from "../../shared/helper.mjs";
import { db } from "../../shared/db.mjs";
import { getUser, requireAdmin } from "../../shared/auth.mjs";
import { getTaskId, TASKS_TABLE } from "./taskStore.mjs";

export async function handleDeleteTask(event) {
  const user = getUser(event);
  requireAdmin(user);

  try {
    await db.send(new DeleteCommand({
      TableName: TASKS_TABLE,
      Key: { taskId: getTaskId(event) },
      ConditionExpression: "attribute_exists(taskId)",
    }));
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      throw new HttpError(404, "TASK_NOT_FOUND", "Task not found");
    }
    throw error;
  }

  return respond(204);
}
