provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project
    }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucktet" "state" {
    bucket = "${var.project}-${data.aws_caller_identity.current.account_id}"

    versioning_configuration {
        status = "Enabled"
    }
}

resource "aws_s3_bucket_public_access_block" "state" {
    bucket = aws_s3_bucket.state.id

    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
}

resource "aws_kms_key" "state" {
    description= "Key to encrypt s3 bucket for terraform state"
    deletion_window_in_days = 7
    enable_key_rotation     = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
  }
}