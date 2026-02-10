## Infrastructure Overview

The infrastructure is built on **Kubernetes** with a focus on scalability, high availability, and efficient resource utilization.

### Orchestration and Scaling

- **Kubernetes**: Container orchestration platform managing all workloads
- **Horizontal Pod Autoscaling (HPA)**: Kubernetes-native autoscaling based on CPU, memory, and custom metrics
- **Cluster Autoscaling**: Automatically adjusts the number of nodes in the cluster based on pod scheduling demands (AWS Cluster Autoscaler - Azure has equivalent capabilities)

### Compute Resources

The infrastructure uses multiple node groups optimized for different workload types:

- **GPU Nodes**: NVIDIA L4 GPUs for AI/ML workloads (inference, transcription, TTS)
- **ARM Nodes**: ARM-based instances (4 CPU, 4GB RAM) for cost-effective general workloads
- **General Purpose Nodes**: Standard compute instances for application services

### Infrastructure as Code

Infrastructure is managed using **Terraform/Terragrunt** for:

- Kubernetes cluster provisioning
- Networking and security groups
- Database and cache instances
- Storage resources
- Multi-region deployments

### Application Deployment

- **Helm Charts**: Standardized application packaging and deployment
- **GitOps**: Automated deployment pipeline via ArgoCD
- **Environment Management**: Support for preview and production environments

### Key Components

- **Databases**: Managed PostgreSQL instances for application data
- **Caching**: Redis clusters for session management and caching
- **Storage**: Object storage for media artifacts and recordings
- **Monitoring**: Prometheus and Grafana for observability

---

## Azure Compatibility

The architecture is designed to be cloud-agnostic. Key components that work on both AWS and Azure:

- **Kubernetes**: Standard Kubernetes (EKS on AWS, AKS on Azure)
- **HPA**: Native Kubernetes feature available on both platforms
- **Cluster Autoscaling**: Available on both AWS (Cluster Autoscaler) and Azure (Cluster Autoscaler)
- **Node Groups**: Both platforms support node pools with different instance types
- **GPU Support**: Both AWS and Azure offer GPU-enabled instances (L4 GPUs available on both)

The infrastructure code can be adapted to Azure by replacing AWS-specific resources (EKS → AKS, EC2 → Azure VMs, etc.) while maintaining the same architectural patterns and scaling strategies.
