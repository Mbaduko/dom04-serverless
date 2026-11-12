import { handleCreateTask } from "./createTask.mjs";
import { handleListTasks } from "./listTasks.mjs";
import { handleGetTask } from "./getTask.mjs";
import { handleUpdateTask } from "./updateTask.mjs";
import { handleDeleteTask } from "./deleteTask.mjs";
import { handleAssignTask } from "./assignTask.mjs";
import { handleNotifyTask } from "./notifyTask.mjs";
import { errorResponse, HttpError } from "../../shared/helper.mjs";

const routes = {
  "POST /tasks": handleCreateTask,
  "GET /tasks": handleListTasks,
  "GET /tasks/{taskId}": handleGetTask,
  "PUT /tasks/{taskId}": handleUpdateTask,
  "DELETE /tasks/{taskId}": handleDeleteTask,
  "POST /tasks/{taskId}/assign": handleAssignTask,
  "POST /tasks/{taskId}/notify": handleNotifyTask,
};

export const handler = async (event) => {
  const route = routes[`${event.httpMethod} ${event.resource}`];

  try {
    if (!route) throw new HttpError(404, "ROUTE_NOT_FOUND", "Route not found");
    return await route(event);
  } catch (error) {
    console.error("ERROR::", error);
    return errorResponse(error);
  }
};
