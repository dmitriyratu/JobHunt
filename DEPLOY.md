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

## After deploying

Open the URL, click **AI settings**, and paste an OpenAI key — the app will
refuse to run without one, by design.
