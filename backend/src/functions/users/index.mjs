import { handleCreateUser } from "./createUser.mjs";
import { handleListUsers } from "./listUsers.mjs";
import { errorResponse, HttpError } from "../../shared/helper.mjs";

const routes = {
  "POST /users": handleCreateUser,
  "GET /users": handleListUsers,
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
