import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { occasion, season, palette, vibe, gender } = await req.json();
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

    // Generate text recommendation via OpenRouter
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
  } catch (e) {
    console.error("generate-outfit error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
