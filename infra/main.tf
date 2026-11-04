resource "aws_dynamodb_table" "tasks" {
    name="tasks:${var.environment}"
    hash_key="taskId"
    

    attribute {
        name = "taskId"
        type = "S"
    }
}