#!/usr/bin/env bash
#
# Deploy Baarik to Cloud Run.
#
# Read docs/DEPLOYMENT.md before the first run: the prerequisites (billing account,
# four enabled APIs, one secret) are not created here, because a deploy script that
# quietly provisions cloud resources is a deploy script that quietly spends money.
#
# Every run creates a new revision and Cloud Run keeps the previous one serving until
# the new one is healthy, so a bad deploy is a rollback rather than an outage. The
# rollback command is in the docs and in the failure message below.
#
# `set -u` earns its place here more than usual: every value below can be overridden
# from the environment, and an unset variable expanding to nothing is how a deploy
# lands in the wrong project or maps a secret that does not exist.
set -euo pipefail

# asia-south1 (Mumbai) because the readers are in India, and cold-start latency is the
# only latency a min-instances=0 service gets to choose.
SERVICE="${SERVICE:-baarik}"
REGION="${REGION:-asia-south1}"

# The Secret Manager secret holding the Gemini key material. Never an env var — see the
# note on --set-secrets below.
SECRET="${SECRET:-gemini-api-key}"

readonly SERVICE REGION SECRET

# The counts a healthy revision must report. They come from the committed knowledge
# base, not from the model, so they are fixed until data/ or golden/ changes — and
# `npm run validate` prints the same five numbers from the repository.
readonly EXPECTED='43 rubric rules, 11 enforceability rows, 9 forums, 7 limitation rules, 7 samples'

# `--source .` uploads the current working directory, so the script must not depend on
# where the caller happened to be standing. Uploading the wrong directory deploys the
# wrong code, and it deploys successfully.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

project="$(gcloud config get-value project 2>/dev/null || true)"
if [[ -z "${project}" || "${project}" == "(unset)" ]]; then
  echo "No active gcloud project. Run: gcloud config set project <PROJECT_ID>" >&2
  exit 1
fi

echo "Service: ${SERVICE}"
echo "Region:  ${REGION}"
echo "Project: ${project}"
echo "Secret:  ${SECRET}:latest -> GEMINI_API_KEY"
echo "Source:  $(pwd)"
echo

# ---------------------------------------------------------------------------------------
# The flags, and why each one is not the default.
#
# --set-secrets, never --set-env-vars. An env var set this way is stored in the service
#   configuration in plaintext, is printed by `gcloud run services describe`, and is
#   visible to anyone with Viewer on the project. A secret reference stores only the
#   pointer; the value is fetched by the runtime and is governed by IAM on the secret,
#   so access can be granted and revoked without redeploying.
#
# --min-instances=0 is mandatory, not a preference. An always-warm instance bills for
#   every second of the month and burns roughly seven times the free tier's allowance on
#   its own. The cost is a cold start on the first request after idle; the alternative is
#   a bill for a service nobody is using.
#
# --max-instances=3 is the blast radius. Cloud Run's own default is 100 per region, and
#   100 concurrent instances is how a scripted upload loop — or a crawler that found the
#   analyse endpoint — turns into an invoice. Three is enough for a demo and small enough
#   to survive being wrong about that.
#
# --memory=512Mi --cpu=1 fits the workload: PDF and DOCX parsing happens in memory, and
#   the largest thing held at once is one document plus one report.
#
# --timeout=300 covers a full analysis, which spends two model calls back to back and is
#   at the mercy of the Gemini API's own latency.
#
# --allow-unauthenticated because the audience is the public and an evaluator with a
#   link. It is also why max-instances matters.
# ---------------------------------------------------------------------------------------
#
# Six Gemini keys, one secret.
#
# Free-tier quota is 20 requests per day per model per key and a full analysis spends two
# of them, so a single key is ten analyses a day — less than one judging session. This
# project runs six: `GEMINI_API_KEY` plus `GEMINI_API_KEY_1` through `GEMINI_API_KEY_5`.
#
# `src/server/config/env.ts` accepts either shape and mixes them freely. It splits any
# value on commas or whitespace, AND scans the whole environment for variables beginning
# `GEMINI_API_KEY`, de-duplicating what it finds. So both of these work:
#
#   one secret, comma-separated    --set-secrets=GEMINI_API_KEY=gemini-api-key:latest
#   six secrets, one per key       --set-secrets=GEMINI_API_KEY=gemini-api-key:latest,\
#                                    GEMINI_API_KEY_1=gemini-api-key-1:latest,...
#
# Recommended, and what this script does: one secret holding all six comma-separated.
# It is one resource to create, one IAM binding to grant to the runtime service account,
# and one place to add a seventh key — a new secret version, with no redeploy and no edit
# to this file. Six secrets means six of each, and a key added to the environment but not
# to the deploy command is a key the pool silently never uses.
#
# The honest cost: rotating one key means rewriting the whole list into a new version.
# That is acceptable because a key is rotated when it is burned, and a burned key is
# replaced rather than repaired. Prefer the six-secret shape only if the keys belong to
# different people who must not be able to read each other's.

echo "Deploying. First build from source takes several minutes."
gcloud run deploy "${SERVICE}" \
  --source . --region "${REGION}" \
  --min-instances=0 --max-instances=3 \
  --memory=512Mi --cpu=1 --timeout=300 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=${SECRET}:latest"

url="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)')"
echo
echo "Deployed: ${url}"

# The verification is part of the deploy, not an optional follow-up.
#
# `output: 'standalone'` copies the traced server bundle and no data directories. An
# image missing data/ or golden/ starts, passes Cloud Run's port probe, and serves the
# landing page — then scores every document zero and 404s every sample. The only cheap
# way to tell the two apart from outside is to ask for the counts.
if ! command -v curl >/dev/null 2>&1; then
  echo
  echo "curl not found, so this revision is UNVERIFIED. Before trusting it, open:"
  echo "  ${url}/api/health"
  echo "and check the counts read: ${EXPECTED}"
  exit 0
fi

echo "Checking ${url}/api/health — expecting ${EXPECTED}"

# Deliberately not `curl -f`: on a 503 that flag suppresses the body, and the body is
# the whole point — it carries the `problems` array naming what failed to load. So the
# status code is appended as a last line and split off instead.
response="$(curl -sS --max-time 30 -w $'\n%{http_code}' "${url}/api/health" || true)"
status="${response##*$'\n'}"
echo "${response%$'\n'*}"
echo

if [[ "${status}" != "200" ]]; then
  echo "Health check returned ${status:-no response}. This revision is NOT serving." >&2
  echo "A zero for rubricRules or samples means data/ or golden/ did not reach the" >&2
  echo "image; geminiKeys: 0 means the secret is unmapped or unreadable by the" >&2
  echo "runtime service account. Roll back with:" >&2
  echo "  gcloud run revisions list --service ${SERVICE} --region ${REGION}" >&2
  echo "  gcloud run services update-traffic ${SERVICE} --region ${REGION} --to-revisions <PREVIOUS>=100" >&2
  exit 1
fi

echo "Healthy. Check the counts above read: ${EXPECTED}"
