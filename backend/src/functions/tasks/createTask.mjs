import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, PutCommand} from "@aws-sdk/lib-dynamodb";
import {randomUUID} from "crypto";
import {readBody, respond, HttpError} from "../../shared/helper.mjs";

const TABLE = process.env.TASKS_TABLE

if (!TABLE) 
    throw new HttpError(500, "INTERNAL_ERROR", "TASKS_TABLE environment variable is not set");

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function handleCreateTask(event) {
    const body = readBody(event);

    const task = {
        taskId: randomUUID(),
        ...body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }

    await db.send(new PutCommand({
        TableName: TABLE,
        Item: task
    }));

    return respond(201, task);
}