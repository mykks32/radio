# Radio App — Local Development & Deployment Guide

## Prerequisites

- Docker Desktop (macOS)
- Minikube
- kubectl
- make

---

## 1. Build & Push Docker Image

Build the image locally, tag it, and push to DockerHub in one step:

```bash
make release
```

Or run each step individually:

```bash
make build    # Build Docker image locally
make tag      # Tag image for DockerHub
make push     # Push image to DockerHub registry
```

To release a specific version:

```bash
make release TAG=v1.0.0
```

---

## 2. Deploy to Kubernetes (Dev)

Apply the dev overlay using kustomize:

```bash
make k8s-dev
```

To tear down the dev deployment:

```bash
make k8s-dev-delete
```

---

## 3. Enable Ingress on Minikube

The NGINX ingress controller must be enabled before ingress resources work:

```bash
minikube addons enable ingress
```

Wait for the controller pod to be ready (this pulls images and may take a few minutes):

```bash
kubectl get pods -n ingress-nginx -w
```

Wait until you see:

```
ingress-nginx-controller-xxxxxx   1/1   Running   0   2m
```

---

## 4. macOS: Enable Ingress Access via Tunnel

> **Why is this needed on macOS?**
>
> On macOS, Docker runs inside a hidden Linux VM. The Minikube IP (`192.168.49.2`) only exists inside that VM and is not reachable from your Mac host directly. `minikube tunnel` creates a network route from `127.0.0.1` on your Mac through to Minikube.

Run the tunnel in a dedicated terminal and **keep it open**:

```bash
minikube tunnel
```

It will prompt for your sudo password.

---

## 5. Configure `/etc/hosts`

Add the following entries so your local hostnames resolve correctly:

```bash
sudo nano /etc/hosts
```

```
127.0.0.1 radio.icecast.com
127.0.0.1 radio.app.com
```

> If you are on Linux (Docker runs natively), use `192.168.49.2` instead of `127.0.0.1`.

---

## 6. Verify Everything Is Running

```bash
# Check pods, services, endpoints, and ingresses
kubectl get ingress,svc,endpoints,pods -n radio

# Check ingress address is assigned (should show 127.0.0.1)
kubectl get ingress -n radio
```

Test the endpoints:

```bash
curl http://radio.icecast.com
curl http://radio.app.com
```

---

## 7. Common Operations

```bash
make k8s-restart    # Restart pods after a new image push
make k8s-status     # Check rollout progress
make k8s-pods       # List all pods in the namespace
make k8s-svc        # List all services in the namespace
```

---

## 8. Debugging

**Ingress not getting an address:**
```bash
kubectl get pods -n ingress-nginx
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=50
```

**No endpoints showing:**
```bash
kubectl describe service icecast -n radio
kubectl get pods -n radio --show-labels
```
Make sure the service selector matches the pod labels.

**Cannot reach the app from browser:**
```bash
# Confirm tunnel is running
minikube tunnel

# Test from inside Minikube
minikube ssh
curl -H "Host: radio.icecast.com" http://127.0.0.1
```

---

## Makefile Reference

| Command | Description |
|---|---|
| `make build` | Build Docker image locally |
| `make tag` | Tag image for DockerHub |
| `make push` | Push image to DockerHub |
| `make release` | Build + tag + push in one step |
| `make k8s-dev` | Deploy dev overlay to cluster |
| `make k8s-dev-delete` | Delete dev deployment |
| `make k8s-restart` | Restart deployment pods |
| `make k8s-status` | Check rollout status |
| `make k8s-pods` | List pods in namespace |
| `make k8s-svc` | List services in namespace |