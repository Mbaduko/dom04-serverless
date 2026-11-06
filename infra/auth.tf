# Cognito user pool for Admin and Team Member accounts
resource "aws_cognito_user_pool" "users" {
  name                     = "${var.project}-${var.environment}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

# App client the frontend uses to sign users in
resource "aws_cognito_user_pool_client" "frontend" {
  name            = "${var.project}-${var.environment}-frontend"
  user_pool_id    = aws_cognito_user_pool.users.id
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"
}

# Group for users who create and assign tasks
resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.users.id
  description  = "Can create, assign and track all tasks"
}

# Group for users who work on assigned tasks
resource "aws_cognito_user_group" "team_member" {
  name         = "TeamMember"
  user_pool_id = aws_cognito_user_pool.users.id
  description  = "Can view and update assigned tasks"
}
