// netlify/edge-functions/claude.js
// Secure proxy for Anthropic API
// Path declared in netlify.toml [[edge_functions]] block

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.error?.message || "Anthropic API error", status: response.status }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    return Response.json(data);

  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${error.message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
