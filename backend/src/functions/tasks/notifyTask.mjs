import { HttpError, respond } from "../../shared/helper.mjs";
import { getUser, requireAdmin } from "../../shared/auth.mjs";
import { getTaskId, loadTask } from "./taskStore.mjs";

export async function handleNotifyTask(event) {
  const user = getUser(event);
  requireAdmin(user);

  const task = await loadTask(getTaskId(event));
  if (!task.assignedTo) {
    throw new HttpError(400, "TASK_NOT_ASSIGNED", "Assign the task before sending a notification");
  }

  // Notification delivery (SNS) is added in the notifications phase.
  return respond(202, {
    taskId: task.taskId,
    recipient: task.assigneeEmail,
    sent: false,
    message: "Notification accepted; delivery will be enabled with SNS",
  });
}
