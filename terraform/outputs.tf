output "repository_url" {
  description = "ECR repository URL for the app image"
  value       = aws_ecr_repository.app.repository_url
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.app.name
}

output "cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = aws_eks_cluster.app.endpoint
}

output "node_group_status" {
  description = "EKS node group status"
  value       = aws_eks_node_group.app.status
}
