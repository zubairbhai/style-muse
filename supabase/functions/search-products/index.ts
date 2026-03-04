import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Search Products Edge Function
 * 
 * Calls RapidAPI Real-Time Product Search to find real purchasable products.
 * Keeps API key server-side for security.
 * 
 * Input: { query: string, limit?: number }
 * Output: { products: [{ title, price, image, link }] }
 */

interface Product {
    title: string;
    price: string;
    image: string;
    link: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS")
        return new Response(null, { headers: corsHeaders });

    try {
        const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
        if (!RAPIDAPI_KEY) throw new Error("RAPIDAPI_KEY is not configured");

        const { query, limit = 5 } = await req.json();

        if (!query || typeof query !== "string" || query.trim().length === 0) {
            return new Response(
                JSON.stringify({ error: "No search query provided" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const searchQuery = query.trim();
        const url = new URL("https://real-time-product-search.p.rapidapi.com/search");
        url.searchParams.set("q", searchQuery);
        url.searchParams.set("country", "in");
        url.searchParams.set("language", "en");
        url.searchParams.set("page", "1");
        url.searchParams.set("limit", String(Math.min(limit, 10)));
        url.searchParams.set("sort_by", "BEST_MATCH");
        url.searchParams.set("product_condition", "ANY");

        console.log("Searching products:", searchQuery);

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "x-rapidapi-host": "real-time-product-search.p.rapidapi.com",
                "x-rapidapi-key": RAPIDAPI_KEY,
            },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("RapidAPI error:", response.status, text);

            if (response.status === 429) {
                return new Response(
                    JSON.stringify({ error: "Rate limit exceeded. Try again later.", products: [] }),
                    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return new Response(
                JSON.stringify({ error: "Product search failed", products: [] }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const data = await response.json();

        // Parse the response — RapidAPI returns data.data as the product array
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

        return new Response(
            JSON.stringify({ products, query: searchQuery }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (e) {
        console.error("search-products error:", e);
        return new Response(
            JSON.stringify({
                error: e instanceof Error ? e.message : "Unknown error",
                products: [],
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
