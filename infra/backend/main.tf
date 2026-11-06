# AWS provider with default tags applied to all resources
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project
    }
  }
}

# Looks up the current AWS account ID
data "aws_caller_identity" "current" {}

# S3 bucket that holds Terraform remote state
resource "aws_s3_bucket" "state" {
  bucket = "${var.project}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name    = "${var.project}-tf-state"
    Purpose = "Terraform remote state storage"
  }
}

# Blocks all public access to the state bucket
resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# KMS key used to encrypt the state bucket
resource "aws_kms_key" "state" {
  description             = "Key to encrypt s3 bucket for terraform state"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name    = "${var.project}-tf-state-key"
    Purpose = "Encrypt Terraform state bucket"
  }
}

# Encrypts objects in the state bucket with the KMS key by default
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
  }
}

# Enables versioning so previous state files can be recovered
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}