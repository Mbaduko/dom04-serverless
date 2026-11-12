# DynamoDB table that stores tasks, keyed by taskId
resource "aws_dynamodb_table" "tasks" {
  name         = "${var.project}-${var.environment}-tasks"
  hash_key     = "taskId"
  billing_mode = "PAY_PER_REQUEST"

  attribute {
    name = "taskId"
    type = "S"
  }

  attribute {
    name = "assignedTo"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "assignedTo-createdAt-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "assignedTo"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "createdAt"
      key_type       = "RANGE"
    }
  }
}

# DynamoDB table that stores team member profiles, keyed by Cognito sub
resource "aws_dynamodb_table" "users" {
  name         = "${var.project}-${var.environment}-users"
  hash_key     = "userId"
  billing_mode = "PAY_PER_REQUEST"

  attribute {
    name = "userId"
    type = "S"
  }
}
