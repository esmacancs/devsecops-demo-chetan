variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "me-south-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "devsecops-demo"
}

variable "subnet_ids" {
  description = "Subnet IDs for the EKS cluster (private for production)"
  type        = list(string)
  default     = []
}
