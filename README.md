# Serverless Task Management System

A task manager for a field team, built entirely on AWS serverless services.
**Admins** create tasks, assign them and track progress. **Team members** see their own tasks, update the status and attach files.
Everyone gets **email notifications** for assignments, updates and approaching deadlines.

## Features

- Role-based login (Admin / Team Member) with Amazon Cognito
- Create, edit, assign and delete tasks; members update the status of their own tasks
- File attachments per task (uploaded straight to S3)
- Email notifications on assignment, reassignment, status change, edit and deletion
- Automatic "due soon" and "overdue" reminders
- Monitoring with CloudWatch alarms, a dashboard and email alerts
- All infrastructure defined in Terraform

---

## Architecture

**Part 1: what the browser talks to**

```
                              ┌──────────────────┐
                              │  User's browser  │
                              └──────────────────┘
                                       │
       ┌───────────────────┬───────────┴────────┬──────────────────────────┐
       │ open app          │ log in             │ API call + token         │ upload / download file
       ▼                   ▼                    ▼                          │ (presigned URL)
┌────────────┐      ┌────────────┐  verify ┌─────────────┐                 │
│ CloudFront │      │  Cognito   │◀────────│ API Gateway │                 │
└────────────┘      └────────────┘  token  └─────────────┘                 │
       │                                      │       │                    │
       ▼                                      ▼       ▼                    ▼
┌────────────┐                   ┌──────────────┐ ┌──────────────┐  ┌────────────────┐
│ S3 website │                   │ Users Lambda │ │ Tasks Lambda │─▶│ S3 attachments │
└────────────┘                   └──────────────┘ └──────────────┘  └────────────────┘
                                                    issues the presigned URLs
```

**Part 2: what happens behind the API**

```
┌──────────────┐──create user──────▶ Cognito
│ Users Lambda │──save profile─────▶ DynamoDB (users)
└──────────────┘──subscribe email──────────────────────────────────────────────────┐
                                                                                   │
┌──────────────┐──save task────────▶ DynamoDB (tasks)                              │
│ Tasks Lambda │                          │                                        │
└──────────────┘                          │ stream of changes                      │
       │                                  ▼                                        │
       │                          ┌─────────────────┐                              │
       │                          │ Notifier Lambda │──"who should know?"──────────┤
       │                          └─────────────────┘                              │
       │                                                                           │
       └──Notify button────────────────────────────────────────────────────────────┤
                                                                                   │
┌─────────────┐  every  ┌──────────────────┐                                       │
│ EventBridge │──hour──▶│ Reminders Lambda │──"due soon / overdue"─────────────────┤
│ Scheduler   │         └──────────────────┘                                       │
└─────────────┘                  │ find + mark tasks                               ▼
                                 ▼                                    ┌──────────────────────┐
                          DynamoDB (tasks)                            │ SNS notifications    │
                                                                      └──────────────────────┘
                                                                                   │
                                                                                   ▼
                                                                   📧 Each user's inbox
                                                                   (only their own emails)
```

**Around everything**

```
Lambdas + API Gateway ──▶ CloudWatch (logs, metrics, alarms, dashboard) ──▶ SNS alerts ──▶ 📧 Operator
IAM gives every service only the permissions it needs
```

| Service | Role |
|---|---|
| **CloudFront + S3** | Serve the React website |
| **Cognito** | Login, and the `Admin` / `TeamMember` groups |
| **API Gateway** | The REST API; rejects requests without a valid token |
| **Lambda** | Business logic, in 4 functions: tasks, users, notifier, reminders |
| **DynamoDB** | Stores tasks and user profiles; its stream feeds the notifier |
| **S3** | Stores task attachments (private bucket) |
| **SNS** | Sends notification emails, each user receiving only their own |
| **EventBridge Scheduler** | Runs the reminder check every hour |
| **CloudWatch** | Logs, metrics, alarms and a dashboard |
| **IAM** | Gives each Lambda only the permissions it needs |

---

## How each flow works

### 1. Opening the app and logging in

```
User ──open app──▶ CloudFront ──▶ S3 (website)
User ◀──────────── index.html, JS, CSS, config.json

User ──email + password──▶ Cognito
User ◀──────────────────── tokens (the ID token holds the user's group)
```

The website bucket is private: only CloudFront may read it. `config.json` tells the app which Cognito pool and API to use.

### 2. Making an API request (e.g. create a task)

```
User ──POST /tasks + ID token──▶ API Gateway ──"is this token valid?"──▶ Cognito
                                     │
                    ┌────────────────┴────────────────┐
                    │ invalid                         │ valid
                    ▼                                 ▼
             401 Unauthorized                    Tasks Lambda
                                                 1. check the role
                                                 2. validate input
                                                 3. save ──▶ DynamoDB (tasks)
                                                      │
User ◀──────────────────── 201 Created ───────────────┘
```

### 3. Inviting a team member

```
Admin ──POST /users {email, role}──▶ API Gateway ──▶ Users Lambda
                                                        │
          ┌─────────────────────────────────────────────┼───────────────────────────────┐
          ▼                                             ▼                               ▼
   Cognito: create user + group             DynamoDB: save profile        SNS: subscribe email
          │                                                               (filter: recipient = their email)
          ▼                                                                             │
   📧 temporary password ──▶ New member ◀──────────── 📧 "Confirm subscription" ◀────────┘
```

The member must click **Confirm subscription** once before they receive notifications. The Team tab shows who has confirmed and can resend the email.

### 4. Notifications when a task changes

```
Admin ──assign task──▶ Tasks Lambda ──update──▶ DynamoDB (tasks)
Admin ◀── 200 OK ─────────┘   (the request ends here)
                                                   │
                                                   │ stream record (before + after)
                                                   ▼
                                           Notifier Lambda
                                           "assignee changed"
                                                   │
                                                   │ publish (recipient = member's email)
                                                   ▼
                                                  SNS ──▶ 📧 "New task assigned" ──▶ Assignee
```

| Change | Who is emailed |
|---|---|
| Task assigned | New assignee |
| Task reassigned | New and previous assignee |
| Member changes status | Admin who created the task |
| Admin edits the task | Assignee |
| Task deleted | Assignee |

The person who made the change is never emailed.

The **Notify** button skips the stream, and the tasks Lambda publishes directly:

```
Admin ──POST /tasks/{id}/notify──▶ Tasks Lambda ──▶ SNS ──▶ 📧 "Reminder" ──▶ Assignee
```

### 5. Deadline reminders

```
EventBridge Scheduler ──every hour──▶ Reminders Lambda
                                            │
                                            │ 1. find open tasks due within 24h or overdue
                                            ▼
                                      DynamoDB (tasks)
                                            │
                                            │ 2. for each task not yet reminded:
                                            │    mark it, then publish
                                            ▼
                                           SNS ──▶ 📧 "Due soon"  ──▶ Assignee
                                               ──▶ 📧 "Overdue"   ──▶ Assignee + Admin
```

Each reminder is sent once per deadline. Changing the deadline resets it.

### 6. File attachments

```
UPLOAD
User ──POST /tasks/{id}/attachments {name, type, size}──▶ Tasks Lambda
                                                           admin or assignee? allowed type? ≤ 10 MB?
User ◀──────────── presigned upload ticket (valid 5 min) ──┘
User ──file (directly)──────────────────────────────────────────────▶ S3 (attachments)

DOWNLOAD
User ──GET /tasks/{id}/attachments──▶ Tasks Lambda ──list files──▶ S3
User ◀──── file names + presigned download links ──┘
User ──click a file (directly)──────────────────────────────────▶ S3
```

Files never pass through API Gateway or Lambda. S3 itself enforces the size limit and file type of each upload.

### 7. Monitoring and alerts

```
Lambdas ─────────────┐
API Gateway ─────────┼──▶ CloudWatch Logs ──metric filters──┐
  (access logs)      │                                      ▼
AWS built-in metrics ┴────────────────────────────────▶ Metrics ──▶ Dashboard
  (API, Lambda, DynamoDB, SNS)                             │
                                                           ▼
                                                      14 Alarms ──▶ SNS alerts topic ──▶ 📧 Operator
```

Alarms cover API errors and latency, Lambda failures, stream lag, failed notifications and reminders, email delivery failures and DynamoDB throttling.

---

## Roles

| Action | Admin | Team member |
|---|---|---|
| Create, edit, delete, assign tasks | ✅ | ❌ |
| View tasks | All | Own only |
| Update task status | ✅ | Own tasks |
| Attach / download files | ✅ | Own tasks |
| Send a reminder (Notify) | ✅ | ❌ |
| Invite team members | ✅ | ❌ |

## Data model

**Task** (`tasks` table, key `taskId`)

| Field | Description |
|---|---|
| `taskId` | Unique ID |
| `title`, `description` | Task details |
| `status` | `TODO`, `IN_PROGRESS` or `DONE` |
| `priority` | `LOW`, `MEDIUM` or `HIGH` |
| `deadline` | Optional due date |
| `assignedTo`, `assigneeEmail` | Assigned member |
| `createdBy`, `createdAt`, `updatedBy`, `updatedAt`, `completedAt` | History |

Indexes: `assignedTo-createdAt-index` (a member's tasks) and `status-deadline-index` (reminders).

**User** (`users` table, key `userId` = Cognito user ID): `email`, `name`, `role`, `createdBy`, `createdAt`.

**Attachments** are S3 objects stored as `tasks/{taskId}/{attachmentId}/{fileName}`.

## API

| Method | Path | Access |
|---|---|---|
| `POST` | `/tasks` | Admin |
| `GET` | `/tasks` | Admin (all), member (own) |
| `GET` / `PUT` | `/tasks/{taskId}` | Admin, assignee (status only) |
| `DELETE` | `/tasks/{taskId}` | Admin |
| `POST` | `/tasks/{taskId}/assign` | Admin |
| `POST` | `/tasks/{taskId}/notify` | Admin |
| `POST` / `GET` | `/tasks/{taskId}/attachments` | Admin, assignee |
| `DELETE` | `/tasks/{taskId}/attachments/{attachmentId}` | Admin, assignee |
| `GET` / `POST` | `/users` | Admin |
| `POST` | `/users/{userId}/subscription` | Admin |

---

## Project structure

```
backend/src/
  functions/
    tasks/        Tasks API (CRUD, assign, notify, attachments)
    users/        Users API (invite, list, subscriptions)
    notifier/     Emails for task changes (DynamoDB stream)
    reminders/    Deadline reminders (scheduled)
  shared/         Auth, validation, DynamoDB, SNS and S3 helpers
frontend/         React app (Vite + Amplify UI)
infra/            Terraform for all AWS resources
  backend/        One-time setup of the Terraform state bucket
```

## Deploy

**Requirements:** an AWS account, AWS CLI, Terraform ≥ 1.5, Node.js.

1. **Create the Terraform state bucket** (once): run `terraform init` and `terraform apply` in `infra/backend`, then put the bucket name in `infra/backend.tf`.
2. **Create `infra/dev.tfvars`:**
   ```hcl
   project            = "dom05"
   environment        = "dev"
   aws_region         = "eu-west-1"
   log_retention_days = 3
   alert_email        = "you@example.com"
   ```
3. **Build the frontend:**
   ```bash
   cd frontend && npm install && npm run build
   ```
4. **Deploy:**
   ```bash
   cd infra
   terraform init
   terraform plan -var-file=dev.tfvars -out=deploy.tfplan
   terraform apply deploy.tfplan
   ```
   The outputs include the app URL (`frontend_url`).
5. **Create the first admin** in the Cognito console (or with the AWS CLI), add them to the `Admin` group, and add their profile to the `users` table. After that, the admin invites everyone else from the app.
6. **Confirm** the "AWS Notification - Subscription Confirmation" email sent to `alert_email`.
