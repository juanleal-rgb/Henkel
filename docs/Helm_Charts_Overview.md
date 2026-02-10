## Helm Charts Overview

The application stack is deployed using **Helm charts** with a GitOps workflow managed by **ArgoCD**. All services are containerized and run on Kubernetes with standardized deployment patterns.

### Deployment Strategy

- **GitOps**: ArgoCD continuously monitors Git repositories and automatically syncs changes
- **Helm Charts**: Standardized packaging for all services with environment-specific value overrides
- **Multi-Environment**: Support for preview and production environments with separate configurations
- **Automated Scaling**: Horizontal Pod Autoscaling (HPA) configured for most services based on CPU, memory, and custom metrics

### Core Application Services

The main platform chart (`platform`) contains multiple microservices:

- **API Services**: REST and GraphQL APIs for application functionality
- **Workflow Services**: Temporal-based workflow orchestration (Go and Python workers)
- **Voice Services**: Real-time voice processing and handling
- **Text Services**: Natural language processing and text handling
- **Media Processing**: Audio/video processing and batch operations
- **Integration Services**: Third-party service integrations

### AI/ML Services

- **Deepgram**: Self-hosted speech-to-text transcription service (GPU-accelerated, runs on L4 GPU nodes)
- **TTS (Text-to-Speech)**: Text-to-speech generation service
- **Voice Activity Detection (VAD)**: Audio processing for voice detection

### Infrastructure Services

- **Temporal**: Workflow orchestration engine for distributed systems
- **RabbitMQ**: Message queue for asynchronous communication between services
- **Livekit**: Real-time communication platform for voice/video
- **Nginx**: Ingress controller for routing external traffic
- **Cloudflared**: Secure tunnel service for connectivity

### Observability

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Service Monitoring**: Prometheus ServiceMonitors configured for all services
- **Alerting**: Alert rules for critical metrics and service health

### Scaling Configuration

Most services are configured with:

- **Horizontal Pod Autoscaling (HPA)**: Automatic scaling based on:
  - CPU utilization
  - Memory utilization
  - Custom application metrics (via Prometheus adapter)
- **Resource Requests/Limits**: Defined per service to ensure proper scheduling
- **Node Affinity**: GPU services scheduled on GPU nodes, general services on ARM/general purpose nodes

### Service Patterns

All services follow consistent patterns:

- **Health Checks**: Liveness and readiness probes for container health
- **Service Discovery**: Kubernetes Services for internal communication
- **Ingress**: External-facing services exposed via Ingress resources
- **Secrets Management**: Kubernetes secrets for sensitive configuration
- **ConfigMaps**: Non-sensitive configuration data

### Environment Management

- **Preview Environments**: Lower resource allocations for development and testing
- **Production Environments**: Full resource allocations with high availability
- **Environment-Specific Values**: Separate Helm value files per environment
- **Regional Deployments**: Support for multi-region deployments

---

## Azure Compatibility

The Helm charts are designed to be cloud-agnostic and work on any standard Kubernetes distribution:

- **Kubernetes Standards**: All charts use standard Kubernetes resources (Deployments, Services, Ingress, etc.)
- **HPA**: Native Kubernetes feature available on both AWS EKS and Azure AKS
- **Service Discovery**: Standard Kubernetes Services work identically on both platforms
- **Ingress**: Standard Kubernetes Ingress resources (can use Azure Application Gateway Ingress Controller)
- **Storage**: Uses standard Kubernetes PersistentVolumeClaims (compatible with Azure Disks/Files)
- **Secrets**: Standard Kubernetes Secrets (can integrate with Azure Key Vault)

The main differences when deploying to Azure would be:

- **Ingress Controller**: Replace AWS ALB Ingress Controller with Azure Application Gateway or NGINX Ingress
- **Load Balancers**: Use Azure Load Balancer instead of AWS ELB
- **Storage Classes**: Configure Azure Disk or Azure Files storage classes
- **Secret Management**: Optionally integrate with Azure Key Vault Provider for Secrets Store CSI Driver

All application logic and scaling behavior remains identical across cloud providers.
