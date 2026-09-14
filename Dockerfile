# syntax=docker/dockerfile:1

# Baarik, for Cloud Run (asia-south1).
#
# Three stages, because resolving the dependency tree is by far the slowest step and it
# must not be repeated every time a clause template changes. `deps` sees the two
# manifests and nothing else, so an edit under `src/` reuses the cached `npm ci` layer
# and the rebuild is the build alone.
#
# node:24-alpine: package.json requires >= 20.9 and the project is developed on 24, so
# the container runs the runtime the code was written against rather than a nearby one.


# --- deps ----------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

# Manifests only. Copying the source here would invalidate `npm ci` on every edit,
# which is the entire cost of a rebuild.
COPY package.json package-lock.json ./

# Deliberately not `--omit=dev`: the build needs TypeScript, Tailwind and the Next
# plugin. They never reach the runner, because the standalone output traces only what
# the server imports and the runner stage copies only that.
RUN npm ci


# --- builder -------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No key is passed in, and no ARG carries one — a build argument survives in
# `docker history` for anyone who pulls the image. Nothing here needs one: CI already
# runs this build with no GEMINI_API_KEY in the environment, because
# `src/server/config/env.ts` is read when a request arrives, not when a page compiles.
RUN npm run build

# There is no `public/` in this repository today. Creating it here keeps the runner's
# COPY honest either way: a plain `COPY /app/public` fails the build outright when the
# directory is absent, and the wildcard tricks that work around that fail silently,
# which is the worse of the two.
RUN mkdir -p public


# --- runner --------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Cloud Run injects PORT and routes to whatever it injected; declaring the same default
# here means a local `docker run -p 8080:8080` behaves identically. HOSTNAME must be
# 0.0.0.0 — the standalone server binds localhost otherwise, and every request from
# outside the container then times out with nothing written to the log to explain it.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# The `node` user (uid 1000) ships with the image, so no useradd layer is needed.
# Everything is chowned to it because the process only ever reads: nothing in the
# request path writes to disk (ADR 0008), so an application directory writable by the
# server would be a liability with no matching benefit.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# The two directories the standalone output does not owe you.
#
# `src/server/knowledge/repository.ts` and `src/server/samples/repository.ts` resolve
# these from `process.cwd()` when a request arrives, so nothing imports them. Next's
# tracer currently infers both from the `readFileSync` calls it can read statically and
# copies them into `.next/standalone` anyway — which means the two lines below look
# redundant right up until the heuristic misses, and a heuristic that misses does not
# fail the build. It produces an image that starts, serves the landing page, scores
# every document zero because the rubric is empty, and 404s every sample link. Nothing
# about that is visible until somebody clicks.
#
# So these are copied by name. 520 KB to convert a silent failure into an impossible
# one is the cheapest trade in this file.
#
# Expect 43 rubric rules, 11 enforceability rows, 9 forums, 7 limitation rules
# (`data/`) and 7 sample reports (`golden/reports/`). `curl $URL/api/health` prints all
# five; `npm run validate` prints the same numbers from the repository.
#
# `golden/llm/` rides along inside `golden/`. It is replay material for the offline
# tests rather than something a request reads, but it is ~200 KB and copying the
# directory whole means a file added under `golden/` later cannot go missing from the
# image because nobody remembered to widen this line.
COPY --from=builder --chown=node:node /app/data ./data
COPY --from=builder --chown=node:node /app/golden ./golden
# The documents those reports were recorded from. A sample report quotes its source,
# and `fixtureDocument` resolves it relative to the working directory, so this is what
# makes `/report/nda-mutual-but-not` render a document rather than a 404.
COPY --from=builder --chown=node:node /app/fixtures ./fixtures

USER node

EXPOSE 8080

# Cloud Run ignores HEALTHCHECK entirely — it probes the container port itself — so this
# exists only for `docker run` on a laptop, where it is the difference between "the
# container is up" and "the container can answer". It is written in node rather than
# curl so the runner does not gain a package, and a CVE surface, for a line the actual
# deployment target will not read. Expect "unhealthy" locally with no key configured:
# /api/health answers 503 when there is no usable Gemini key, which is the true answer.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>{process.exit(1)})"

CMD ["node", "server.js"]
