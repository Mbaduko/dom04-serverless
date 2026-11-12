import { respond } from "../../shared/helper.mjs";
import { getUser } from "../../shared/auth.mjs";
import { getTaskId, loadTaskForUser } from "./taskStore.mjs";

export async function handleGetTask(event) {
  const user = getUser(event);
  const task = await loadTaskForUser(getTaskId(event), user);
  return respond(200, task);
}
