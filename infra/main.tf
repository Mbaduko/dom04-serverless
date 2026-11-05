resource "aws_dynamodb_table" "tasks" {
  name         = "${var.project}-${var.environment}-tasks"
  hash_key     = "taskId"
  billing_mode = "PAY_PER_REQUEST"

  attribute {
    name = "taskId"
    type = "S"
  }
}

data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/src"
  output_path = "${path.module}/../build/backend.zip"
}

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

resource "aws_cloudwatch_log_group" "lambda_log_group" {
  name              = "/aws/lambda/${aws_lambda_function.backend.function_name}"
  retention_in_days = var.log_retention_days
}

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

resource "aws_iam_policy" "logs_policy" {
  name        = "${var.project}-${var.environment}-logs-policy"
  policy      = data.aws_iam_policy_document.logs_policy.json
  description = "Policy for Lambda function to write logs to CloudWatch"
}

resource "aws_iam_role_policy_attachment" "logs_policy_attachment" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.logs_policy.arn
}

resource "aws_iam_policy_attachment" "logs_policy_attachment" {
  name       = "${var.project}-${var.environment}-logs-policy-attachment"
  policy_arn = aws_iam_policy.logs_policy.arn
  roles      = [aws_iam_role.lambda_role.name]
}

resource "aws_iam_role_policy" "dynamodb_policy" {
  name   = "${var.project}-${var.environment}-dynamodb-policy"
  policy = data.aws_iam_policy_document.dynamodb_policy.json
  role   = aws_iam_role.lambda_role.id
}

resource "aws_lambda_function" "backend" {
  filename      = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256
  function_name = "${var.project}-${var.environment}-backend"
  role          = aws_iam_role.lambda_role.arn
  handler       = "functions/tasks/index.handler"
  runtime       = "nodejs24.x"

  environment {
    variables = {
      TASKS_TABLE = aws_dynamodb_table.tasks.name
    }
  }
}