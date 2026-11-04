terraform {
  backend "s3" {
    bucket        = "domo4-288761743924"
    key           = "dev/terraform.tfstate"
    use_lockfile = true
    region        = "eu-west-1"
    encrypt       = true
    kms_key_id    = "arn:aws:kms:eu-west-1:288761743924:key/fdea8f7a-6ce5-4a53-830d-b58574646c75"
  }
}