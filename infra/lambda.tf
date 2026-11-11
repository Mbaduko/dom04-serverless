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

# Permissions for the Lambda to write items to the tasks table
data "aws_iam_policy_document" "dynamodb_policy" {
  statement {
    actions = [
      "dynamodb:PutItem"
    ]
    resources = [
      aws_dynamodb_table.tasks.arn
    ]
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
      TASKS_TABLE = aws_dynamodb_table.tasks.name
    }
  }
}
