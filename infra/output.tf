output "api_url" {
  value = aws_api_gateway_rest_api.api.execution_arn
}

output "resource_policy_resource" {
  value = aws_lambda_permission.api_gateway_invoke.source_arn
}

output "api_stage_url" {
  value = aws_api_gateway_stage.api_stage.invoke_url
}
output "frontend_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "user_pool_id" {
  value = aws_cognito_user_pool.users.id
}
