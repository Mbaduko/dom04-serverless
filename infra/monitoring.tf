locals {
  monitored_functions = {
    tasks     = aws_lambda_function.backend.function_name
    users     = aws_lambda_function.users.function_name
    notifier  = aws_lambda_function.notifier.function_name
    reminders = aws_lambda_function.reminders.function_name
  }

  metrics_namespace = "${var.project}/${var.environment}"
  api_dimensions    = { ApiName = aws_api_gateway_rest_api.api.name, Stage = aws_api_gateway_stage.api_stage.stage_name }

  # Log lines our code prints, turned into metrics: log group => pattern => metric name
  log_metrics = {
    notifications_sent  = { log_group = aws_cloudwatch_log_group.notifier_lambda_log_group.name, pattern = "\"NOTIFIED::\"", metric = "NotificationsSent" }
    notification_failed = { log_group = aws_cloudwatch_log_group.notifier_lambda_log_group.name, pattern = "\"NOTIFY_FAILED::\"", metric = "NotificationFailures" }
    reminders_sent      = { log_group = aws_cloudwatch_log_group.reminders_lambda_log_group.name, pattern = "\"REMINDED::\"", metric = "RemindersSent" }
    reminder_failed     = { log_group = aws_cloudwatch_log_group.reminders_lambda_log_group.name, pattern = "\"REMINDER_FAILED::\"", metric = "ReminderFailures" }
    tasks_unexpected    = { log_group = aws_cloudwatch_log_group.lambda_log_group.name, pattern = "\"Unexpected error\"", metric = "UnexpectedErrors" }
    users_unexpected    = { log_group = aws_cloudwatch_log_group.users_lambda_log_group.name, pattern = "\"Unexpected error\"", metric = "UnexpectedErrors" }
    subscribe_failed    = { log_group = aws_cloudwatch_log_group.users_lambda_log_group.name, pattern = "\"SUBSCRIBE_FAILED::\"", metric = "BackgroundFailures" }
    attachment_cleanup  = { log_group = aws_cloudwatch_log_group.lambda_log_group.name, pattern = "\"ATTACHMENT_CLEANUP_FAILED::\"", metric = "BackgroundFailures" }
  }
}

# SNS topic that emails operational alerts (kept apart from user notifications, which are filtered per recipient)
resource "aws_sns_topic" "alerts" {
  name = "${var.project}-${var.environment}-alerts"
}

# Operator email that receives alarm notifications (must be confirmed once)
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Turns log lines printed by the Lambdas into custom metrics
resource "aws_cloudwatch_log_metric_filter" "app" {
  for_each       = local.log_metrics
  name           = "${var.project}-${var.environment}-${each.key}"
  log_group_name = each.value.log_group
  pattern        = each.value.pattern

  metric_transformation {
    name          = each.value.metric
    namespace     = local.metrics_namespace
    value         = "1"
    default_value = "0"
  }
}

# Alarm when the API returns server errors to users
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.project}-${var.environment}-api-5xx"
  alarm_description   = "The API returned 5XX errors"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5XXError"
  dimensions          = local.api_dimensions
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Alarm when the API is slow for most users
resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${var.project}-${var.environment}-api-latency"
  alarm_description   = "API p90 latency above 3 seconds for 15 minutes"
  namespace           = "AWS/ApiGateway"
  metric_name         = "Latency"
  dimensions          = local.api_dimensions
  extended_statistic  = "p90"
  period              = 300
  evaluation_periods  = 3
  threshold           = 3000
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Alarm per Lambda when it crashes, times out or runs out of memory
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each            = local.monitored_functions
  alarm_name          = "${var.project}-${var.environment}-${each.key}-lambda-errors"
  alarm_description   = "The ${each.key} Lambda failed (crash, timeout or out of memory)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.value }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Alarm when any of our Lambdas is throttled
resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${var.project}-${var.environment}-lambda-throttles"
  alarm_description   = "One of the Lambdas was throttled"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "total"
    expression  = "SUM([${join(",", keys(local.monitored_functions))}])"
    label       = "Throttles"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = local.monitored_functions
    content {
      id = metric_query.key
      metric {
        namespace   = "AWS/Lambda"
        metric_name = "Throttles"
        dimensions  = { FunctionName = metric_query.value }
        stat        = "Sum"
        period      = 300
      }
    }
  }
}

# Alarm when task-change emails fall behind (stream records waiting too long)
resource "aws_cloudwatch_metric_alarm" "notifier_iterator_age" {
  alarm_name          = "${var.project}-${var.environment}-notifier-lag"
  alarm_description   = "Task change notifications are more than 5 minutes behind"
  namespace           = "AWS/Lambda"
  metric_name         = "IteratorAge"
  dimensions          = { FunctionName = aws_lambda_function.notifier.function_name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 300000
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Alarms on failures our code catches and logs, which the Lambda Errors metric can't see
resource "aws_cloudwatch_metric_alarm" "app_failures" {
  for_each = {
    notification-failures = { metric = "NotificationFailures", description = "Task change notifications failed to send" }
    reminder-failures     = { metric = "ReminderFailures", description = "Deadline reminders failed to send" }
    unexpected-errors     = { metric = "UnexpectedErrors", description = "The API hit unexpected errors (returned as 500)" }
    background-failures   = { metric = "BackgroundFailures", description = "A background step failed (email subscription or attachment cleanup)" }
  }
  alarm_name          = "${var.project}-${var.environment}-${each.key}"
  alarm_description   = each.value.description
  namespace           = local.metrics_namespace
  metric_name         = each.value.metric
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  depends_on = [aws_cloudwatch_log_metric_filter.app]
}

# Alarm when SNS fails to deliver emails
resource "aws_cloudwatch_metric_alarm" "sns_delivery_failures" {
  alarm_name          = "${var.project}-${var.environment}-email-delivery-failures"
  alarm_description   = "SNS failed to deliver notification emails"
  namespace           = "AWS/SNS"
  metric_name         = "NumberOfNotificationsFailed"
  dimensions          = { TopicName = aws_sns_topic.notifications.name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Alarm when DynamoDB throttles requests on either table
resource "aws_cloudwatch_metric_alarm" "dynamodb_throttles" {
  alarm_name          = "${var.project}-${var.environment}-dynamodb-throttles"
  alarm_description   = "DynamoDB throttled requests"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "total"
    expression  = "SUM([tasks, users])"
    label       = "Throttled requests"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = { tasks = aws_dynamodb_table.tasks.name, users = aws_dynamodb_table.users.name }
    content {
      id = metric_query.key
      metric {
        namespace   = "AWS/DynamoDB"
        metric_name = "ThrottledRequests"
        dimensions  = { TableName = metric_query.value }
        stat        = "Sum"
        period      = 300
      }
    }
  }
}

# IAM role API Gateway uses to write logs to CloudWatch (an account-wide setting per region)
resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "${var.project}-${var.environment}-apigw-cloudwatch-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Grants the API Gateway logging role permission to write logs
resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  role       = aws_iam_role.api_gateway_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# Points API Gateway in this region at the logging role
resource "aws_api_gateway_account" "this" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn

  depends_on = [aws_iam_role_policy_attachment.api_gateway_cloudwatch]
}

# Log group with one line per API request
resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${aws_api_gateway_rest_api.api.name}/${var.environment}/access"
  retention_in_days = var.log_retention_days
}

# One-page view of the system's health
resource "aws_cloudwatch_dashboard" "overview" {
  dashboard_name = "${var.project}-${var.environment}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "API requests and errors"
          region = var.aws_region
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiName", local.api_dimensions.ApiName, "Stage", local.api_dimensions.Stage, { label = "Requests" }],
            ["AWS/ApiGateway", "4XXError", "ApiName", local.api_dimensions.ApiName, "Stage", local.api_dimensions.Stage, { label = "4XX" }],
            ["AWS/ApiGateway", "5XXError", "ApiName", local.api_dimensions.ApiName, "Stage", local.api_dimensions.Stage, { label = "5XX" }],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "API latency (ms)"
          region = var.aws_region
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiName", local.api_dimensions.ApiName, "Stage", local.api_dimensions.Stage, { stat = "Average", label = "Average" }],
            ["AWS/ApiGateway", "Latency", "ApiName", local.api_dimensions.ApiName, "Stage", local.api_dimensions.Stage, { stat = "p90", label = "p90" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 8, height = 6
        properties = {
          title   = "Lambda invocations"
          region  = var.aws_region
          stat    = "Sum"
          period  = 300
          metrics = [for key, name in local.monitored_functions : ["AWS/Lambda", "Invocations", "FunctionName", name, { label = key }]]
        }
      },
      {
        type = "metric", x = 8, y = 6, width = 8, height = 6
        properties = {
          title   = "Lambda errors"
          region  = var.aws_region
          stat    = "Sum"
          period  = 300
          metrics = [for key, name in local.monitored_functions : ["AWS/Lambda", "Errors", "FunctionName", name, { label = key }]]
        }
      },
      {
        type = "metric", x = 16, y = 6, width = 8, height = 6
        properties = {
          title   = "Lambda duration (ms, p90)"
          region  = var.aws_region
          stat    = "p90"
          period  = 300
          metrics = [for key, name in local.monitored_functions : ["AWS/Lambda", "Duration", "FunctionName", name, { label = key }]]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 8, height = 6
        properties = {
          title  = "Notifications"
          region = var.aws_region
          stat   = "Sum"
          period = 300
          metrics = [
            [local.metrics_namespace, "NotificationsSent", { label = "Change emails sent" }],
            [local.metrics_namespace, "RemindersSent", { label = "Reminders sent" }],
            [local.metrics_namespace, "NotificationFailures", { label = "Change email failures" }],
            [local.metrics_namespace, "ReminderFailures", { label = "Reminder failures" }],
            ["AWS/SNS", "NumberOfNotificationsFailed", "TopicName", aws_sns_topic.notifications.name, { label = "SNS delivery failures" }],
          ]
        }
      },
      {
        type = "metric", x = 8, y = 12, width = 8, height = 6
        properties = {
          title  = "Notifier stream lag (ms)"
          region = var.aws_region
          stat   = "Maximum"
          period = 300
          metrics = [
            ["AWS/Lambda", "IteratorAge", "FunctionName", aws_lambda_function.notifier.function_name, { label = "Iterator age" }],
          ]
        }
      },
      {
        type = "metric", x = 16, y = 12, width = 8, height = 6
        properties = {
          title  = "DynamoDB reads and writes"
          region = var.aws_region
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", aws_dynamodb_table.tasks.name, { label = "tasks reads" }],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", aws_dynamodb_table.tasks.name, { label = "tasks writes" }],
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", aws_dynamodb_table.users.name, { label = "users reads" }],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", aws_dynamodb_table.users.name, { label = "users writes" }],
          ]
        }
      },
      {
        type = "alarm", x = 0, y = 18, width = 24, height = 4
        properties = {
          title = "Alarms"
          alarms = concat(
            [aws_cloudwatch_metric_alarm.api_5xx.arn, aws_cloudwatch_metric_alarm.api_latency.arn],
            [for alarm in aws_cloudwatch_metric_alarm.lambda_errors : alarm.arn],
            [aws_cloudwatch_metric_alarm.lambda_throttles.arn, aws_cloudwatch_metric_alarm.notifier_iterator_age.arn],
            [for alarm in aws_cloudwatch_metric_alarm.app_failures : alarm.arn],
            [aws_cloudwatch_metric_alarm.sns_delivery_failures.arn, aws_cloudwatch_metric_alarm.dynamodb_throttles.arn],
          )
        }
      },
    ]
  })
}
