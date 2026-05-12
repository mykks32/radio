# --------------------------------
# CONFIGURATION SECTION
# --------------------------------

# Application name used for Docker image and Kubernetes deployment
APP_NAME := radio

# DockerHub repository name (change "mykks32" to your username/org)
IMAGE_NAME := mykks32/$(APP_NAME)

# Default image tag (you can override with: make release TAG=v1.0.0)
TAG := latest

# Path to Dockerfile used for building the image
DOCKERFILE := docker/Dockerfile

# Build context (project root)
CONTEXT := .

# Kubernetes dev overlay path (ONLY dev environment is used here)
K8S_DEV := k8s/overlays/dev

# Kubernetes namespace where resources are deployed
NAMESPACE := radio


# --------------------------------
# HELP COMMAND
# --------------------------------
help:
	@echo "Docker commands:"
	@echo "  make build        -> Build Docker image locally"
	@echo "  make tag          -> Tag Docker image for DockerHub"
	@echo "  make push         -> Push image to DockerHub"
	@echo "  make release      -> Build + tag + push in one step"
	@echo ""
	@echo "Kubernetes (DEV only):"
	@echo "  make k8s-dev          -> Deploy dev overlay to cluster"
	@echo "  make k8s-dev-delete   -> Delete dev deployment"
	@echo "  make k8s-restart      -> Restart deployment pods"
	@echo "  make k8s-status       -> Check rollout status"
	@echo "  make k8s-pods         -> List pods in namespace"
	@echo "  make k8s-svc          -> List services in namespace"


# --------------------------------
# DOCKER COMMANDS
# --------------------------------

# Build Docker image locally using Dockerfile
build:
	docker build -t $(APP_NAME):$(TAG) -f $(DOCKERFILE) $(CONTEXT)

# Tag local image with DockerHub repository name
tag:
	docker tag $(APP_NAME):$(TAG) $(IMAGE_NAME):$(TAG)

# Push tagged image to DockerHub registry
push:
	docker push $(IMAGE_NAME):$(TAG)

# Full pipeline: build image, tag it, and push to DockerHub
release: build tag push
	@echo "Release completed: $(IMAGE_NAME):$(TAG)"


# --------------------------------
# KUBERNETES (DEV ONLY)
# --------------------------------

# Apply Kubernetes dev overlay using kustomize
k8s-dev:
	kubectl apply -k $(K8S_DEV)

# Delete all resources created by dev overlay
k8s-dev-delete:
	kubectl delete -k $(K8S_DEV)

# Restart deployment pods (useful after new image push)
k8s-restart:
	kubectl rollout restart deployment $(APP_NAME) -n $(NAMESPACE)

# Show rollout status (check deployment progress)
k8s-status:
	kubectl rollout status deployment $(APP_NAME) -n $(NAMESPACE)

# List all pods in the namespace (debugging)
k8s-pods:
	kubectl get pods -n $(NAMESPACE)

# List all services in the namespace (network check)
k8s-svc:
	kubectl get svc -n $(NAMESPACE)