import { HttpError, respond } from "../../shared/helper.mjs";
import { getUser, requireAdmin } from "../../shared/auth.mjs";
import { publishTo } from "../../shared/notifications.mjs";
import { emailBody } from "../../shared/taskEmails.mjs";
import { getTaskId, loadTask } from "./taskStore.mjs";

export async function handleNotifyTask(event) {
  const user = getUser(event);
  requireAdmin(user);

  const task = await loadTask(getTaskId(event));
  if (!task.assignedTo) {
    throw new HttpError(400, "TASK_NOT_ASSIGNED", "Assign the task before sending a notification");
  }

  await publishTo(
    task.assigneeEmail,
    `Reminder: ${task.title}`,
    emailBody("Your admin sent you a reminder about this task.", task),
  );

  return respond(202, { taskId: task.taskId, recipient: task.assigneeEmail, sent: true });
}
