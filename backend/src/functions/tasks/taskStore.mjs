import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { HttpError } from "../../shared/helper.mjs";
import { db, table } from "../../shared/db.mjs";

export const TASKS_TABLE = table("TASKS_TABLE");
export const ASSIGNEE_INDEX = "assignedTo-createdAt-index";

export const getTaskId = (event) => {
  const taskId = event.pathParameters?.taskId;
  if (!taskId) throw new HttpError(400, "VALIDATION_ERROR", "taskId is required");
  return taskId;
};

export const loadTask = async (taskId) => {
  const { Item } = await db.send(new GetCommand({ TableName: TASKS_TABLE, Key: { taskId } }));
  if (!Item) throw new HttpError(404, "TASK_NOT_FOUND", "Task not found");
  return Item;
};

export const loadTaskForUser = async (taskId, user) => {
  const task = await loadTask(taskId);
  if (!user.isAdmin && task.assignedTo !== user.sub) {
    throw new HttpError(403, "FORBIDDEN", "You can only access tasks assigned to you");
  }
  return task;
};
