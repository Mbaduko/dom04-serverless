variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "project" {
  description = "Project name used for tagging and resource naming"
  type        = string
}

variable "log_retention_days" {
  description = "Number of days to retain logs in CloudWatch"
  type        = number
}
variable "notification_time_zone" {
  description = "IANA time zone used to show dates in notification emails"
  type        = string
  default     = "UTC"
}

variable "reminder_schedule" {
  description = "How often the deadline reminder Lambda runs"
  type        = string
  default     = "rate(1 hour)"
}

variable "reminder_window_hours" {
  description = "Send a due-soon reminder when a deadline is within this many hours"
  type        = number
  default     = 24
}
