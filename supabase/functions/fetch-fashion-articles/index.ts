const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category } = await req.json();
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl connector not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const queryMap: Record<string, string> = {
      Seasonal: "trending seasonal fashion 2026",
      "Street Style": "trending street style fashion 2026",
      Workwear: "trending workwear office fashion 2026",
      Evening: "trending evening party fashion 2026",
    };

    const query = queryMap[category] || `trending ${category} fashion 2026`;

    console.log("Searching fashion articles:", query);

    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 8,
        scrapeOptions: {
          formats: ["markdown"],
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Firecrawl API error:", data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || "Search failed" }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform search results into articles
    const articles = (data.data || []).map((item: any) => ({
      title: item.title || "Untitled",
      description: item.description || (item.markdown ? item.markdown.substring(0, 200) + "..." : ""),
      url: item.url || "",
      source: item.url ? new URL(item.url).hostname.replace("www.", "") : "",
    }));

    console.log(`Found ${articles.length} articles`);

    return new Response(
      JSON.stringify({ success: true, articles }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-fashion-articles error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
