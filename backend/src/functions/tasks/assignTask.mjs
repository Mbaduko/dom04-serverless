import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { HttpError, readBody, respond } from "../../shared/helper.mjs";
import { db, table } from "../../shared/db.mjs";
import { getUser, requireAdmin } from "../../shared/auth.mjs";
import { getTaskId, loadTask, TASKS_TABLE } from "./taskStore.mjs";

const USERS_TABLE = table("USERS_TABLE");

export async function handleAssignTask(event) {
  const user = getUser(event);
  requireAdmin(user);

  const taskId = getTaskId(event);
  const { userId } = readBody(event);
  if (typeof userId !== "string" || !userId) {
    throw new HttpError(400, "VALIDATION_ERROR", "userId is required");
  }

  await loadTask(taskId);

  const { Item: assignee } = await db.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
  if (!assignee) throw new HttpError(404, "USER_NOT_FOUND", "User not found");

  const now = new Date().toISOString();
  const { Attributes } = await db.send(new UpdateCommand({
    TableName: TASKS_TABLE,
    Key: { taskId },
    UpdateExpression:
      "SET assignedTo = :userId, assigneeEmail = :email, assignedAt = :now, assignedBy = :by, updatedAt = :now",
    ConditionExpression: "attribute_exists(taskId)",
    ExpressionAttributeValues: {
      ":userId": assignee.userId,
      ":email": assignee.email,
      ":now": now,
      ":by": user.sub,
    },
    ReturnValues: "ALL_NEW",
  }));

  return respond(200, Attributes);
}
