import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { HttpError, readBody, respond } from "../../shared/helper.mjs";
import { db, table } from "../../shared/db.mjs";
import { getUser, requireAdmin, ROLES } from "../../shared/auth.mjs";
import { validateNewUser } from "../../shared/validation.mjs";
import { subscribeEmail } from "../../shared/notifications.mjs";

const USERS_TABLE = table("USERS_TABLE");
const USER_POOL_ID = table("USER_POOL_ID");
const cognito = new CognitoIdentityProviderClient({});

export async function handleCreateUser(event) {
  const admin = getUser(event);
  requireAdmin(admin);

  const { email, name, role } = validateNewUser(readBody(event), Object.values(ROLES));

  let created;
  try {
    created = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      DesiredDeliveryMediums: ["EMAIL"],
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        ...(name ? [{ Name: "name", Value: name }] : []),
      ],
    }));
  } catch (error) {
    if (error.name === "UsernameExistsException") {
      throw new HttpError(409, "USER_EXISTS", "A user with this email already exists");
    }
    throw error;
  }

  const userId = created.User.Attributes.find((attr) => attr.Name === "sub").Value;

  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: USER_POOL_ID,
    Username: userId,
    GroupName: role,
  }));

  const profile = {
    userId,
    email,
    name,
    role,
    status: created.User.UserStatus,
    createdBy: admin.sub,
    createdAt: new Date().toISOString(),
  };

  await db.send(new PutCommand({ TableName: USERS_TABLE, Item: profile }));

  // The user already exists at this point, so a failed subscription must not fail the request
  let notifications = "PENDING";
  try {
    await subscribeEmail(email);
  } catch (error) {
    console.error("SUBSCRIBE_FAILED::", error);
    notifications = "NOT_SUBSCRIBED";
  }

  return respond(201, { ...profile, notifications });
}
