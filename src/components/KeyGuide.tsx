"use client";

import Image from "next/image";

/**
 * Step-by-step help for obtaining the two OpenAI keys, shown inline beside the
 * fields they belong to.
 *
 * Steps can carry an optional screenshot. None ship by default: OpenAI's
 * dashboard is behind a personal login, so any real capture would contain the
 * owner's organisation and key material, and a drawn imitation of their UI
 * would be worse than none. Drop a real crop into /public/help and reference it
 * as `shot` to add one — nothing else needs to change.
 */
export type GuideStep = {
  text: React.ReactNode;
  /** Path under /public, e.g. "/help/create-secret-key.png". */
  shot?: string;
  /** Required whenever `shot` is set. */
  shotAlt?: string;
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-[var(--color-border)] bg-[var(--color-surface-overlay)] px-1.5 py-0.5 font-medium text-[var(--color-text-primary)]">
      {children}
    </span>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-accent)] hover:underline break-words"
    >
      {children} ↗
    </a>
  );
}

function Guide({
  summary,
  intro,
  steps,
  footnote,
  defaultOpen = false,
}: {
  summary: string;
  intro?: React.ReactNode;
  steps: GuideStep[];
  footnote?: React.ReactNode;
  /** Open on arrival — used when the user has no key yet and needs this now. */
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group mt-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]"
    >
      <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
        <svg
          className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {summary}
      </summary>

      <div className="px-3 pb-3 pt-1">
        {intro && (
          <p className="mb-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">{intro}</p>
        )}
        <ol className="space-y-2.5">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-overlay)] text-[10px] font-semibold text-[var(--color-text-secondary)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  {step.text}
                </p>
                {step.shot && (
                  <Image
                    src={step.shot}
                    alt={step.shotAlt ?? ""}
                    width={640}
                    height={200}
                    // max-w-full, not w-full: the dialog crops are narrower than
                    // this panel and stretching them to fit renders them blurry.
                    className="mt-2 h-auto max-w-full rounded-md border border-[var(--color-border)]"
                    unoptimized
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
        {footnote && (
          <p className="mt-3 border-t border-[var(--color-border-subtle)] pt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            {footnote}
          </p>
        )}
      </div>
    </details>
  );
}

export function ApiKeyGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Guide
      defaultOpen={defaultOpen}
      summary="Show me how, step by step"
      steps={[
        {
          text: (
            <>
              Open <ExternalLink href="https://platform.openai.com/api-keys">platform.openai.com/api-keys</ExternalLink>{" "}
              and sign in, or pick <Chip>API Keys</Chip> from the left sidebar. Then click{" "}
              <Chip>Create new secret key</Chip>.
            </>
          ),
          shot: "/help/01-api-keys-page.png",
          shotAlt: "The OpenAI API keys page with the Create new secret key button highlighted",
        },
        {
          text: (
            <>
              In the dialog, leave <Chip>Owned by</Chip> on <Chip>You</Chip> and{" "}
              <Chip>Project</Chip> on <Chip>Default project</Chip>. The name is optional —{" "}
              <Chip>JobHunt</Chip> makes it easy to find later.
            </>
          ),
          shot: "/help/02-create-secret-key-dialog.png",
          shotAlt: "The Create new secret key dialog showing Owned by, Name, Project and Permissions",
        },
        {
          text: (
            <>
              Leave <Chip>Permissions</Chip> on <Chip>All</Chip>. Do not pick{" "}
              <Chip>Read only</Chip> here — writing a letter is a write request, and a read-only key
              is refused.
            </>
          ),
        },
        {
          text: (
            <>
              Confirm with <Chip>Create secret key</Chip>, then copy it{" "}
              <strong>straight away</strong>. OpenAI shows the full key once and never again; if you
              lose it you just make another.
            </>
          ),
        },
        {
          text: (
            <>
              Paste it into the field above (it begins <Chip>sk-</Chip>) and press{" "}
              <Chip>Save settings</Chip>.
            </>
          ),
        },
      ]}
      footnote={
        <>
          A key on its own isn&rsquo;t enough — the account needs credit, or every request comes
          back as a quota error. Top up under{" "}
          <ExternalLink href="https://platform.openai.com/settings/organization/billing/overview">
            Billing
          </ExternalLink>
          . A full application costs roughly $0.13.
        </>
      }
    />
  );
}

export function AdminKeyGuide() {
  return (
    <Guide
      summary="Show me how, step by step"
      intro={
        <>
          Most people should skip this. It only adds OpenAI&rsquo;s official spend figure to the
          Usage tab alongside this app&rsquo;s own estimate. Everything else works without it.
        </>
      }
      steps={[
        {
          text: (
            <>
              Check you are an <strong>Organization Owner</strong> — only owners can create admin
              keys. If you&rsquo;re not, skip this; nothing will break.
            </>
          ),
        },
        {
          text: (
            <>
              Open{" "}
              <ExternalLink href="https://platform.openai.com/settings/organization/admin-keys">
                Organization &rarr; Admin keys
              </ExternalLink>
              , or pick <Chip>Admin keys</Chip> from the settings sidebar, then click{" "}
              <Chip>Create new Admin key</Chip>.
            </>
          ),
          shot: "/help/03-admin-keys-page.png",
          shotAlt: "The OpenAI Admin keys page with the Create new Admin key button highlighted",
        },
        {
          text: (
            <>
              Name it, leave <Chip>Expiration</Chip> on <Chip>Never</Chip>, and set{" "}
              <Chip>Permissions</Chip> to <Chip>Read only</Chip>. That is enough to read usage and
              cannot change anything in your account — the safer choice over <Chip>All</Chip>.
            </>
          ),
          shot: "/help/04-create-admin-key-dialog.png",
          shotAlt: "The Create new admin key dialog showing Name, Expiration and Permissions",
        },
        {
          text: (
            <>
              Confirm with <Chip>Create admin key</Chip>.
            </>
          ),
        },
        {
          text: (
            <>
              Copy the key (it begins <Chip>sk-admin-</Chip>), paste it into the field above and
              press <Chip>Save settings</Chip>.
            </>
          ),
        },
      ]}
      footnote={
        <>
          A normal project key will not work here — OpenAI returns 403 on the usage endpoints unless
          the key is an admin key with read access to usage. If the panel below still shows a 403,
          the key was created without it. An admin key can read organisation-wide data, so treat it
          as the more sensitive of the two.
        </>
      }
    />
  );
}
