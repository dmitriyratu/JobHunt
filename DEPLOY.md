# Deploying JobHunt to Vercel

The app is a standard Next.js project with **no database and no server-side
state** — every application, resume, and letter lives in the visitor's own
browser (`localStorage` + IndexedDB). That means:

- Each browser gets its own private history automatically. No accounts needed.
- Nothing syncs between your laptop and your phone — they're separate histories.
- Clearing browsing data clears the history; there's no server copy.

## Environment variables

**None are required**, and that's deliberate.

In production the app does **not** fall back to a server-side `OPENAI_API_KEY`.
A public URL with no auth and no rate limiting would otherwise let any visitor
spend the owner's OpenAI credits. Every visitor supplies their own key in
**AI settings**, and it never leaves their browser except to call OpenAI.

| Variable | Needed? | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Local dev only | Convenience so you don't paste a key on localhost. Ignored in production. |
| `ALLOW_SERVER_OPENAI_KEY` | Optional | Set to `true` **only** for a private deployment where you accept that any visitor spends your credits. Requires `OPENAI_API_KEY` to also be set in Vercel. |
| `FEEDBACK_WEBHOOK_URL` | Optional | Where the **Feedback** button delivers to. Unset, feedback is logged server-side and the sender is told plainly that it wasn't delivered, with their text offered back to copy. |
| `LATEX_SERVICE_URL` | Needed for PDFs | Where to compile LaTeX. Unset, the app spawns a local `tectonic` binary, which works on your own machine and **cannot** work on Vercel. See [Compiling PDFs](#compiling-pdfs). |
| `LATEX_SERVICE_TOKEN` | With the above | Shared secret for that service. Unset on both sides means anyone who finds the URL can spend your CPU. |

### Receiving feedback

The app has no database, so feedback needs somewhere to go. Any endpoint
accepting a JSON `POST` works — the body carries a Slack/Discord-style `text`
field plus structured `message`, `context` and `screenshot`.

The quickest option is a Slack incoming webhook: create one at
<https://api.slack.com/messaging/webhooks>, then set it in Vercel:

```bash
npx vercel env add FEEDBACK_WEBHOOK_URL production
```

Discord webhooks and Zapier catch hooks work the same way.

**What gets sent:** the message, which page the sender was on, whether they had
a resume / posting / match report / letter, their viewport and user agent, and a
screenshot only if they attached one. Never the resume, posting or letter text.

Do not set `OPENAI_API_KEY` in Vercel unless you are also deliberately setting
`ALLOW_SERVER_OPENAI_KEY=true`.

## Deploy

The repo is already on GitHub at `dmitriyratu/JobHunt`, so the simplest path is
to import it once and let every push deploy itself:

1. Go to <https://vercel.com/new>
2. Import **dmitriyratu/JobHunt**
3. Accept the detected defaults (Next.js, `npm run build`) — no env vars needed
4. Deploy

Or from the CLI in this directory:

```bash
npx vercel login     # interactive; only you can do this
npx vercel --prod
```

## Compiling PDFs

**This needs nothing from you. It is here because when it breaks, nothing else
in the app explains what you are looking at.**

The resume is typeset by [Tectonic](https://tectonic-typesetting.github.io/), a
LaTeX engine the app runs as a program. On your own machine that works with no
setup — install Tectonic and the app finds it, including at the path the Windows
installer uses. A Vercel function is a different computer: no Tectonic, no way
to install one, and a read-only disk.

The engine therefore travels with the code. `npm run build` runs
`scripts/fetch-tectonic.mjs`, which on a Linux build downloads Tectonic and
compiles a throwaway document to fill its TeX cache, both into `vendor/`.
`next.config.ts` ships that directory with the two routes that typeset. There
is no service to deploy, no environment variable to set, and no second bill.

It fits because it is small:

| | |
|---|---|
| `vendor/tectonic/bin/tectonic` | 26 MB — the statically-linked musl build, no shared libraries to satisfy |
| `vendor/tectonic/cache` | 55 MB — every TeX file this preamble asks for |
| | **81 MB**, against the 250 MB a function is allowed |

Both are gitignored. They are build output, rebuilt on every deploy.

### Why the build spends a minute on this

Tectonic downloads the TeX files a document asks for and caches them, so an
empty cache means the first real compile pulls them over the network — slow at
best, impossible on a read-only disk. Both builds therefore compile
`service/warm.tex` purely for the side effect of filling that cache:
`scripts/fetch-tectonic.mjs` for the Vercel bundle, the `Dockerfile` for the
container image. One document, so the two cannot disagree about what to warm.

**`warm.tex` mirrors the preamble in `src/lib/resumeLatex.ts`, and on the
bundled path that is now load-bearing.** The cache ships read-only, so a package
the warm-up never fetched cannot be fetched at runtime either — it fails the
compile, with a message saying so:

> This document needs a TeX package that wasn't bundled at build time. Add it
> to service/warm.tex, which mirrors the preamble, and redeploy.

If you add a `\usepackage` to `preambleFor()`, add it to `warm.tex` in the same
commit. Under the container this only cost one slow compile; here it is the
difference between a document that builds and one that doesn't.

That constraint holds only for the preamble the app generates. Editing the body
of a document — which is all the editor exposes unless you switch to full
source — cannot reach outside the bundled cache.

### When the engine is missing

If the deployed site says **"Tectonic is not installed"**, the build did not
bundle one. The build log is where to look — the script announces itself on
every line it prints:

```
[tectonic] downloading tectonic-0.17.0-x86_64-unknown-linux-musl.tar.gz
[tectonic] Tectonic 0.17.0
[tectonic] warming the bundle cache…
[tectonic] cache warmed.
```

`[tectonic] win32: skipping bundle` is correct on your own machine and wrong on
Vercel; it means the build ran somewhere that isn't Linux.

Without an engine the app still works, minus the document half — and one part
of that is silent:

| | With no engine |
|---|---|
| Tailoring, match report, letter | Fine |
| `.docx` download | Fine — built in the browser |
| PDF preview and download | Dead, with an install hint |
| Fitting to a page count | **Silently does nothing.** The length pass measures a document by building it; with no engine it measures zero pages and trims nothing. Nothing on screen says the page target was ignored. |

### Falling back to a container

`service/` is still here and still works: the same Tectonic behind one HTTP
endpoint. Set `LATEX_SERVICE_URL` and it takes precedence over the bundle —
useful if you outgrow Vercel's compute allowance, or if a future Tectonic stops
fitting.

Any container host works. Cloud Run scales to zero and stays inside its
always-free tier, but requires a billing account with a card on file;
[Render](https://render.com)'s free tier does not, at the cost of sleeping after
15 minutes idle and waking in 30–60s.

```bash
cd service
gcloud run deploy jobhunt-latex \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 120 \
  --set-env-vars "LATEX_SERVICE_TOKEN=$(openssl rand -hex 24)"
```

`--allow-unauthenticated` is what lets Vercel reach it; the token is what stops
everyone else. Keep the value — it goes into Vercel next:

```bash
npx vercel env add LATEX_SERVICE_URL production     # the https://... Cloud Run gave you
npx vercel env add LATEX_SERVICE_TOKEN production   # the same token
npx vercel --prod                                   # env vars apply to new deploys only
```

Check it directly before blaming the app:

```bash
curl https://YOUR-SERVICE-URL/health                 # {"ok":true}
curl -X POST https://YOUR-SERVICE-URL/compile \
  -H "Authorization: Bearer YOUR-TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tex":"\\documentclass{article}\\begin{document}Hi\\end{document}"}' \
  | head -c 120                                      # {"pdf":"JVBERi0..."
```

### Running it locally

You don't need to. On Windows and macOS the bundle step skips itself and the
app spawns the `tectonic` you installed, exactly as before. To exercise either
deployed path anyway:

```bash
# the bundle, as Vercel builds it — Linux only, it fetches a Linux binary
TECTONIC_BUNDLE_FORCE=1 npm run bundle:tectonic

# the container
cd service && node server.mjs          # uses your own tectonic, port 8080
LATEX_SERVICE_URL=http://localhost:8080 npm run dev
```

The app prefers them in that order: `LATEX_SERVICE_URL` if set, then
`vendor/tectonic`, then whatever is on `PATH`.

## After deploying

Open the URL, click **AI settings**, and paste an OpenAI key — the app will
refuse to run without one, by design.

If the resume step shows "Tectonic is not installed", the build did not bundle
an engine — see [Compiling PDFs](#compiling-pdfs), which starts with where to
look in the build log.
