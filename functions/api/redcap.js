// Server-side REDCap proxy for Cloudflare Pages.
// Required env vars in Pages: REDCAP_API_TOKEN and REDCAP_API_URL.

export async function onRequestPost(context) {
  const { REDCAP_API_TOKEN, REDCAP_API_URL } = context.env;
  if (!REDCAP_API_TOKEN || !REDCAP_API_URL) {
    return json({ error: "REDCap env vars not set in Cloudflare Pages." }, 500);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const allowedContent = new Set(["project", "metadata", "event", "formEventMapping", "record"]);
  if (body.content && !allowedContent.has(body.content)) {
    return json({ error: `content '${body.content}' not permitted via proxy.` }, 403);
  }
  if (body.action === "import" || body.action === "delete") {
    return json({ error: "Write actions are not allowed through the browser proxy." }, 403);
  }

  const form = new URLSearchParams({
    token: REDCAP_API_TOKEN,
    format: "json",
    returnFormat: "json",
    ...body,
  });

  try {
    const response = await fetch(REDCAP_API_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return json({ error: `Cannot reach REDCap: ${error.message}` }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
    },
  });
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
