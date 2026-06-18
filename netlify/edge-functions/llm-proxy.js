export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Read env vars INSIDE the handler — not at module top level
  const apiKey = Deno.env.get("API_KEY");
  const apiEndpoint = Deno.env.get("API_ENDPOINT");
  const apiPath = Deno.env.get("API_PATH");
  const apiVersion = Deno.env.get("API_VERSION");
  const authHeader = Deno.env.get("API_AUTH_HEADER") || "api-key";
  const model = Deno.env.get("MODEL") || "gpt-5";

  if (!apiKey || !apiEndpoint || !apiPath) {
    return new Response(
      JSON.stringify({ error: "API environment variables not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fullUrl = `${apiEndpoint}${apiPath}?api-version=${apiVersion}`;

  const openAiBody = {
    model,
    max_completion_tokens: 4096,
    messages: [
      ...(body.system ? [{ role: "system", content: body.system }] : []),
      ...body.messages,
    ],
  };

  // Return SSE response IMMEDIATELY via TransformStream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Keepalive heartbeats every 15s to prevent Netlify idle timeout
  const keepalive = setInterval(async () => {
    try {
      await writer.write(encoder.encode(": keepalive\n\n"));
    } catch {
      clearInterval(keepalive);
    }
  }, 15000);

  // Fetch upstream in background — do NOT await before returning
  (async () => {
    try {
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [authHeader]: apiKey,
        },
        body: JSON.stringify(openAiBody),
      });

      const data = await response.text();

      if (!response.ok) {
        const errMsg = (() => {
          try {
            const parsed = JSON.parse(data);
            return parsed.error?.message || data;
          } catch {
            return data;
          }
        })();
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`)
        );
      } else {
        await writer.write(encoder.encode(`data: ${data}\n\n`));
      }
    } catch (e) {
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`)
      );
    } finally {
      clearInterval(keepalive);
      try {
        await writer.close();
      } catch {}
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
