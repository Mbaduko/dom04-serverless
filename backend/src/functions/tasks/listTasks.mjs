import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { respond } from "../../shared/helper.mjs";
import { db, decodeNextToken, encodeNextToken, parseLimit } from "../../shared/db.mjs";
import { getUser } from "../../shared/auth.mjs";
import { optionalEnum, STATUSES } from "../../shared/validation.mjs";
import { ASSIGNEE_INDEX, TASKS_TABLE } from "./taskStore.mjs";

export async function handleListTasks(event) {
  const user = getUser(event);
  const query = event.queryStringParameters ?? {};

  const status = optionalEnum(query.status, "status", STATUSES);
  const limit = parseLimit(query.limit);
  const startKey = decodeNextToken(query.nextToken);

  const statusFilter = status
    ? { FilterExpression: "#status = :status", ExpressionAttributeNames: { "#status": "status" } }
    : {};

  let result;

  if (user.isAdmin && !query.assignedTo) {
    result = await db.send(new ScanCommand({
      TableName: TASKS_TABLE,
      Limit: limit,
      ExclusiveStartKey: startKey,
      ...statusFilter,
      ...(status && { ExpressionAttributeValues: { ":status": status } }),
    }));
  } else {
    const assignee = user.isAdmin ? query.assignedTo : user.sub;
    result = await db.send(new QueryCommand({
      TableName: TASKS_TABLE,
      IndexName: ASSIGNEE_INDEX,
      KeyConditionExpression: "assignedTo = :assignee",
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: startKey,
      ...statusFilter,
      ExpressionAttributeValues: {
        ":assignee": assignee,
        ...(status && { ":status": status }),
      },
    }));
  }

  return respond(200, {
    items: result.Items ?? [],
    nextToken: encodeNextToken(result.LastEvaluatedKey),
  });
}
