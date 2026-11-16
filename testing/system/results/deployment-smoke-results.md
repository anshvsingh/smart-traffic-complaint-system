# Deployment smoke tests (TC-SYS-01, TC-SYS-02)

Run: 17 Nov 2026 00:45 IST · Docker Desktop 29.8.2 · kubectl v1.36.1

## TC-SYS-01: Docker Compose

`docker compose up --build`, then `docker compose ps`:

```
NAMES                  IMAGE                                     STATUS              PORTS
trafficcare-dl         smart-traffic-complaint-system-dl         Up About a minute   0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
trafficcare-frontend   smart-traffic-complaint-system-frontend   Up 9 minutes        0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp
trafficcare-backend    smart-traffic-complaint-system-backend    Up 9 minutes        0.0.0.0:5050->5050/tcp, [::]:5050->5050/tcp
```

Health checks:

```
GET http://localhost:5050/api/health -> {"status":"ok","message":"Smart Traffic Complaint API is running"}
GET http://localhost:8000/health     -> {"success":true,"model_loaded":true,"device":"cpu"}
GET http://localhost:5173/           -> HTTP 200
```

## TC-SYS-02: Kubernetes (Docker Desktop cluster)

`kubectl get deployments,pods,services`:

```
NAME       READY   UP-TO-DATE   AVAILABLE   AGE
backend    1/1     1            1           16d
dl         1/1     1            1           16d
frontend   1/1     1            1           16d

NAME                        READY   STATUS    RESTARTS      AGE
backend-796dc87944-6nqxn    1/1     Running   3 (17m ago)   16d
dl-695bd8466c-hvsh5         1/1     Running   2 (12d ago)   16d
frontend-7756b47488-j5j9l   1/1     Running   2 (12d ago)   16d

NAME         TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE
backend      ClusterIP   10.105.91.69     <none>        5050/TCP   16d
dl           ClusterIP   10.106.112.96    <none>        8000/TCP   16d
frontend     ClusterIP   10.101.147.209   <none>        5173/TCP   16d
kubernetes   ClusterIP   10.96.0.1        <none>        443/TCP    16d
```

Images in the pods (pulled from Docker Hub):

```
backend-796dc87944-6nqxn  ansh6625/smart-traffic-complaint-system-backend:latest
dl-695bd8466c-hvsh5  ansh6625/smart-traffic-complaint-system-dl:latest
frontend-7756b47488-j5j9l  ansh6625/smart-traffic-complaint-system-frontend:latest
```


Service connectivity inside the cluster (run with `kubectl exec` in the backend pod):

```
backend pod -> http://dl:8000/health        -> {"success":true,"model_loaded":true,"device":"cpu"}
backend pod -> http://localhost:5050/api/health -> {"status":"ok","message":"Smart Traffic Complaint API is running"}
```

Access from the host through `kubectl port-forward` (ports 15173/15050, because Compose already used 5173/5050):

```
kubectl port-forward svc/frontend 15173:5173  -> GET http://localhost:15173/ -> HTTP 200
kubectl port-forward svc/backend 15050:5050   -> GET http://localhost:15050/api/health -> {"status":"ok", ...}
```

Observation: requesting the frontend by its in-cluster name (`http://frontend:5173`) returns HTTP 403, because the Vite
development server only accepts known host names. Users reach it through port-forward (works), so this does not affect the
test, but a production image should serve the built files (e.g. with Nginx) instead of the Vite dev server (SAD §13).

## Result

| Case | Result |
|---|---|
| TC-SYS-01 Docker Compose: 3 containers up and healthy, real trained model loaded | Pass |
| TC-SYS-02 Kubernetes: 3 deployments 1/1, pods Running, services resolve, images from Docker Hub | Pass |

Note: the first `docker compose up` stopped the DL container with "Model weights not found", because the DVC-tracked
`best_model.pth` was not in the local checkout (no DVC remote is configured). The file was copied from the Kubernetes DL pod
(md5 `8c2c7a7244f13208324f12da7c6bca90`, identical to `dl/models/best_model.pth.dvc`) and the DL image rebuilt.
