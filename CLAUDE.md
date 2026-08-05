# JobHunt

## Release notes are generated, not written

`src/data/releases.json` and the `version` in `package.json` are written by
`scripts/release-notes.mjs`, which the post-commit hook runs on main. **Do not
hand-edit either file** — the next run prepends to what it finds, so an edit is
either overwritten or silently inherited.

The script shows the commit range to a model and asks, first, whether anything
in it would be noticed by someone using the app. A refactor answers no and
nothing is written. That is a normal outcome, not a failure.

To see what it makes of work you have not committed yet:

```bash
node scripts/release-notes.mjs --dry-run --since=<ref>
```

## Screenshots come from fixtures, never from a real session

What's new entries can carry a screenshot. It is taken from a **scene** — the
real component rendered against invented data — not from a live session:

- A real screenshot is a screenshot of somebody's actual resume, name, and the
  job they are quietly applying for, committed to this repository forever.
- A real report costs an analysis call and comes out different every time, so
  the same feature would be photographed against different content on each run.

Scenes live in `src/fixtures/`:

| File | What it holds |
|---|---|
| `scenes.json` | Manifest: id, description, alt text, width, clicks |
| `scenes.tsx` | Maps each id to the real component and its props |
| `persona.ts` | The one invented candidate every scene is about |
| `matchReport.ts`, `letter.ts`, `proposals.ts` | The invented data |

`npm run shots` photographs them into `public/releases/<version>/`, one file per
theme. `npm run shots:list` prints the manifest.

### When you ship a user-facing UI change, add a scene

This is the one manual step in the pipeline, and it exists because a brand-new
feature by definition has no scene yet — the model picking a scene can only
choose from what already exists.

Add one when the change is **visual and hard to picture from a sentence**. Skip
it for wording, speed, or changes to what gets generated rather than to what is
on screen. Most changes need no scene.

Adding one is usually a dozen lines:

1. An entry in `scenes.json`. The `description` is addressed to the model
   choosing a scene; the `alt` describes the picture for someone who cannot see
   it. They are different sentences — do not reuse one as the other.
2. A renderer in `scenes.tsx`, keyed by the same id.
3. Invented data, reusing `PERSONA` so scenes agree about who the candidate is.

Two constraints worth knowing before you write one:

- Keep `width` near the width the modal shows it at (~630px). A scene shot at
  960 and displayed at 630 renders 11px labels at two-thirds scale, and most of
  this app's chrome is 11px.
- Components that read the file store (`ResumeUpload`, `JobDescriptionInput`)
  are photographed **empty**. A scene has no store behind it, so a
  "document already chosen" state renders a preview of a file that isn't there.

### Nothing enforces this, on purpose

`release-notes.mjs` asks the model to name any change that wanted a screenshot
and had no scene for it, and prints that as a suggestion. It never fails.

A pre-commit hook was considered and rejected: whether a commit needed a scene
is a judgement about what a reader would find hard to picture, and nothing
running before the commit can make it — it would have to guess from file paths,
crying wolf on every refactor that touched a component and staying silent on a
feature assembled from existing ones. The notes are the product; the pictures
are a bonus, and a bonus must never block a commit.

## Dev server and screenshots share one `.next`

Two `next dev` instances on different ports are **not** isolated — they write
the same `.next` directory and corrupt each other's manifests within a request
or two. `shoot-scenes.mjs` therefore uses port 3001, the project's own, and
reuses a server that is already up rather than starting a second one.

For the same reason, `next build` fails with `EPERM` on `.next/trace` while a
dev server is running. Stop the dev server before building.
