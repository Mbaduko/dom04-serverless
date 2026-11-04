import { handlecreateTask } from "./createTask.mjs";

const routes = {
    "POST /tasks": handlecreateTask
}

const handler = async (event) => {
    const route = [`${event.HttpMethod} ${event.resource}`]

    try {
        if (!route) 
            throw new HttpError(404, "ROUTE_NOT_FOUND", "Route not found");
        
        return await route(event)
    } catch (error) {
        console.error("ERROR::", error);
        return errorResponse(error);
    }
}