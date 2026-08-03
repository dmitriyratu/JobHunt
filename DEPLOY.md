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

**Vercel alone cannot produce the resume PDF, and no amount of configuration
will change that.**

The resume is typeset by [Tectonic](https://tectonic-typesetting.github.io/), a
LaTeX engine the app runs as a program. On your own machine that works with no
setup — install Tectonic and the app finds it, including at the path the Windows
installer uses. A Vercel function is a different computer: it has no Tectonic,
no way to install one, and a read-only disk. Installing it locally does nothing
for the deployed site, which is the single most confusing thing about this
whole setup.

Left unconfigured, the deployed app still works, minus the document half:

| | Without a compile service |
|---|---|
| Tailoring, match report, letter | Fine |
| `.docx` download | Fine — built in the browser |
| PDF preview and download | Dead, with an install hint that cannot be acted on |
| Fitting to a page count | **Silently does nothing.** The length pass measures a document by building it; with no engine it measures zero pages and trims nothing. This one is worth knowing, because nothing on screen says the page target was ignored. |

`service/` is the fix: the same Tectonic, in a container, behind one HTTP
endpoint. Point the app at it with `LATEX_SERVICE_URL` and every compile —
preview, download, and the page-fitting search — goes there instead.

### Deploying it to Cloud Run

Any container host works; Cloud Run is suggested because it scales to zero, so
a personal deployment stays inside the always-free tier. Expect a few seconds
on the first compile after an idle period while the container wakes.

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

### Why the image build takes a few minutes

Tectonic downloads the TeX files a document asks for and caches them, so an
empty cache means the first real compile pulls a bundle over the network — slow
at best, a timeout at worst, and it would happen again after every deploy. The
`Dockerfile` therefore compiles `service/warm.tex` during the build purely for
the side effect of filling that cache, and ships it inside the image.

`warm.tex` mirrors the preamble in `src/lib/resumeLatex.ts`. If you change the
packages there, copy them across. Drift is not fatal — a missing package is
fetched at runtime the first time a document needs it — but it costs one slow
compile on the deployed site.

### Running it locally

You don't need to. With no `LATEX_SERVICE_URL`, the app spawns your local
`tectonic` and nothing about this applies. To test the remote path anyway:

```bash
cd service && node server.mjs          # uses your own tectonic, port 8080
LATEX_SERVICE_URL=http://localhost:8080 npm run dev
```

## After deploying

Open the URL, click **AI settings**, and paste an OpenAI key — the app will
refuse to run without one, by design.

If the resume step shows "Tectonic is not installed", the compile service is
either not deployed or not wired up — see [Compiling PDFs](#compiling-pdfs).
