import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Stylist Recommend Edge Function
 * 
 * Receives structured image analysis data + user intent,
 * sends everything to OpenRouter for personalized fashion recommendations.
 * 
 * Input: {
 *   analysisData: {
 *     skin_tone: { category, hex },
 *     body_type: string,
 *     outfit: [{ type, dominant_color, hex }],
 *     accessories: string[],
 *   },
 *   userIntent: {
 *     occasion: string,
 *     useCurrentOutfit: boolean,
 *   },
 *   imageUrl?: string,
 *   conversationHistory?: { role, content }[],
 * }
 */

serve(async (req) => {
    if (req.method === "OPTIONS")
        return new Response(null, { headers: corsHeaders });

    try {
        const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
        if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");

        const { analysisData, userIntent, imageUrl, conversationHistory } = await req.json();

        if (!analysisData || !userIntent) {
            return new Response(
                JSON.stringify({ error: "Missing analysisData or userIntent" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── Build the comprehensive system prompt
        const systemPrompt = `You are a professional AI fashion stylist. You provide highly personalized outfit recommendations based on:
- The user's skin tone and how colors complement it
- Their body type and what silhouettes flatter them
- Their current outfit and whether it matches the occasion
- The specific occasion/event they're dressing for

Your recommendations MUST:
1. Be personalized to the user's skin tone and body type
2. Suggest specific clothing items with colors, fabrics, and styles
3. Explain WHY each recommendation fits their skin tone and body type
4. Suggest replacements when the current outfit doesn't match the occasion
5. Include accessory recommendations when appropriate
6. Be practical and realistic (not overly expensive or hard to find)

Format your response with clear sections using markdown:
- Use headers (##, ###) for sections
- Use bullet points for item lists
- Bold important items and colors
- Add relevant fashion emojis sparingly
- Keep the tone warm, encouraging, and professional`;

        // ── Build structured user message with all analysis data
        const structuredData = {
            skin_tone: analysisData.skin_tone || { category: "Unknown", hex: "#000000" },
            body_type: analysisData.body_type || "Unknown",
            outfit: analysisData.outfit || [],
            accessories: analysisData.accessories || [],
            user_intent: {
                occasion: userIntent.occasion || "General",
                use_current_outfit: userIntent.useCurrentOutfit ?? false,
            },
        };

        // Determine outfit-occasion match
        const currentOutfitTypes = structuredData.outfit.map((o: any) => o.type).join(", ");
        const occasion = structuredData.user_intent.occasion;

        let matchAnalysis = "";
        const formalOccasions = ["Office", "Wedding", "Business Meeting", "Interview", "Formal Event"];
        const casualOccasions = ["Casual outing", "Shopping", "Travel", "College", "Hanging out"];
        const activeOccasions = ["Gym", "Sports", "Hiking", "Running", "Workout"];
        const partyOccasions = ["Party", "Date", "Club", "Night out", "Dinner"];

        const hasFormalClothing = currentOutfitTypes.match(/Shirt|Blazer|Suit|Trousers|Dress/i);
        const hasCasualClothing = currentOutfitTypes.match(/T-shirt|Hoodie|Jeans|Shorts|Sneakers/i);
        const hasActiveClothing = currentOutfitTypes.match(/Shorts|Tank|Sports/i);

        if (formalOccasions.some(o => occasion.toLowerCase().includes(o.toLowerCase()))) {
            if (hasCasualClothing && !hasFormalClothing) {
                matchAnalysis = "MISMATCH: User has casual clothing but needs formal attire. Recommend complete formal alternatives.";
            } else if (hasFormalClothing) {
                matchAnalysis = "GOOD MATCH: User already has formal pieces. Suggest refinements and color coordination.";
            }
        } else if (activeOccasions.some(o => occasion.toLowerCase().includes(o.toLowerCase()))) {
            if (hasFormalClothing) {
                matchAnalysis = "MISMATCH: User has formal clothing but needs athletic/active wear. Recommend sporty alternatives.";
            } else if (hasActiveClothing) {
                matchAnalysis = "GOOD MATCH: User has active wear. Suggest performance upgrades or color coordination.";
            }
        } else if (casualOccasions.some(o => occasion.toLowerCase().includes(o.toLowerCase()))) {
            matchAnalysis = "Casual occasion — suggest comfort-focused styling with personal flair.";
        } else if (partyOccasions.some(o => occasion.toLowerCase().includes(o.toLowerCase()))) {
            if (hasFormalClothing) {
                matchAnalysis = "PARTIAL MATCH: Formal pieces can work for parties with the right accessories. Suggest modifications.";
            } else {
                matchAnalysis = "Suggest elevated casual or smart-casual options for the occasion.";
            }
        }

        const userMessage = `Here is my complete style analysis data:

**Structured Analysis:**
\`\`\`json
${JSON.stringify(structuredData, null, 2)}
\`\`\`

**Match Analysis:** ${matchAnalysis || "Analyze the outfit-occasion compatibility and recommend accordingly."}

**My Skin Tone:** ${structuredData.skin_tone.category} (${structuredData.skin_tone.hex})
**My Body Type:** ${structuredData.body_type}
**Currently Wearing:** ${currentOutfitTypes || "Not clearly detected"}
**Current Outfit Colors:** ${structuredData.outfit.map((o: any) => `${o.dominant_color || "Unknown"} (${o.hex || "N/A"})`).join(", ") || "Not detected"}
**Accessories:** ${structuredData.accessories.length > 0 ? structuredData.accessories.join(", ") : "None detected"}

**Occasion:** ${occasion}
**Want to:** ${structuredData.user_intent.use_current_outfit ? "Keep and enhance my current outfit" : "Get completely new outfit recommendations"}

Please provide personalized fashion recommendations that:
1. Are specifically suited to my ${structuredData.skin_tone.category} skin tone
2. Flatter my ${structuredData.body_type} body type
3. Are perfect for a ${occasion} occasion
4. ${structuredData.user_intent.use_current_outfit
                ? "Build upon and enhance my current outfit"
                : "Suggest complete new outfits (including replacements for what I'm currently wearing)"}
5. Include specific color suggestions (with reasoning for my skin tone)
6. Suggest accessories that complete the look`;

        // ── Build messages array
        const messages: any[] = [
            { role: "system", content: systemPrompt },
        ];

        // Add conversation history if provided
        if (conversationHistory && Array.isArray(conversationHistory)) {
            messages.push(...conversationHistory);
        }

        // Build user content (with optional image)
        if (imageUrl) {
            messages.push({
                role: "user",
                content: [
                    { type: "text", text: userMessage },
                    { type: "image_url", image_url: { url: imageUrl } },
                ],
            });
        } else {
            messages.push({ role: "user", content: userMessage });
        }

        // ── Call OpenRouter (using free model)
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://style-muse.app",
                "X-Title": "Style Muse AI Stylist",
            },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-exp:free",
                messages,
                stream: true,
            }),
        });

        if (!response.ok) {
            const status = response.status;
            if (status === 429) {
                return new Response(
                    JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
                    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            if (status === 402) {
                return new Response(
                    JSON.stringify({ error: "Payment required" }),
                    { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            const t = await response.text();
            console.error("OpenRouter error:", status, t);
            return new Response(
                JSON.stringify({ error: "AI recommendation failed" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Stream the response back
        return new Response(response.body, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
    } catch (e) {
        console.error("stylist-recommend error:", e);
        return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
