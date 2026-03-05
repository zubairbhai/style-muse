import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Unified outfit generation + product search edge function.
 * 
 * Accepts two modes:
 * 1. Outfit Generation (original): { occasion, season, palette, vibe, gender }
 * 2. Product Search (new):         { action: "search-products", query: string, limit?: number }
 */

interface Product {
  title: string;
  price: string;
  image: string;
  link: string;
}

async function handleProductSearch(query: string, limit: number): Promise<Response> {
  // Clean up query - remove numbered prefixes like "1. The Top:" 
  const cleanQuery = query
    .replace(/^\d+\.\s*/, "")
    .replace(/^The\s+\w+:\s*/i, "")
    .trim();

  console.log("Searching products (cleaned):", cleanQuery);

  // Generate Google Shopping search links as reliable product results
  const searchUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(cleanQuery)}`;
  
  // Try RapidAPI first, fall back to Google Shopping links
  const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
  
  if (RAPIDAPI_KEY) {
    try {
      const url = new URL("https://real-time-product-search.p.rapidapi.com/search");
      url.searchParams.set("q", cleanQuery);
      url.searchParams.set("country", "in");
      url.searchParams.set("language", "en");
      url.searchParams.set("limit", String(Math.min(limit, 10)));

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-rapidapi-host": "real-time-product-search.p.rapidapi.com",
          "x-rapidapi-key": RAPIDAPI_KEY,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const rawProducts = data?.data || data?.products || [];

        const products: Product[] = [];
        for (const item of rawProducts) {
          if (products.length >= limit) break;

          const title = item.product_title || item.title || "";
          const price =
            item.offer?.price ||
            item.product_price ||
            item.price ||
            item.typical_price_range?.[0] ||
            "";
          const image =
            item.product_photos?.[0] ||
            item.product_photo ||
            item.thumbnail ||
            item.image ||
            "";
          const link =
            item.product_page_url ||
            item.product_url ||
            item.link ||
            item.url ||
            "";

          if (title && link) {
            products.push({
              title: title.length > 100 ? title.slice(0, 97) + "..." : title,
              price: typeof price === "string" ? price : price ? `₹${price}` : "Price not available",
              image,
              link,
            });
          }
        }

        if (products.length > 0) {
          return new Response(
            JSON.stringify({ products, query: cleanQuery }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        const text = await response.text();
        console.error("RapidAPI error:", response.status, text);
      }
    } catch (e) {
      console.error("RapidAPI call failed:", e);
    }
  }

  // Fallback: return a Google Shopping link so the user can still find products
  const fallbackProducts: Product[] = [{
    title: `Shop: ${cleanQuery}`,
    price: "Browse results",
    image: "",
    link: searchUrl,
  }];

  return new Response(
    JSON.stringify({ products: fallbackProducts, query: cleanQuery }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleOutfitGeneration(body: any): Promise<Response> {
  const { occasion, season, palette, vibe, gender } = body;
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");

  const genderLabel = gender === "male" ? "men's" : "women's";

  const prompt = `Generate a complete ${genderLabel} outfit recommendation for the following:
- Occasion: ${occasion}
- Season: ${season}
${palette ? `- Color Palette: ${palette}` : ""}
${vibe ? `- Style Vibe: ${vibe}` : ""}

Provide:
1. A creative outfit name/title
2. Item-by-item breakdown:
   - **Top**: specific item with color, fabric, style
   - **Bottom**: specific item with color, fabric, style
   - **Shoes**: specific footwear
   - **Accessories**: 2-3 accessories
3. **Styling Tips**: 2-3 tips for pulling it together
4. **Alternatives**: 1-2 swap options

Use markdown formatting. Be specific with colors, materials, and brands where appropriate. Tailor all items specifically for ${genderLabel} fashion.`;

  const textResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "arcee-ai/trinity-large-preview:free",
      messages: [
        { role: "system", content: "You are StyleSense, an expert AI fashion stylist. Provide detailed, specific outfit recommendations with rich formatting." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!textResponse.ok) {
    const status = textResponse.status;
    if (status === 429 || status === 402) {
      return new Response(JSON.stringify({ error: status === 429 ? "Rate limit exceeded" : "Payment required" }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    throw new Error("AI text generation failed");
  }

  const textData = await textResponse.json();
  const text = textData.choices?.[0]?.message?.content || "Unable to generate outfit.";

  // Generate mood board image via Lovable AI
  let imageUrl: string | undefined;
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      const imagePrompt = `Fashion flat-lay mood board for a ${vibe || "stylish"} ${genderLabel} ${occasion} outfit for ${season}. ${palette ? `Color palette: ${palette}.` : ""} Editorial fashion photography, elegant arrangement on cream background, high-end ${genderLabel} fashion items, accessories, and textures. Ultra high resolution.`;

      const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: imagePrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      }
    }
  } catch (imgErr) {
    console.error("Image generation error:", imgErr);
  }

  return new Response(JSON.stringify({ text, imageUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // Route to product search if action is specified
    if (body.action === "search-products") {
      const query = body.query || "";
      const limit = body.limit || 5;
      if (!query) {
        return new Response(
          JSON.stringify({ error: "No search query provided", products: [] }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return await handleProductSearch(query, limit);
    }

    // Default: outfit generation
    return await handleOutfitGeneration(body);
  } catch (e) {
    console.error("generate-outfit error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
