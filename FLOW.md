# Architecture and Data Flow

How the services of the Task Management System work together, told as the journey of data from one service to another.

## The big map

```
                         ┌──────────────┐
   User's browser ──────▶│  CloudFront  │──────▶ S3 (frontend files)
        │                └──────────────┘
        │ login
        ▼
   ┌──────────┐
   │ Cognito  │  (checks password, gives tokens)
   └──────────┘
        │ token
        ▼
   ┌─────────────┐   checks token   ┌──────────┐
   │ API Gateway │ ───────────────▶ │ Cognito  │
   └─────────────┘                  └──────────┘
        │
        ├──▶ Tasks Lambda ──▶ DynamoDB (tasks) ──stream──▶ Notifier Lambda ──┐
        │         ├──────────▶ S3 (attachments: upload/download tickets)     │
        │         └────────────────────────────────────────── (Notify) ─────┤
        │                                                                    ├──▶ SNS ──▶ Email
        └──▶ Users Lambda ──▶ Cognito (create user)                          │
                  ├────────▶ DynamoDB (users)                                │
                  └────────▶ SNS (subscribe) ────────────────────────────────┤
                                                                             │
   EventBridge Scheduler (every hour) ──▶ Reminders Lambda ──▶ DynamoDB ─────┘

   Browser ──(with a ticket)──▶ S3 attachments bucket   (files go directly, not through the API)

   All Lambdas ──▶ CloudWatch Logs          IAM = who may talk to whom
```

---

## Journey 1: Opening the app

```
Browser ──▶ CloudFront ──▶ S3
```

1. The user opens the CloudFront URL.
2. **CloudFront** (a fast delivery network) asks the **S3 bucket** for the website files (`index.html`, JavaScript, CSS).
3. The S3 bucket is **private**. Only CloudFront is allowed to read it (bucket policy with Origin Access Control).
4. The app also loads **`config.json`** from S3. It holds the Cognito IDs and the API URL, so the app knows where to log in and where to send requests.

**Data moving:** website files, S3 → CloudFront → browser.

---

## Journey 2: Logging in

```
Browser ──▶ Cognito ──▶ Browser (tokens)
```

1. The user types email and password in the login form (Amplify `<Authenticator>`).
2. The browser talks **directly to Cognito**. No Lambda is involved.
3. Cognito checks the password and returns **tokens**. The **ID token** says who the user is (`sub`, `email`) and their group (`Admin` / `TeamMember`).
4. The tokens are saved in the browser's localStorage.

**Data moving:** email + password → Cognito, tokens → browser.

---

## Journey 3: Using the app (e.g. "create a task")

```
Browser ──token──▶ API Gateway ──▶ (Cognito check) ──▶ Tasks Lambda ──▶ DynamoDB
```

1. The browser sends `POST /tasks` with the **ID token** in the `Authorization` header.
2. **API Gateway** asks the **Cognito authorizer**: "Is this token real and not expired?" If not, it returns **401** and nothing else runs.
3. If the token is valid, API Gateway passes the request and the user's info (claims) to the **tasks Lambda**.
4. The Lambda checks the **role** (only an Admin may create), validates the input, and saves the task in **DynamoDB**.
5. The answer travels back: Lambda → API Gateway → browser.

**Data moving:** request + token in, task saved to DynamoDB, result back out.

---

## Journey 4: Inviting a team member

```
Browser ──▶ API Gateway ──▶ Users Lambda ──┬──▶ Cognito   (create login → invite email)
                                           ├──▶ DynamoDB  (save profile)
                                           └──▶ SNS       (subscribe → confirm email)
```

One request fans out to three services. The new person receives **two emails**: a temporary password from Cognito, and a "Confirm subscription" email from SNS. They only receive notifications after confirming.

---

## Journey 5: Automatic notifications (task changed)

```
Tasks Lambda ──▶ DynamoDB ──stream──▶ Notifier Lambda ──▶ SNS ──▶ Email
```

1. The admin assigns a task, so the tasks Lambda updates the row in DynamoDB. **The user's request ends here** and the answer returns quickly.
2. DynamoDB records the change (**before and after**) in its **stream**.
3. AWS hands that record to the **notifier Lambda**.
4. The notifier compares before and after, e.g. "the assignee changed, so tell the new assignee".
5. It **publishes** to **SNS** with the message attribute `recipient = member's email`.
6. SNS delivers only to the subscription whose filter policy matches, and **the email arrives**.

The person clicking never waits for the email. It happens **in the background**.

| Change detected | Who is notified |
|---|---|
| Task assigned | New assignee |
| Task reassigned | New assignee and previous assignee |
| Member changed status | Admin who created the task |
| Admin edited the task | Assignee |
| Task deleted | Assignee |

The person who made the change is never notified.

---

## Journey 6: The Notify button

```
Browser ──▶ API Gateway ──▶ Tasks Lambda ──▶ SNS ──▶ Email
```

No data changes, so there's no stream involved. The tasks Lambda publishes to SNS **directly**.

---

## Journey 7: Deadline reminders (nobody clicks anything)

```
EventBridge Scheduler ──(every hour)──▶ Reminders Lambda ──▶ DynamoDB (find + mark) ──▶ SNS ──▶ Email
```

1. The **scheduler** wakes up every hour and invokes the reminders Lambda.
2. The Lambda queries DynamoDB (`status-deadline-index`) for **open tasks due within 24 hours or overdue**.
3. It **marks** each task (`dueSoonNotifiedAt` / `overdueNotifiedAt`) so it never sends twice, then **publishes** to SNS.
   - Due soon → assignee
   - Overdue → assignee and admin

---

## Journey 8: File attachments

```
Browser ──"I want to upload"──▶ API Gateway ──▶ Tasks Lambda ──▶ upload ticket
Browser ──file (directly)──────────────────────────────────────▶ S3 (attachments bucket)
```

Files never pass through API Gateway or Lambda (they have 10 MB / 6 MB request limits). Instead the Lambda hands out a **presigned URL**: a one-time ticket, valid for 5 minutes, that lets the browser talk to the private bucket directly.

**Upload**
1. The browser sends `POST /tasks/{taskId}/attachments` with the file name, type and size.
2. The tasks Lambda checks that the user is the **admin or the assignee**, the type is allowed (images, PDF, Word, Excel, text, CSV) and the size is at most 10 MB.
3. It returns a **presigned POST** ticket for the location `tasks/{taskId}/{attachmentId}/{fileName}`.
4. The browser uploads the file **straight to S3**. S3 itself rejects the upload if it's over 10 MB or not the declared type.

**List and download**
1. The browser sends `GET /tasks/{taskId}/attachments`.
2. The Lambda lists the folder `tasks/{taskId}/` in S3. **S3 is the list**: there is no separate database record to get out of sync.
3. Each file comes back with a short-lived **download link**, and clicking it downloads directly from S3.

**Delete**
- `DELETE /tasks/{taskId}/attachments/{attachmentId}` removes one file.
- Deleting a task also removes **all of its files**, so nothing is left behind.

The bucket stays **private**: without a valid ticket, S3 returns 403. Its CORS settings only allow requests from the app's own domain.

---

## Supporting services (behind the scenes)

| Service | Role in the flow |
|---|---|
| **IAM** | The **security guard**. Every arrow above is allowed by a role or policy, e.g. "the notifier may read the stream and publish to SNS". With no permission, the call fails. |
| **CloudWatch Logs** | The **diary**. Every Lambda writes its logs here (e.g. `NOTIFIED::`, errors). Used to check and debug the flows. |
| **Terraform** (+ S3 state bucket) | The **builder**. Creates everything above from the code in `infra/`, and remembers what it built in the S3 state file. |

---

## The whole story in one paragraph

**CloudFront** serves the website from **S3**. The user logs in with **Cognito** and gets a token. Every action goes through **API Gateway**, which checks the token with Cognito before passing it to a **Lambda**. The Lambdas store data in **DynamoDB**. File attachments go **directly between the browser and a private S3 bucket**, using short-lived tickets issued by the tasks Lambda. When a task changes, the **DynamoDB stream** wakes the **notifier Lambda**, which sends a message through **SNS**, and SNS emails only the right person. Every hour, **EventBridge Scheduler** wakes the **reminders Lambda** to warn about deadlines through SNS too. **IAM** controls who may talk to whom, and **CloudWatch** records what happened.
