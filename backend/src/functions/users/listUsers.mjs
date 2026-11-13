import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { respond } from "../../shared/helper.mjs";
import { db, decodeNextToken, encodeNextToken, parseLimit, table } from "../../shared/db.mjs";
import { getUser, requireAdmin, ROLES } from "../../shared/auth.mjs";
import { optionalEnum } from "../../shared/validation.mjs";
import { subscriptionStatuses } from "../../shared/notifications.mjs";

const USERS_TABLE = table("USERS_TABLE");

export async function handleListUsers(event) {
  const admin = getUser(event);
  requireAdmin(admin);

  const query = event.queryStringParameters ?? {};
  const role = optionalEnum(query.role, "role", Object.values(ROLES));

  const [result, statuses] = await Promise.all([db.send(new ScanCommand({
    TableName: USERS_TABLE,
    Limit: parseLimit(query.limit),
    ExclusiveStartKey: decodeNextToken(query.nextToken),
    ...(role && {
      FilterExpression: "#role = :role",
      ExpressionAttributeNames: { "#role": "role" },
      ExpressionAttributeValues: { ":role": role },
    }),
  })), subscriptionStatuses()]);

  return respond(200, {
    items: (result.Items ?? []).map((user) => ({ ...user, notifications: statuses[user.email] ?? "NOT_SUBSCRIBED" })),
    nextToken: encodeNextToken(result.LastEvaluatedKey),
  });
}
