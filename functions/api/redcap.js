// REDCap credentials and raw project responses must never enter the public
// Cloudflare Pages runtime. Metrics are synchronized server-side, privacy
// validated, and published as an aggregate-only JSON snapshot instead.

export async function onRequest() {
  return new Response(
    JSON.stringify({
      error: "The public REDCap proxy has been permanently retired.",
      status: "gone",
    }),
    {
      status: 410,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
