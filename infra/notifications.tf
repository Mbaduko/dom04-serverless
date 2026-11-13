# SNS topic that delivers task notifications to subscribed users by email
resource "aws_sns_topic" "notifications" {
  name = "${var.project}-${var.environment}-notifications"
}

locals {
  lambda_trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# IAM role the notifier Lambda runs as
resource "aws_iam_role" "notifier_lambda_role" {
  name               = "${var.project}-${var.environment}-notifier-lambda-role"
  assume_role_policy = local.lambda_trust_policy
}

# CloudWatch log group for the notifier Lambda
resource "aws_cloudwatch_log_group" "notifier_lambda_log_group" {
  name              = "/aws/lambda/${var.project}-${var.environment}-notifier"
  retention_in_days = var.log_retention_days
}

# Permissions for the notifier Lambda: read the tasks stream, look up users, publish emails, write logs
data "aws_iam_policy_document" "notifier_lambda_policy" {
  statement {
    actions = [
      "dynamodb:DescribeStream",
      "dynamodb:GetRecords",
      "dynamodb:GetShardIterator",
    ]
    resources = [aws_dynamodb_table.tasks.stream_arn]
  }

  statement {
    actions   = ["dynamodb:ListStreams"]
    resources = ["*"]
  }

  statement {
    actions   = ["dynamodb:GetItem"]
    resources = [aws_dynamodb_table.users.arn]
  }

  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.notifications.arn]
  }

  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.notifier_lambda_log_group.arn}:*"]
  }
}

# Inline policy on the notifier Lambda role
resource "aws_iam_role_policy" "notifier_lambda_policy" {
  name   = "${var.project}-${var.environment}-notifier-lambda-policy"
  policy = data.aws_iam_policy_document.notifier_lambda_policy.json
  role   = aws_iam_role.notifier_lambda_role.id
}

# Lambda that turns task changes from the stream into email notifications
resource "aws_lambda_function" "notifier" {
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256
  function_name    = "${var.project}-${var.environment}-notifier"
  role             = aws_iam_role.notifier_lambda_role.arn
  handler          = "functions/notifier/index.handler"
  runtime          = "nodejs24.x"
  timeout          = 30

  environment {
    variables = {
      USERS_TABLE            = aws_dynamodb_table.users.name
      TOPIC_ARN              = aws_sns_topic.notifications.arn
      APP_URL                = local.allowed_origin
      NOTIFICATION_TIME_ZONE = var.notification_time_zone
    }
  }

  depends_on = [aws_cloudwatch_log_group.notifier_lambda_log_group]
}

# Feeds tasks table changes to the notifier Lambda, retrying from the first failed record
resource "aws_lambda_event_source_mapping" "tasks_stream" {
  event_source_arn              = aws_dynamodb_table.tasks.stream_arn
  function_name                 = aws_lambda_function.notifier.arn
  starting_position             = "LATEST"
  batch_size                    = 10
  maximum_retry_attempts        = 5
  maximum_record_age_in_seconds = 3600
  function_response_types       = ["ReportBatchItemFailures"]

  depends_on = [aws_iam_role_policy.notifier_lambda_policy]
}

# IAM role the reminders Lambda runs as
resource "aws_iam_role" "reminders_lambda_role" {
  name               = "${var.project}-${var.environment}-reminders-lambda-role"
  assume_role_policy = local.lambda_trust_policy
}

# CloudWatch log group for the reminders Lambda
resource "aws_cloudwatch_log_group" "reminders_lambda_log_group" {
  name              = "/aws/lambda/${var.project}-${var.environment}-reminders"
  retention_in_days = var.log_retention_days
}

# Permissions for the reminders Lambda: find tasks by deadline, mark them reminded, publish emails, write logs
data "aws_iam_policy_document" "reminders_lambda_policy" {
  statement {
    actions   = ["dynamodb:Query"]
    resources = ["${aws_dynamodb_table.tasks.arn}/index/status-deadline-index"]
  }

  statement {
    actions   = ["dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.tasks.arn]
  }

  statement {
    actions   = ["dynamodb:GetItem"]
    resources = [aws_dynamodb_table.users.arn]
  }

  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.notifications.arn]
  }

  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.reminders_lambda_log_group.arn}:*"]
  }
}

# Inline policy on the reminders Lambda role
resource "aws_iam_role_policy" "reminders_lambda_policy" {
  name   = "${var.project}-${var.environment}-reminders-lambda-policy"
  policy = data.aws_iam_policy_document.reminders_lambda_policy.json
  role   = aws_iam_role.reminders_lambda_role.id
}

# Lambda that emails due-soon and overdue reminders
resource "aws_lambda_function" "reminders" {
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256
  function_name    = "${var.project}-${var.environment}-reminders"
  role             = aws_iam_role.reminders_lambda_role.arn
  handler          = "functions/reminders/index.handler"
  runtime          = "nodejs24.x"
  timeout          = 60

  environment {
    variables = {
      TASKS_TABLE            = aws_dynamodb_table.tasks.name
      USERS_TABLE            = aws_dynamodb_table.users.name
      TOPIC_ARN              = aws_sns_topic.notifications.arn
      APP_URL                = local.allowed_origin
      NOTIFICATION_TIME_ZONE = var.notification_time_zone
      REMINDER_WINDOW_HOURS  = tostring(var.reminder_window_hours)
    }
  }

  depends_on = [aws_cloudwatch_log_group.reminders_lambda_log_group]
}

# IAM role EventBridge Scheduler uses to invoke the reminders Lambda
resource "aws_iam_role" "reminders_scheduler_role" {
  name = "${var.project}-${var.environment}-reminders-scheduler-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Lets the scheduler invoke the reminders Lambda
resource "aws_iam_role_policy" "reminders_scheduler_policy" {
  name = "${var.project}-${var.environment}-reminders-scheduler-policy"
  role = aws_iam_role.reminders_scheduler_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.reminders.arn
    }]
  })
}

# Runs the reminders Lambda on a fixed schedule
resource "aws_scheduler_schedule" "reminders" {
  name                = "${var.project}-${var.environment}-deadline-reminders"
  schedule_expression = var.reminder_schedule

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.reminders.arn
    role_arn = aws_iam_role.reminders_scheduler_role.arn
  }
}
