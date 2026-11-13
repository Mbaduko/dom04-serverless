# Zips the backend source code for deployment to Lambda
data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/src"
  output_path = "${path.module}/../build/backend.zip"
}

# IAM role the Lambda function runs as (trust policy lets Lambda assume it)
resource "aws_iam_role" "lambda_role" {
  name = "${var.project}-${var.environment}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          "Service" = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# Permissions for the tasks Lambda to manage tasks and read user profiles
data "aws_iam_policy_document" "dynamodb_policy" {
  statement {
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Scan",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.tasks.arn,
      "${aws_dynamodb_table.tasks.arn}/index/*",
    ]
  }

  statement {
    actions   = ["dynamodb:GetItem"]
    resources = [aws_dynamodb_table.users.arn]
  }

  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.notifications.arn]
  }
}

# CloudWatch log group for the Lambda function's logs
resource "aws_cloudwatch_log_group" "lambda_log_group" {
  name              = "/aws/lambda/${aws_lambda_function.backend.function_name}"
  retention_in_days = var.log_retention_days
}

# Permissions for the Lambda to write to its log group
data "aws_iam_policy_document" "logs_policy" {
  statement {
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]

    resources = [
      "${aws_cloudwatch_log_group.lambda_log_group.arn}:*"
    ]
  }
}

# Standalone IAM policy built from the logs policy document
resource "aws_iam_policy" "logs_policy" {
  name        = "${var.project}-${var.environment}-logs-policy"
  policy      = data.aws_iam_policy_document.logs_policy.json
  description = "Policy for Lambda function to write logs to CloudWatch"
}

# Attaches the logs policy to the Lambda role
resource "aws_iam_role_policy_attachment" "logs_policy_attachment" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.logs_policy.arn
}

# Inline policy on the Lambda role granting DynamoDB access
resource "aws_iam_role_policy" "dynamodb_policy" {
  name   = "${var.project}-${var.environment}-dynamodb-policy"
  policy = data.aws_iam_policy_document.dynamodb_policy.json
  role   = aws_iam_role.lambda_role.id
}

# Lambda function that handles the tasks API requests
resource "aws_lambda_function" "backend" {
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256
  function_name    = "${var.project}-${var.environment}-backend"
  role             = aws_iam_role.lambda_role.arn
  handler          = "functions/tasks/index.handler"
  runtime          = "nodejs24.x"

  environment {
    variables = {
      TASKS_TABLE            = aws_dynamodb_table.tasks.name
      USERS_TABLE            = aws_dynamodb_table.users.name
      ALLOWED_ORIGIN         = "https://${aws_cloudfront_distribution.frontend.domain_name}"
      TOPIC_ARN              = aws_sns_topic.notifications.arn
      APP_URL                = local.allowed_origin
      NOTIFICATION_TIME_ZONE = var.notification_time_zone
    }
  }
}

# IAM role the users Lambda runs as
resource "aws_iam_role" "users_lambda_role" {
  name = "${var.project}-${var.environment}-users-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          "Service" = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# CloudWatch log group for the users Lambda
resource "aws_cloudwatch_log_group" "users_lambda_log_group" {
  name              = "/aws/lambda/${aws_lambda_function.users.function_name}"
  retention_in_days = var.log_retention_days
}

# Permissions for the users Lambda: create Cognito users, manage profiles, write logs
data "aws_iam_policy_document" "users_lambda_policy" {
  statement {
    actions = [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminAddUserToGroup",
    ]
    resources = [aws_cognito_user_pool.users.arn]
  }

  statement {
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:Scan",
    ]
    resources = [aws_dynamodb_table.users.arn]
  }

  statement {
    actions = [
      "sns:Subscribe",
      "sns:ListSubscriptionsByTopic",
    ]
    resources = [aws_sns_topic.notifications.arn]
  }

  statement {
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.users_lambda_log_group.arn}:*"]
  }
}

# Inline policy on the users Lambda role
resource "aws_iam_role_policy" "users_lambda_policy" {
  name   = "${var.project}-${var.environment}-users-lambda-policy"
  policy = data.aws_iam_policy_document.users_lambda_policy.json
  role   = aws_iam_role.users_lambda_role.id
}

# Lambda function that handles the users API requests
resource "aws_lambda_function" "users" {
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256
  function_name    = "${var.project}-${var.environment}-users"
  role             = aws_iam_role.users_lambda_role.arn
  handler          = "functions/users/index.handler"
  runtime          = "nodejs24.x"

  environment {
    variables = {
      USERS_TABLE    = aws_dynamodb_table.users.name
      USER_POOL_ID   = aws_cognito_user_pool.users.id
      TOPIC_ARN      = aws_sns_topic.notifications.arn
      ALLOWED_ORIGIN = "https://${aws_cloudfront_distribution.frontend.domain_name}"
    }
  }
}
