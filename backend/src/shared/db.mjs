import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { HttpError } from "./helper.mjs";

export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const table = (envVar) => {
  const name = process.env[envVar];
  if (!name) throw new Error(`${envVar} environment variable is not set`);
  return name;
};

export const encodeNextToken = (lastKey) =>
  lastKey ? Buffer.from(JSON.stringify(lastKey)).toString("base64url") : undefined;

export const decodeNextToken = (token) => {
  if (!token) return undefined;
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_NEXT_TOKEN", "nextToken is invalid");
  }
};

export const parseLimit = (value, max = 100) => {
  if (value === undefined) return 50;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw new HttpError(400, "VALIDATION_ERROR", `limit must be an integer between 1 and ${max}`);
  }
  return limit;
};
