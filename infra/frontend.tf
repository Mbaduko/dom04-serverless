locals {
  frontend_dist = "${path.module}/../frontend/dist"
  frontend_files = [
    for f in fileset(local.frontend_dist, "**") : f if f != "config.json"
  ]
  content_types = {
    html = "text/html"
    js   = "application/javascript"
    css  = "text/css"
    json = "application/json"
    svg  = "image/svg+xml"
    png  = "image/png"
    ico  = "image/x-icon"
    txt  = "text/plain"
  }
}

# Looks up the current AWS account ID
data "aws_caller_identity" "current" {}

# Private S3 bucket that holds the built frontend files
resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.project}-${var.environment}-frontend-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

# Blocks all public access to the frontend bucket
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lets CloudFront sign its requests to the private bucket
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project}-${var.environment}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Managed CloudFront policy that turns caching off
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# CloudFront distribution that serves the frontend over HTTPS
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_disabled.id
    compress               = true
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Allows only this CloudFront distribution to read from the bucket
data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

# Attaches the CloudFront read policy to the bucket
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# Uploads each built frontend file to the bucket
resource "aws_s3_object" "frontend" {
  for_each = toset(local.frontend_files)

  bucket       = aws_s3_bucket.frontend.id
  key          = each.value
  source       = "${local.frontend_dist}/${each.value}"
  etag         = filemd5("${local.frontend_dist}/${each.value}")
  content_type = lookup(local.content_types, reverse(split(".", each.value))[0], "application/octet-stream")
}

# Runtime settings the frontend loads on startup
resource "aws_s3_object" "frontend_config" {
  bucket       = aws_s3_bucket.frontend.id
  key          = "config.json"
  content_type = "application/json"
  content = jsonencode({
    userPoolId       = aws_cognito_user_pool.users.id
    userPoolClientId = aws_cognito_user_pool_client.frontend.id
    apiUrl           = aws_api_gateway_stage.api_stage.invoke_url
  })
}
