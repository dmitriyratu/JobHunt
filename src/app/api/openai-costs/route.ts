import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Reads authoritative spend from OpenAI's Admin API.
 *
 * Verified behaviour (probed directly against the live API):
 *  - /v1/organization/costs needs the `api.usage.read` scope, i.e. an Admin
 *    key (sk-admin-...). A normal project key returns 403.
 *  - There is NO endpoint that returns remaining credit / account balance for
 *    an API key. The only one that ever did — /dashboard/billing/credit_grants
 *    — responds "must be made with a session key (that is, it can only be made
 *    from the browser)". So remaining balance is deliberately not modelled
 *    here; the UI links out to the billing page for it instead.
 */
type CostBucket = {
  start_time: number;
  end_time: number;
  results?: { amount?: { value?: number; currency?: string } }[];
};

export async function POST(request: NextRequest) {
  try {
    const { adminApiKey } = (await request.json()) as { adminApiKey?: string };
    const key = adminApiKey?.trim();
    if (!key) {
      return NextResponse.json({ error: "An OpenAI Admin key is required." }, { status: 400 });
    }

    // Cover the current month to date, bucketed daily.
    const now = new Date();
    const monthStart = Math.floor(
      new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000
    );

    const url =
      "https://api.openai.com/v1/organization/costs" +
      `?start_time=${monthStart}&bucket_width=1d&limit=31`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const hint =
        res.status === 401
          ? "That key was rejected. Check it's a current Admin key."
          : res.status === 403
            ? "That key lacks the api.usage.read scope. A normal project key won't work — create an Admin key under Organization → Admin keys."
            : `OpenAI returned ${res.status}.`;
      return NextResponse.json({ error: hint, detail: detail.slice(0, 300) }, { status: 502 });
    }

    const json = (await res.json()) as { data?: CostBucket[] };
    const buckets = json.data ?? [];

    let total = 0;
    let currency = "usd";
    const daily: { date: string; amount: number }[] = [];

    for (const bucket of buckets) {
      let dayTotal = 0;
      for (const r of bucket.results ?? []) {
        dayTotal += r.amount?.value ?? 0;
        if (r.amount?.currency) currency = r.amount.currency;
      }
      total += dayTotal;
      daily.push({
        date: new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
        amount: dayTotal,
      });
    }

    return NextResponse.json({
      monthToDate: total,
      currency,
      daily,
      periodStart: new Date(monthStart * 1000).toISOString().slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read OpenAI costs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
