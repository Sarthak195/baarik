# Deployment

Baarik on Google Cloud Run, `asia-south1`.

> **This is now a record of what was done, not a plan for what to do.**
>
> The service is deployed and serving: eight revisions have been built by Cloud Build and
> released to Cloud Run in `asia-south1`, the most recent being `baarik-00008-bcg`.
> `/api/health` answers `ok:true` with 43 rubric rules, 7 samples and 6 keys, so `data/`,
> `golden/` and `fixtures/` all reached the image. Latency has been measured against a
> live key rather than estimated — see the `--timeout` row below. The list of things that
> remain genuinely unexercised is at [Still unverified](#still-unverified), and it is now
> short.

---

## The failure this document exists to prevent

`next.config.ts` sets `output: 'standalone'`. That mode emits `.next/standalone/server.js`
carrying only the modules the server's import graph traced — which is why the image is
small, and also the whole problem.

Nothing imports `data/`, `golden/` or `fixtures/`. They are opened at request time, by
path, from `process.cwd()`:


| Directory | Read by | Holds |
|---|---|---|
| `data/` | `src/server/knowledge/repository.ts` | 43 rubric rules, 11 enforceability rows, 9 forums, 7 limitation rules |
| `golden/` | `src/server/samples/repository.ts` | 7 recorded sample reports (plus 7 replay recordings), ~390 KB |
| `fixtures/` | `src/server/samples/fixtures.ts` | The 7 documents those reports were recorded from, ~84 KB |

A container that does not copy them **builds, boots, passes Cloud Run's port probe and
serves the landing page**. Then the rubric is empty, so every uploaded document scores
zero and produces no findings; and `golden/reports/` or `fixtures/` is empty, so every
"try a sample" link 404s. Nothing is red. Nothing is in the log. It looks fine right up until somebody
clicks.

There is a trap here worth naming. On Next 16.3.5 the file tracer *does* currently infer
both directories from the `readFileSync` calls it can read statically, and copies them
into `.next/standalone` without being asked — so an image built without the explicit
copies may well work, and then stop working on a version bump or after a refactor that
puts a path behind a variable the tracer cannot follow. Neither event fails the build.
Do not rely on the inference:

```dockerfile
COPY --from=builder --chown=node:node /app/data ./data
COPY --from=builder --chown=node:node /app/golden ./golden
COPY --from=builder --chown=node:node /app/fixtures ./fixtures
```

And `/api/health` exists to make the absence loud — see [Verify](#verify).

---

## Prerequisites

Done once per project. None of it is done by `scripts/deploy.sh`, on purpose: a script
that provisions cloud resources on the way past is a script that spends money without
being asked.

**1. A project with a billing account attached.** Cloud Run's free tier is real, but it
is a discount on a billed service, not an unbilled service. Without a billing account
the APIs below refuse to enable.

```bash
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud config get-value project          # confirm before anything else
```

**2. Four APIs.** `run` serves it, `cloudbuild` builds the image from source,
`artifactregistry` stores the result, `secretmanager` holds the key.

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

**3. `gcloud` and `docker` on the deploying machine.** `docker` is optional — `--source .`
builds remotely on Cloud Build — but a local `docker build` is the only way to inspect
the image before it is public.

---

## Create the secret

The six keys go into one secret as a comma-separated list. `src/server/config/env.ts`
splits any `GEMINI_API_KEY*` value on commas or whitespace and de-duplicates the result,
so one secret carries the whole pool.

```bash
printf '%s' "KEY1,KEY2,KEY3,KEY4,KEY5,KEY6" \
  | gcloud secrets create gemini-api-key --data-file=-
```

`printf` rather than `echo`, and `--data-file=-` rather than `--data-file` with a path:
`echo` appends a newline that becomes part of the last key, and a file on disk containing
six live keys outlives the five seconds you meant it to exist for. (A trailing newline
would in fact be tolerated — the splitter treats whitespace as a separator — but relying
on that is relying on the wrong thing.)

Grant the runtime service account permission to read it. Cloud Run runs as the Compute
Engine default service account unless told otherwise:

```bash
PROJECT_NUMBER="$(gcloud projects describe "$(gcloud config get-value project)" \
  --format='value(projectNumber)')"

gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

To rotate or extend the pool later, add a version — no redeploy, because the service
references `:latest`:

```bash
printf '%s' "KEY1,...,KEY7" | gcloud secrets versions add gemini-api-key --data-file=-
```

### Why six keys, and why one secret

Free-tier Gemini quota is **20 requests per day, per model, per key**. A full analysis
spends two. One key is therefore ten analyses a day — less than a single judging session.
The project runs six (`GEMINI_API_KEY` plus `GEMINI_API_KEY_1` … `GEMINI_API_KEY_5`) and
`KeyPool` round-robins across them, moving a key to the back of the rotation on a 429, so
a rate limit degrades into a slower response instead of an outage.

`env.ts` accepts two shapes and mixes them: a separated list in one variable, and any
number of variables whose name begins `GEMINI_API_KEY`. Both reach the same pool.

| Shape | Deploy flag | Trade |
|---|---|---|
| **One secret, comma-separated** *(recommended)* | `--set-secrets=GEMINI_API_KEY=gemini-api-key:latest` | One resource, one IAM binding, one place to add a seventh key. Rotating one key means rewriting the list into a new version. |
| Six secrets, one per key | six `KEY=secret:latest` pairs in one `--set-secrets` | Each key rotates independently and can be ACL'd separately. Six resources and six bindings to keep in step; a key added to Secret Manager but not to the deploy command is a key the pool never sees. |

Take the second only if the keys belong to different people who must not read each
other's.

---

## Deploy

```bash
scripts/deploy.sh
```

which runs exactly this, and then verifies it:

```bash
gcloud run deploy baarik \
  --source . --region asia-south1 \
  --min-instances=0 --max-instances=3 \
  --memory=512Mi --cpu=1 --timeout=600 \
  --allow-unauthenticated \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest
```

`SERVICE`, `REGION` and `SECRET` can be overridden from the environment.

### What each flag is holding back

| Flag | Default if omitted | Why it is set |
|---|---|---|
| `--set-secrets` | — | **Never `--set-env-vars` for the key.** An env var set that way is stored in the service config in plaintext, printed by `gcloud run services describe`, and readable by anyone with Viewer on the project. A secret reference stores only a pointer; access is IAM on the secret and can be revoked without redeploying. |
| `--min-instances=0` | 0 | Mandatory, not a preference. One always-warm instance bills for every second of the month and burns roughly **seven times** the free tier's allowance by itself. The price is a cold start after idle. |
| `--max-instances=3` | **100 per region** | The blast radius. 100 concurrent instances is how a scripted upload loop, or a crawler that found the analyse endpoint, becomes an invoice. Three serves a demo and is small enough to survive being wrong. |
| `--allow-unauthenticated` | authenticated | The audience is the public and an evaluator holding a link. It is also precisely why the line above matters. |
| `--memory=512Mi --cpu=1` | 512Mi / 1 | Stated rather than inherited: PDF and DOCX parsing happens in memory, and the peak is one document plus one report. |
| `--timeout=600` | 600s | Not a guess. A real analysis of the smallest fixture measured 163s in `asia-south1` and 188s locally; the ceiling was 300s, and on 14 September a slower-than-usual run crossed it and every model-backed request answered a bare 504. The work waits on Gemini's latency rather than ours, so this has to clear the worst case a retry can produce, not the median. The per-call budget that stops a *hung* call is `LIMITS.requestTimeoutMs`, wired into the SDK in `src/server/genai/client.ts`; this number only has to be comfortably larger than that. |

### What gets uploaded

`--source .` uploads the working directory to Cloud Build, which then builds the
`Dockerfile`. Two ignore files act at two different moments, and confusing them is how a
deploy gets slow:

- **`.gcloudignore`** decides what `gcloud` uploads. There is none in this repository, and
  in that case `gcloud` derives one from `.gitignore` — which already excludes
  `node_modules/`, `.next/` and `.env`. Check the `Uploading tarball of [.]` line on the
  first deploy; if the size looks wrong, that is the file to add.
- **`.dockerignore`** decides what the build itself sees, once the context has arrived.

---

## Verify

**A successful deploy is not evidence that the service works.** Do this every time.

```bash
URL="$(gcloud run services describe baarik --region asia-south1 --format='value(status.url)')"
curl -fsS "$URL/api/health"
```

Expected:

```json
{
  "ok": true,
  "rubricRules": 43,
  "enforceabilityRows": 11,
  "forums": 9,
  "limitationRules": 7,
  "samples": 7,
  "geminiKeys": 6,
  "model": "..."
}
```

Those five knowledge-base counts are exactly what `npm run validate` prints locally, from
the same committed files. **They must match.** The endpoint returns `503` and a `problems`
array when they do not, so `curl -fsS` fails loudly rather than printing a reassuring blob.

That block is not aspirational: it is what the built image returns. Run locally with six
placeholder keys, `baarik-test` answers `200` with `rubricRules: 43`,
`enforceabilityRows: 11`, `forums: 9`, `limitationRules: 7`, `samples: 7`,
`geminiKeys: 6`, and `GET /api/sample?id=rent-agreement-koramangala` returns a real
report out of `golden/reports/`. With no key it answers `503`, `geminiKeys: 0`, and the
five counts still correct — which is the shape to expect if the secret mapping is the
only thing wrong.

| Symptom | Meaning |
|---|---|
| `rubricRules: 0`, or `problems` mentions `data/ did not load` | `data/` is not in the image. The `COPY … /app/data` line is missing or the build context excluded it. |
| `samples: 0`, or `problems` mentions `golden/` | `golden/` is not in the image. Same cause; the demo path will 404. |
| `geminiKeys: 0` | The secret is not mapped, or the runtime service account lacks `secretAccessor` on it. |
| `geminiKeys` lower than expected | Duplicate keys — the pool de-duplicates — or a mangled separator in the secret's value. |
| Any non-zero count that disagrees with `npm run validate` | The image was built from different source than the checkout. |

Note that `/api/health` never calls the model. An uptime probe that spent a request per
check would exhaust the daily quota by lunchtime and become the outage it was watching
for. It reports configuration, which is what actually breaks.

Then click once by hand: open a sample report. That exercises `golden/` through the real
route rather than through a count.

---

## Rollback

Cloud Run keeps every revision. Rolling back is a traffic change, not a rebuild, and
takes seconds.

```bash
gcloud run revisions list --service baarik --region asia-south1

gcloud run services update-traffic baarik --region asia-south1 \
  --to-revisions <PREVIOUS_REVISION>=100
```

To return to the newest revision afterwards:

```bash
gcloud run services update-traffic baarik --region asia-south1 --to-latest
```

Because `--min-instances=0`, a rolled-back revision costs nothing while it sits there, so
there is no reason to delete old revisions in a hurry.

---

## Cost guards

**A GCP budget alerts. It does not cap.** Read that twice before relying on one. A budget
sends email at a threshold and the service keeps serving and keeps billing. Treat it as a
smoke detector, not a sprinkler.

The guards, weakest to strongest:

**1. The deploy flags.** `--min-instances=0` and `--max-instances=3` are the only controls
that limit spend *before* it happens, which makes them the important ones. Everything
below is detection.

**2. A budget alert.** Set one anyway — detection beats nothing:

```bash
gcloud billing budgets create \
  --billing-account=<BILLING_ACCOUNT_ID> \
  --display-name="baarik" \
  --budget-amount=5USD \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9
```

**3. Unlink billing — the actual kill switch.** This stops the spend, immediately and
unconditionally, by removing the project's ability to bill:

```bash
gcloud billing projects unlink <PROJECT_ID>
```

The service stops serving. That is the point: it is what you reach for when something is
running away and you would rather be down than surprised. Relinking restores it:

```bash
gcloud billing projects link <PROJECT_ID> --billing-account=<BILLING_ACCOUNT_ID>
```

If this matters enough to automate, the documented path is a Pub/Sub topic on the budget
driving a Cloud Function that calls `unlink`. That is not set up here, and setting it up
costs more to run than it is likely to save on a project this size.

---

## Building the image locally

Optional, and the only way to see inside the image before it is public. This has been
done: the image builds clean and comes out around 300 MB.

```bash
docker build -t baarik-test .

# The check this whole document is about:
docker run --rm baarik-test ls data golden

# Serve it. Expect /api/health to answer 503 without a key — that is the correct answer,
# and the response body names what is missing.
docker run --rm -p 8080:8080 baarik-test
curl -sS localhost:8080/api/health
```

To exercise it properly, pass the pool in — from the shell, never baked into the image:

```bash
docker run --rm -p 8080:8080 -e GEMINI_API_KEY="KEY1,KEY2,..." baarik-test
```

The image carries no key at any layer and no `ARG` accepts one; a build argument is
visible in `docker history` to anyone who pulls the image.

One thing to know if you ever edit `.dockerignore`: **`next build` copies a `.env` it
finds into `.next/standalone/.env`.** That is observed behaviour here, not a worry — run
`ls -a .next/standalone/` after a local `npm run build` and it is sitting there. The
runner stage copies the whole standalone directory, so dropping the `.env` line from
`.dockerignore` would place six live keys inside a public image as a plain readable file.
That line is not tidiness.

---

## Still unverified

Stated plainly, because the rest of this document reads like it has all been done.

**Verified** — built and run on a developer machine:

- `docker build` succeeds; the image is ~300 MB and runs as uid 1000 (`node`), not root.
- `data/` (11 YAML files) and `golden/` (7 reports) are present at `/app` inside it, and
  no `.env` is.
- `/api/health` returns the five correct counts; `/api/sample` serves a real golden
  report; `/` renders.
- A single comma-separated `GEMINI_API_KEY` produces a pool of six, which is the shape
  the recommended secret uses.

**Verified in production** — executed, not inferred:

- Eight revisions deployed via `gcloud run deploy --source .`; `baarik-00008-bcg` serves
  100% of traffic. Cloud Build compiles the image; no Docker daemon is involved locally.
- `/api/health` returns `ok:true` with `rubricRules: 43`, `samples: 7`, `geminiKeys: 6`.
  The pool de-duplicates, so that endpoint remains the authority on what the service has.
- A full analysis of the smallest fixture: **163s**. The same document again: **0.14s**,
  served by the analysis cache with no model call, with `cachedAnalyses` incrementing.
- Security headers and a per-request CSP nonce confirmed on live responses; every
  `<script>` on five routes carries the nonce from its own response header.
- A malformed request body answers 400; the request ceiling is 600s.

**Still not verified:**

- No budget alert exists. `gcloud billing budgets create --help` is the authority if the
  flag spelling below is rejected; the Cloud Billing API is not enabled on the project.
- Cold-start latency has not been isolated from analysis latency — the 163s figure is a
  warm-path measurement and includes the model calls.
- The local `docker build` path in this document is unexercised: Docker is deliberately
  not installed on the author's machine, and Cloud Build is the only build route used.
