import {DynamodbClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, PutCommand} from "@aws-sdk/lib-dynamodb";
import {RandomUUID} from "crypto";
import {readBody} from "../shared/helper.mjs";

const TABLE = process.env.TASKS_TABLE

if (!TABLE) 
    throw new Error("TASKS_TABLE environment variable is not set");

const db = new DynamoDBDocumentClient(new DynamodbClient({}));

export async function handleCreateTask(event) {
    const body = readBody(event);

    const task = {
        taskId: RandomUUID(),
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