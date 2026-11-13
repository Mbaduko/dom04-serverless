import { ListSubscriptionsByTopicCommand, PublishCommand, SNSClient, SubscribeCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({});
const topicArn = () => {
  if (!process.env.TOPIC_ARN) throw new Error("Missing environment variable TOPIC_ARN");
  return process.env.TOPIC_ARN;
};

// Subscribes an email to the topic, only receiving messages whose `recipient` attribute matches it.
// Calling it again for a pending subscription re-sends the confirmation email.
export async function subscribeEmail(email) {
  await sns.send(new SubscribeCommand({
    TopicArn: topicArn(),
    Protocol: "email",
    Endpoint: email,
    Attributes: { FilterPolicy: JSON.stringify({ recipient: [email] }) },
  }));
}

// Returns { email: "CONFIRMED" | "PENDING" } for every email subscription on the topic
export async function subscriptionStatuses() {
  const statuses = {};
  let NextToken;
  do {
    const page = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: topicArn(), NextToken }));
    for (const sub of page.Subscriptions ?? []) {
      if (sub.Protocol !== "email") continue;
      statuses[sub.Endpoint.toLowerCase()] = sub.SubscriptionArn.startsWith("arn:") ? "CONFIRMED" : "PENDING";
    }
    NextToken = page.NextToken;
  } while (NextToken);
  return statuses;
}

// Publishes one email; the `recipient` attribute makes SNS deliver it only to that address's subscription
export async function publishTo(email, subject, message) {
  if (!email) return false;
  await sns.send(new PublishCommand({
    TopicArn: topicArn(),
    Subject: subject.replace(/[^\x20-\x7E]/g, "").slice(0, 100),
    Message: message,
    MessageAttributes: { recipient: { DataType: "String", StringValue: email.toLowerCase() } },
  }));
  return true;
}
