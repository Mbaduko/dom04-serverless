locals {
  allowed_origin = "https://${aws_cloudfront_distribution.frontend.domain_name}"

  api_paths = {
    "/tasks"                                     = aws_api_gateway_resource.tasks.id
    "/tasks/{taskId}"                            = aws_api_gateway_resource.task.id
    "/tasks/{taskId}/assign"                     = aws_api_gateway_resource.task_assign.id
    "/tasks/{taskId}/notify"                     = aws_api_gateway_resource.task_notify.id
    "/tasks/{taskId}/attachments"                = aws_api_gateway_resource.task_attachments.id
    "/tasks/{taskId}/attachments/{attachmentId}" = aws_api_gateway_resource.task_attachment.id
    "/users"                                     = aws_api_gateway_resource.users.id
    "/users/{userId}/subscription"               = aws_api_gateway_resource.user_subscription.id
  }

  api_functions = {
    tasks = aws_lambda_function.backend
    users = aws_lambda_function.users
  }

  api_routes = {
    "POST /tasks"                                       = { path = "/tasks", method = "POST", function = "tasks" }
    "GET /tasks"                                        = { path = "/tasks", method = "GET", function = "tasks" }
    "GET /tasks/{taskId}"                               = { path = "/tasks/{taskId}", method = "GET", function = "tasks" }
    "PUT /tasks/{taskId}"                               = { path = "/tasks/{taskId}", method = "PUT", function = "tasks" }
    "DELETE /tasks/{taskId}"                            = { path = "/tasks/{taskId}", method = "DELETE", function = "tasks" }
    "POST /tasks/{taskId}/assign"                       = { path = "/tasks/{taskId}/assign", method = "POST", function = "tasks" }
    "POST /tasks/{taskId}/notify"                       = { path = "/tasks/{taskId}/notify", method = "POST", function = "tasks" }
    "POST /tasks/{taskId}/attachments"                  = { path = "/tasks/{taskId}/attachments", method = "POST", function = "tasks" }
    "GET /tasks/{taskId}/attachments"                   = { path = "/tasks/{taskId}/attachments", method = "GET", function = "tasks" }
    "DELETE /tasks/{taskId}/attachments/{attachmentId}" = { path = "/tasks/{taskId}/attachments/{attachmentId}", method = "DELETE", function = "tasks" }
    "GET /users"                                        = { path = "/users", method = "GET", function = "users" }
    "POST /users"                                       = { path = "/users", method = "POST", function = "users" }
    "POST /users/{userId}/subscription"                 = { path = "/users/{userId}/subscription", method = "POST", function = "users" }
  }

  path_methods = {
    for path in keys(local.api_paths) : path => join(",", concat(
      [for route in values(local.api_routes) : route.method if route.path == path],
      ["OPTIONS"]
    ))
  }
}

# REST API that exposes the backend over HTTP
resource "aws_api_gateway_rest_api" "api" {
  name = "${var.project}-api"
}

# Validates Cognito ID tokens sent in the Authorization header
resource "aws_api_gateway_authorizer" "cognito" {
  name            = "${var.project}-${var.environment}-cognito"
  rest_api_id     = aws_api_gateway_rest_api.api.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [aws_cognito_user_pool.users.arn]
  identity_source = "method.request.header.Authorization"
}

# /tasks path on the API
resource "aws_api_gateway_resource" "tasks" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  path_part   = "tasks"
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
}

# /tasks/{taskId} path on the API
resource "aws_api_gateway_resource" "task" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  path_part   = "{taskId}"
  parent_id   = aws_api_gateway_resource.tasks.id
}

# /tasks/{taskId}/assign path on the API
resource "aws_api_gateway_resource" "task_assign" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  path_part   = "assign"
  parent_id   = aws_api_gateway_resource.task.id
}

# /tasks/{taskId}/notify path on the API
resource "aws_api_gateway_resource" "task_notify" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  path_part   = "notify"
  parent_id   = aws_api_gateway_resource.task.id
}

# /tasks/{taskId}/attachments path on the API
resource "aws_api_gateway_resource" "task_attachments" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  path_part   = "attachments"
  parent_id   = aws_api_gateway_resource.task.id
}

# /tasks/{taskId}/attachments/{attachmentId} path on the API
resource "aws_api_gateway_resource" "task_attachment" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  path_part   = "{attachmentId}"
  parent_id   = aws_api_gateway_resource.task_attachments.id
}

# /users path on the API
resource "aws_api_gateway_resource" "users" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  path_part   = "users"
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
}

# /users/{userId} path on the API
resource "aws_api_gateway_resource" "user" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  path_part   = "{userId}"
  parent_id   = aws_api_gateway_resource.users.id
}

# /users/{userId}/subscription path on the API
resource "aws_api_gateway_resource" "user_subscription" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  path_part   = "subscription"
  parent_id   = aws_api_gateway_resource.user.id
}

# One method per route, each requiring a Cognito login
resource "aws_api_gateway_method" "route" {
  for_each = local.api_routes

  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = local.api_paths[each.value.path]
  http_method   = each.value.method
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

# Proxies each route to the Lambda function
resource "aws_api_gateway_integration" "route" {
  for_each = local.api_routes

  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = local.api_paths[each.value.path]
  http_method             = aws_api_gateway_method.route[each.key].http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = local.api_functions[each.value.function].invoke_arn
}

moved {
  from = aws_api_gateway_method.post_tasks
  to   = aws_api_gateway_method.route["POST /tasks"]
}

moved {
  from = aws_api_gateway_integration.post_tasks_integration
  to   = aws_api_gateway_integration.route["POST /tasks"]
}

# CORS preflight method on each path (no login, browsers send it without a token)
resource "aws_api_gateway_method" "options" {
  for_each = local.api_paths

  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = each.value
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# Answers preflight requests directly from API Gateway
resource "aws_api_gateway_integration" "options" {
  for_each = local.api_paths

  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.options[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Declares the CORS headers the preflight response returns
resource "aws_api_gateway_method_response" "options" {
  for_each = local.api_paths

  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.options[each.key].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

# Sets the CORS header values on the preflight response
resource "aws_api_gateway_integration_response" "options" {
  for_each = local.api_paths

  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = each.value
  http_method = aws_api_gateway_method.options[each.key].http_method
  status_code = aws_api_gateway_method_response.options[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.allowed_origin}'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.path_methods[each.key]}'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
  }

  depends_on = [aws_api_gateway_integration.options]
}

# Adds CORS headers to errors API Gateway returns itself (e.g. 401 from the authorizer)
resource "aws_api_gateway_gateway_response" "cors" {
  for_each = toset(["DEFAULT_4XX", "DEFAULT_5XX"])

  rest_api_id   = aws_api_gateway_rest_api.api.id
  response_type = each.value

  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${local.allowed_origin}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
  }
}

# Snapshot of the API configuration that can be served by a stage
resource "aws_api_gateway_deployment" "api_deployment" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  triggers = {
    redeployment = sha1(jsonencode({
      paths      = local.api_paths
      authorizer = aws_api_gateway_authorizer.cognito.id
      methods = {
        for key, method in aws_api_gateway_method.route : key => [method.id, method.authorization, method.authorizer_id]
      }
      integrations = {
        for key, integration in aws_api_gateway_integration.route : key => [integration.id, integration.uri]
      }
      cors = {
        for key, response in aws_api_gateway_integration_response.options : key => response.response_parameters
      }
      gateway_responses = {
        for key, response in aws_api_gateway_gateway_response.cors : key => response.response_parameters
      }
    }))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Stage (e.g. dev) that serves the deployment at a public URL
resource "aws_api_gateway_stage" "api_stage" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = var.environment
  deployment_id = aws_api_gateway_deployment.api_deployment.id
}

# Allows API Gateway to invoke the Lambda function on any route
resource "aws_lambda_permission" "api_gateway_invoke" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# Allows API Gateway to invoke the users Lambda function
resource "aws_lambda_permission" "api_gateway_invoke_users" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.users.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}
