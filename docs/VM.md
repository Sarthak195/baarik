# The `baarik-build` VM

A Container-Optimized OS instance for running and inspecting the container image
without a Docker daemon on a laptop.

**It is not on the deployment path.** `gcloud run deploy --source .` builds in Cloud
Build and never touches this machine. The VM exists for the times you want to poke at
a running container — read its filesystem, watch it start, reproduce a production-only
fault — which is awkward to do against Cloud Run and trivial here.

| | |
|---|---|
| Name | `baarik-build` |
| Zone | `asia-south1-c` |
| Type | `e2-medium` (2 vCPU, 4 GB), 30 GB balanced disk |
| Image | `cos-stable` — Docker preinstalled, read-only root |
| State | **Stopped.** A stopped instance bills only for its disk |

## Start, use, stop

```bash
gcloud compute instances start baarik-build --zone=asia-south1-c
gcloud compute ssh baarik-build --zone=asia-south1-c --tunnel-through-iap
# ... when finished, and this matters:
gcloud compute instances stop baarik-build --zone=asia-south1-c
```

Stopping is the step that gets forgotten. A running `e2-medium` costs roughly a dollar
a day; stopped, it costs a few cents a month for the disk.

## Two things about Container-Optimized OS that will bite you

**Docker needs `sudo`,** because the login user is not in the `docker` group and the
image is immutable by design.

**The root filesystem is read-only,** so `docker login` cannot write `/root/.docker`
and fails with `mkdir /root/.docker: read-only file system`. Point `DOCKER_CONFIG` at
tmpfs instead. Authenticating to Artifact Registry, in full:

```bash
mkdir -p /tmp/dockercfg
TOKEN=$(curl -s -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
echo "$TOKEN" | sudo DOCKER_CONFIG=/tmp/dockercfg docker login \
  -u oauth2accesstoken --password-stdin https://asia-south1-docker.pkg.dev
```

The token comes from the metadata server rather than a key file, so nothing has to be
copied onto the machine and nothing expires into a support ticket.

## Running the image Cloud Run is actually serving

```bash
IMG=$(gcloud run services describe baarik --region=asia-south1 \
  --format="value(spec.template.spec.containers[0].image)")

sudo DOCKER_CONFIG=/tmp/dockercfg docker pull "$IMG"
sudo docker run -d --name baarik-vm -p 8080:8080 \
  -e GEMINI_API_KEY=placeholder_not_a_real_key "$IMG"

curl -s http://localhost:8080/api/health
sudo docker rm -f baarik-vm
```

`/api/health` is the thing worth checking first. It reports the four knowledge-base
counts, so a mismatch against `npm run validate` means `data/` did not reach the image
— the one failure this project's `Dockerfile` exists to prevent, and one that otherwise
looks like a healthy container until someone tries to analyse a document.

A placeholder key is enough for everything except analysis: the landing page, the
sample reports and the health endpoint all work without a real credential, because the
key is resolved lazily on first use rather than at startup.

## Deleting it

Nothing depends on this VM. When it has served its purpose:

```bash
gcloud compute instances delete baarik-build --zone=asia-south1-c
```
