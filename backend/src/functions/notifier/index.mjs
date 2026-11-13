import { unmarshall } from "@aws-sdk/util-dynamodb";
import { publishTo } from "../../shared/notifications.mjs";
import { buildNotifications } from "./rules.mjs";

// Triggered by the tasks table stream; reports the first failed record so Lambda retries from there
export const handler = async (event) => {
  for (const record of event.Records) {
    try {
      const { OldImage, NewImage } = record.dynamodb;
      const before = OldImage ? unmarshall(OldImage) : undefined;
      const after = NewImage ? unmarshall(NewImage) : undefined;

      const messages = await buildNotifications(before, after);
      for (const { to, subject, message } of messages) {
        if (await publishTo(to, subject, message)) console.log("NOTIFIED::", record.eventName, subject, to);
      }
    } catch (error) {
      console.error("NOTIFY_FAILED::", record.eventID, error);
      return { batchItemFailures: [{ itemIdentifier: record.dynamodb.SequenceNumber }] };
    }
  }
  return { batchItemFailures: [] };
};
