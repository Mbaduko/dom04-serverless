import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { HttpError, respond } from "../../shared/helper.mjs";
import { db, table } from "../../shared/db.mjs";
import { getUser, requireAdmin } from "../../shared/auth.mjs";
import { subscribeEmail } from "../../shared/notifications.mjs";

const USERS_TABLE = table("USERS_TABLE");

export async function handleSubscribeUser(event) {
  requireAdmin(getUser(event));

  const userId = event.pathParameters?.userId;
  const { Item: user } = await db.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User not found");

  await subscribeEmail(user.email);

  return respond(202, { userId, email: user.email, notifications: "PENDING" });
}
