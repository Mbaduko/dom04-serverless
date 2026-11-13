# Private bucket that stores files attached to tasks
resource "aws_s3_bucket" "attachments" {
  bucket        = "${var.project}-${var.environment}-attachments-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

# Blocks every form of public access to the attachments bucket
resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket                  = aws_s3_bucket.attachments.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lets the frontend upload and download directly with presigned URLs
resource "aws_s3_bucket_cors_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  cors_rule {
    allowed_methods = ["GET", "POST"]
    allowed_origins = [local.allowed_origin]
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}

# Cleans up uploads that never finished
resource "aws_s3_bucket_lifecycle_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
