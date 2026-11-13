import { emailBody, formatField, getUserEmail } from "../../shared/taskEmails.mjs";

const WATCHED_FIELDS = ["title", "description", "priority", "deadline", "status"];

// Decides who to email for one change of a task row. Never notifies the person who made the change.
export async function buildNotifications(before, after) {
  if (!after) return taskDeleted(before);
  if (after.assignedTo && after.assignedTo !== before?.assignedTo) return taskAssigned(before, after);
  if (!before) return [];

  const changed = WATCHED_FIELDS.filter((field) => before[field] !== after[field]);
  if (changed.length === 0) return [];

  const actor = after.updatedBy;
  if (actor && actor === after.assignedTo) return statusUpdatedByAssignee(before, after, changed);
  return taskUpdatedByAdmin(before, after, changed);
}

const taskDeleted = (task) => {
  if (!task?.assigneeEmail) return [];
  return [{
    to: task.assigneeEmail,
    subject: `Task deleted: ${task.title}`,
    message: emailBody("A task assigned to you has been deleted.", task),
  }];
};

const taskAssigned = (before, after) => {
  const messages = [];
  if (after.assignedTo !== after.assignedBy) {
    messages.push({
      to: after.assigneeEmail,
      subject: `New task assigned: ${after.title}`,
      message: emailBody("A task has been assigned to you.", after),
    });
  }
  if (before?.assigneeEmail && before.assignedTo !== after.assignedBy) {
    messages.push({
      to: before.assigneeEmail,
      subject: `Task reassigned: ${after.title}`,
      message: emailBody("This task has been reassigned to someone else and is no longer yours.", after),
    });
  }
  return messages;
};

const statusUpdatedByAssignee = async (before, after, changed) => {
  if (!changed.includes("status") || after.createdBy === after.updatedBy) return [];
  return [{
    to: await getUserEmail(after.createdBy),
    subject: `Status update: ${after.title}`,
    message: emailBody(
      `${after.assigneeEmail} changed the status from ${formatField("status", before.status)} to ${formatField("status", after.status)}.`,
      after,
    ),
  }];
};

const taskUpdatedByAdmin = (before, after, changed) => {
  if (!after.assigneeEmail || after.updatedBy === after.assignedTo) return [];
  const lines = changed.map((field) =>
    field === "description"
      ? "- Description was updated"
      : `- ${field[0].toUpperCase()}${field.slice(1)}: ${formatField(field, before[field])} -> ${formatField(field, after[field])}`);
  return [{
    to: after.assigneeEmail,
    subject: `Task updated: ${after.title}`,
    message: emailBody("A task assigned to you has been updated:", after, lines),
  }];
};
