import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { respond } from "../../shared/helper.mjs";
import { db, decodeNextToken, encodeNextToken, parseLimit, table } from "../../shared/db.mjs";
import { getUser, requireAdmin, ROLES } from "../../shared/auth.mjs";
import { optionalEnum } from "../../shared/validation.mjs";

const USERS_TABLE = table("USERS_TABLE");

export async function handleListUsers(event) {
  const admin = getUser(event);
  requireAdmin(admin);

  const query = event.queryStringParameters ?? {};
  const role = optionalEnum(query.role, "role", Object.values(ROLES));

  const result = await db.send(new ScanCommand({
    TableName: USERS_TABLE,
    Limit: parseLimit(query.limit),
    ExclusiveStartKey: decodeNextToken(query.nextToken),
    ...(role && {
      FilterExpression: "#role = :role",
      ExpressionAttributeNames: { "#role": "role" },
      ExpressionAttributeValues: { ":role": role },
    }),
  }));

  return respond(200, {
    items: result.Items ?? [],
    nextToken: encodeNextToken(result.LastEvaluatedKey),
  });
}
