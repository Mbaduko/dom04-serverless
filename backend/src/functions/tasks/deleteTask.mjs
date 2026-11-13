import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { HttpError, respond } from "../../shared/helper.mjs";
import { db } from "../../shared/db.mjs";
import { getUser, requireAdmin } from "../../shared/auth.mjs";
import { getTaskId, TASKS_TABLE } from "./taskStore.mjs";
import { deleteTaskAttachments } from "../../shared/attachmentStore.mjs";

export async function handleDeleteTask(event) {
  const user = getUser(event);
  requireAdmin(user);

  const taskId = getTaskId(event);
  try {
    await db.send(new DeleteCommand({
      TableName: TASKS_TABLE,
      Key: { taskId },
      ConditionExpression: "attribute_exists(taskId)",
    }));
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      throw new HttpError(404, "TASK_NOT_FOUND", "Task not found");
    }
    throw error;
  }

  // The task is already gone, so a cleanup failure is logged rather than returned to the user
  try {
    await deleteTaskAttachments(taskId);
  } catch (error) {
    console.error("ATTACHMENT_CLEANUP_FAILED::", taskId, error);
  }

  return respond(204);
}
