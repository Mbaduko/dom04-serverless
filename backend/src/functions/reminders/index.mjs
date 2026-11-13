import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, table } from "../../shared/db.mjs";
import { publishTo } from "../../shared/notifications.mjs";
import { emailBody, formatDate, getUserEmail } from "../../shared/taskEmails.mjs";

const TASKS_TABLE = table("TASKS_TABLE");
const STATUS_INDEX = "status-deadline-index";
const OPEN_STATUSES = ["TODO", "IN_PROGRESS"];

// Runs on a schedule: emails "due soon" and "overdue" reminders once per task deadline
export const handler = async () => {
  const now = new Date().toISOString();
  const windowHours = Number(process.env.REMINDER_WINDOW_HOURS || 24);
  const windowEnd = new Date(Date.now() + windowHours * 3600 * 1000).toISOString();
  let sent = 0;

  for (const status of OPEN_STATUSES) {
    for (const task of await openTasksDueBefore(status, windowEnd)) {
      if (task.deadline <= now) {
        if (!task.overdueNotifiedAt) sent += await remind(task, "overdueNotifiedAt", await overdueMessages(task));
      } else if (!task.dueSoonNotifiedAt && task.assigneeEmail) {
        sent += await remind(task, "dueSoonNotifiedAt", dueSoonMessages(task));
      }
    }
  }

  console.log("REMINDERS_SENT::", sent);
  return { sent };
};

const openTasksDueBefore = async (status, windowEnd) => {
  const tasks = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new QueryCommand({
      TableName: TASKS_TABLE,
      IndexName: STATUS_INDEX,
      KeyConditionExpression: "#status = :status AND #deadline <= :end",
      ExpressionAttributeNames: { "#status": "status", "#deadline": "deadline" },
      ExpressionAttributeValues: { ":status": status, ":end": windowEnd },
      ExclusiveStartKey,
    }));
    tasks.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return tasks;
};

const dueSoonMessages = (task) => [{
  to: task.assigneeEmail,
  subject: `Due soon: ${task.title}`,
  message: emailBody(`This task is due on ${formatDate(task.deadline)}.`, task),
}];

const overdueMessages = async (task) => {
  const messages = [];
  if (task.assigneeEmail) {
    messages.push({
      to: task.assigneeEmail,
      subject: `Overdue: ${task.title}`,
      message: emailBody(`This task was due on ${formatDate(task.deadline)} and is not done yet.`, task),
    });
  }
  if (task.createdBy !== task.assignedTo) {
    messages.push({
      to: await getUserEmail(task.createdBy),
      subject: `Overdue: ${task.title}`,
      message: emailBody(
        `This task was due on ${formatDate(task.deadline)} and is not done yet.`,
        task,
        [`Assigned to: ${task.assigneeEmail ?? "nobody"}`],
      ),
    });
  }
  return messages;
};

// Marks the task first so overlapping runs can't double-send; unmarks it if sending fails so the next run retries
const remind = async (task, flag, messages) => {
  try {
    await db.send(new UpdateCommand({
      TableName: TASKS_TABLE,
      Key: { taskId: task.taskId },
      UpdateExpression: "SET #flag = :now",
      ConditionExpression: "attribute_not_exists(#flag) AND #deadline = :deadline",
      ExpressionAttributeNames: { "#flag": flag, "#deadline": "deadline" },
      ExpressionAttributeValues: { ":now": new Date().toISOString(), ":deadline": task.deadline },
    }));
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return 0;
    throw error;
  }

  try {
    let count = 0;
    for (const { to, subject, message } of messages) {
      if (await publishTo(to, subject, message)) count++;
    }
    console.log("REMINDED::", flag, task.taskId, count);
    return count;
  } catch (error) {
    console.error("REMINDER_FAILED::", task.taskId, error);
    await db.send(new UpdateCommand({
      TableName: TASKS_TABLE,
      Key: { taskId: task.taskId },
      UpdateExpression: "REMOVE #flag",
      ExpressionAttributeNames: { "#flag": flag },
    }));
    return 0;
  }
};
