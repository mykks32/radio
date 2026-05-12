# Kubectl Commands — FriendsLikeUs Dev

## Install

| Command | Description |
|---|---|
| `brew install kubectl` | Kubernetes command line tool |
| `brew install minikube` | Run Kubernetes locally on Mac |

---

## Start

| Command | Description |
|---|---|
| `minikube start --driver=docker` | Start local Kubernetes cluster using Docker |
| `minikube dashboard` | Open visual dashboard in browser |

---

## Namespace

| Command | Description |
|---|---|
| `kubectl create namespace friendslikeus-dev` | Create isolated space for your app |

---

## Apply Files

| Command | Description |
|---|---|
| `kubectl apply -f icecast-config.yaml` | Create ConfigMap with icecast.xml |
| `kubectl apply -f icecast-deployment.yaml` | Create pod + service for Icecast |

---

## Port Forward

| Command | Description |
|---|---|
| `kubectl port-forward svc/icecast 8000:8000 -n friendslikeus-dev` | Expose Icecast to your Mac |
| `http://localhost:8000/status.xsl` | Verify Icecast is running in browser |

---

## Pods

| Command | Description |
|---|---|
| `kubectl get pods -n friendslikeus-dev` | List all pods |
| `kubectl get pods -n friendslikeus-dev -w` | Watch pods update live |
| `kubectl describe pod <pod-name> -n friendslikeus-dev` | Full detail + error reason |
| `kubectl logs <pod-name> -n friendslikeus-dev` | Print logs once |
| `kubectl logs <pod-name> -n friendslikeus-dev -f` | Follow logs live |
| `kubectl exec -it <pod-name> -n friendslikeus-dev -- /bin/sh` | Get inside pod like SSH |
| `kubectl delete pod <pod-name> -n friendslikeus-dev` | Delete pod (auto restarts) |

---

## Deployments

| Command | Description |
|---|---|
| `kubectl get deployments -n friendslikeus-dev` | List all deployments |
| `kubectl rollout restart deployment/icecast -n friendslikeus-dev` | Restart Icecast pod |
| `kubectl rollout status deployment/icecast -n friendslikeus-dev` | Check if rollout done |
| `kubectl rollout undo deployment/icecast -n friendslikeus-dev` | Go back to previous version |

---

## Services

| Command | Description |
|---|---|
| `kubectl get svc -n friendslikeus-dev` | List all services |
| `kubectl port-forward svc/icecast 8000:8000 -n friendslikeus-dev` | Tunnel to your Mac |

---

## ConfigMaps

| Command | Description |
|---|---|
| `kubectl get configmap -n friendslikeus-dev` | List all ConfigMaps |
| `kubectl describe configmap icecast-config -n friendslikeus-dev` | See icecast.xml content |

---

## Secrets

| Command | Description |
|---|---|
| `kubectl get secrets -n friendslikeus-dev` | List all secrets (values are hidden) |

---

## Apply and Delete

| Command | Description |
|---|---|
| `kubectl apply -f icecast-config.yaml` | Create or update ConfigMap |
| `kubectl apply -f icecast-deployment.yaml` | Create or update deployment |
| `kubectl delete -f icecast-config.yaml` | Remove ConfigMap |
| `kubectl delete -f icecast-deployment.yaml` | Remove deployment and service |

---

## Cluster

| Command | Description |
|---|---|
| `kubectl get nodes` | See all machines in cluster |
| `kubectl get all -n friendslikeus-dev` | See everything in namespace |
| `kubectl get events -n friendslikeus-dev --sort-by='.lastTimestamp'` | See errors and events |

---

## Minikube

| Command | Description |
|---|---|
| `minikube start` | Start the cluster |
| `minikube stop` | Stop the cluster (saves resources) |
| `minikube delete` | Wipe everything and start fresh |
| `minikube dashboard` | Open browser UI |
| `minikube status` | Check if cluster is healthy |
| `minikube service icecast -n friendslikeus-dev --url` | Get direct URL without port-forward |

---

## Terminal Layout

| Terminal | Command | Purpose |
|---|---|---|
| Terminal 1 | `minikube dashboard` | Visual UI |
| Terminal 2 | `kubectl port-forward svc/icecast 8000:8000 -n friendslikeus-dev` | Keep Icecast accessible |
| Terminal 3 | `pnpm run start:dev` | Your NestJS app |
| Terminal 4 | kubectl commands | For debugging |

---

## Most Used Daily

| Command | Description |
|---|---|
| `kubectl get pods -n friendslikeus-dev` | Is my pod running |
| `kubectl logs <pod-name> -n friendslikeus-dev -f` | What is it doing |
| `kubectl describe pod <pod-name> -n friendslikeus-dev` | Why is it failing |
| `kubectl rollout restart deployment/icecast -n friendslikeus-dev` | Restart everything |