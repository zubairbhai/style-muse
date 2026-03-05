import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Sparkles, Loader2, ImagePlus, X, Camera, Eye,
  Palette, User, Shirt, Watch, MapPin, ArrowRight,
  RefreshCw, CheckCircle2, ChevronDown, ShoppingBag,
  ExternalLink, ThumbsUp, ThumbsDown, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import {
  runFullClientAnalysis,
  OCCASION_OPTIONS,
  type StructuredAnalysis,
  type UserIntent,
} from "@/lib/imageAnalysis";

// ─── Types ───────────────────────────────────────────────────────────

type Product = {
  title: string;
  price: string;
  image: string;
  link: string;
};

type Msg = {
  role: "user" | "assistant" | "system-ui";
  content: string;
  imageUrl?: string;
  analysisCard?: StructuredAnalysis;
  intentCard?: boolean;
  productPrompt?: boolean;       // show "want to see products?" buttons
  products?: Product[];           // product cards
  productsLoading?: boolean;      // loading spinner for products
  productsError?: string;         // error message
};

type AnalysisPhase =
  | "idle"
  | "uploading"
  | "analyzing"
  | "extracting-colors"
  | "results"
  | "asking-intent"
  | "recommending";

// ─── Constants ───────────────────────────────────────────────────────

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stylist-chat`;
const PRODUCTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-outfit`;

// ─── Product query cache ─────────────────────────────────────────────

const productCache = new Map<string, Product[]>();

// ─── Component ───────────────────────────────────────────────────────

const AIStylistChat = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>("idle");
  const [currentAnalysis, setCurrentAnalysis] = useState<StructuredAnalysis | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [selectedOccasion, setSelectedOccasion] = useState<string>("");
  const [customOccasion, setCustomOccasion] = useState("");
  const [useCurrentOutfit, setUseCurrentOutfit] = useState<boolean | null>(null);
  const [lastRecommendation, setLastRecommendation] = useState<string>("");
  const [showProductPrompt, setShowProductPrompt] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, analysisPhase, showProductPrompt]);

  // ─── Image Upload ──────────────────────────────────────────────────

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `chat/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("outfit-uploads").upload(path, file);
    if (error) { console.error("Upload error:", error); return null; }
    const { data } = supabase.storage.from("outfit-uploads").getPublicUrl(path);
    return data.publicUrl;
  };

  // ─── Full Analysis Pipeline ────────────────────────────────────────

  const runAnalysisPipeline = async (_imageUrl: string, imageDataUrl: string) => {
    setAnalysisPhase("analyzing");
    addMessage("assistant", "🔍 **Analyzing your outfit** — scanning zones, extracting colors, classifying style...\n\n_This runs 100% client-side — free & unlimited!_");

    // Full client-side multi-zone analysis (no API calls needed)
    const structured = await runFullClientAnalysis(imageDataUrl);

    setAnalysisPhase("extracting-colors");
    updateLastAssistant("🎨 **Building your complete style profile...**\n\n_Classifying garments, detecting accessories, mapping color palette..._");

    // Small delay for UX
    await new Promise((r) => setTimeout(r, 400));

    setCurrentAnalysis(structured);
    setCurrentImageUrl(_imageUrl);
    setAnalysisPhase("results");

    // Replace loading message with rich analysis
    setMessages((prev) => {
      const filtered = prev.filter(
        (m) => !(m.role === "assistant" && (m.content.includes("Analyzing") || m.content.includes("Building")))
      );
      return [
        ...filtered,
        {
          role: "assistant" as const,
          content: formatAnalysisResults(structured),
          analysisCard: structured,
        },
      ];
    });

    setTimeout(() => {
      setAnalysisPhase("asking-intent");
      addMessage("assistant", "");
    }, 500);
  };

  // ─── Send Styled Recommendation via existing stylist-chat ───────────

  const sendRecommendation = async (analysis: StructuredAnalysis, intent: UserIntent) => {
    setAnalysisPhase("recommending");

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.analysisCard && !last.intentCard && !last.productPrompt) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant" as const, content: assistantSoFar }];
      });
    };

    try {
      upsertAssistant("✨ **Generating personalized recommendations...**\n\n");

      // Build structured prompt with all analysis data + user intent
      const outfitList = analysis.outfit.map(
        (o) => `${o.type} (${o.dominant_color}, ${o.hex})`
      ).join(", ");

      const structuredPrompt = `You are a professional AI fashion stylist. Based on the following complete analysis of the user's image, provide highly personalized outfit recommendations.

## USER ANALYSIS DATA:
- **Skin Tone:** ${analysis.skin_tone.category} (${analysis.skin_tone.hex})
- **Body Type:** ${analysis.body_type}
- **Currently Wearing:** ${outfitList || "Not clearly detected"}
- **Accessories Detected:** ${analysis.accessories.length > 0 ? analysis.accessories.join(", ") : "None"}

## USER REQUEST:
- **Occasion:** ${intent.occasion}
- **Preference:** ${intent.useCurrentOutfit ? "Enhance and upgrade current outfit" : "Suggest a completely new outfit"}

## YOUR TASK:
1. Evaluate if the current outfit matches the "${intent.occasion}" occasion
2. If MISMATCH: Recommend specific replacement items with colors that complement ${analysis.skin_tone.category} skin tone
3. If PARTIAL MATCH: Suggest specific modifications and additions
4. If GOOD MATCH: Suggest color upgrades and accessory additions
5. Explain WHY each color recommendation works for ${analysis.skin_tone.category} skin tone
6. Suggest silhouettes that flatter a ${analysis.body_type} body type
7. Recommend accessories to complete the look

Format with clear sections, bullet points, and specific item/color suggestions. Be warm and encouraging.`;

      // Use the already-deployed stylist-chat endpoint
      const chatMessages = [
        { role: "user", content: structuredPrompt }
      ];

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: chatMessages,
          styleProfile: null,
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          upsertAssistant("Too many requests. Please try again in a moment. 🙏");
          return;
        }
        throw new Error("Recommendation stream failed");
      }

      // Clear the "Generating..." message and start streaming
      assistantSoFar = "";

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Save the full recommendation for product query extraction
      setLastRecommendation(assistantSoFar);

    } catch (e) {
      console.error(e);
      upsertAssistant("\n\n❌ Sorry, I couldn't generate recommendations. Please try again!");
    }

    setAnalysisPhase("idle");
    setCurrentAnalysis(null);
    setSelectedOccasion("");
    setCustomOccasion("");
    setUseCurrentOutfit(null);
    setIsLoading(false);

    // Show the product prompt after recommendation completes
    if (assistantSoFar && !assistantSoFar.includes("❌")) {
      setTimeout(() => {
        setShowProductPrompt(true);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant" as const,
            content: "🛍️ Would you like me to find real products you can buy for this outfit?",
            productPrompt: true,
          },
        ]);
      }, 800);
    }
  };

  // ─── Product Search ────────────────────────────────────────────────

  const extractSearchQueries = (recommendation: string): string[] => {
    const queries: string[] = [];
    const clean = (s: string) => s.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();

    // Clothing keywords for validation
    const clothingKW = [
      "blazer", "shirt", "t-shirt", "tee", "jacket", "coat", "hoodie", "sweater",
      "trousers", "pants", "jeans", "shorts", "chinos", "joggers", "polo",
      "shoes", "sneakers", "boots", "loafers", "sandals", "heels", "oxford",
      "dress", "skirt", "top", "blouse", "cardigan", "vest", "kurta", "saree",
      "watch", "sunglasses", "belt", "bag", "cap", "hat", "scarf",
      "suit", "overcoat", "pullover", "henley", "sweatshirt",
    ];
    const isClothing = (s: string) => clothingKW.some((kw) => s.toLowerCase().includes(kw));

    // Strategy 1: "Category: **specific item description**" pattern
    // e.g. "**Top:** A slim-fit navy blue linen shirt" or "- **Shoes**: White leather sneakers"
    const categoryItemRegex = /\*\*\s*(?:top|bottom|shirt|pants|trousers|shoes|footwear|outerwear|jacket|coat|accessories?|belt|bag|watch|scarf|dress|skirt)\s*[:—-]\s*\*\*\s*(.+?)(?:\n|$)/gi;
    for (const match of recommendation.matchAll(categoryItemRegex)) {
      const item = clean(match[1]);
      if (item.length > 3 && item.length < 80) queries.push(item);
    }

    // Strategy 2: Bullet points with category labels
    // e.g. "- Top: Navy blue cotton polo shirt" or "* Shoes — Brown suede loafers"
    const bulletCategoryRegex = /(?:^|\n)\s*(?:[-•*]|\d+[.)])\s*(?:top|bottom|shirt|pants|trousers|shoes|footwear|outerwear|jacket|coat|accessories?|belt|bag|watch|scarf|dress|skirt)\s*[:—-]\s*(.+?)(?:\n|$)/gi;
    for (const match of recommendation.matchAll(bulletCategoryRegex)) {
      const item = clean(match[1]);
      if (item.length > 3 && item.length < 80 && isClothing(item)) queries.push(item);
    }

    // Strategy 3: Bold items that contain color + clothing keyword
    // e.g. "**navy blue linen shirt**" or "**brown leather boots**"
    const colorClothingBold = /\*\*([^*]{5,60})\*\*/g;
    for (const match of recommendation.matchAll(colorClothingBold)) {
      const item = clean(match[1]);
      if (isClothing(item) && !item.includes(":") && item.split(" ").length >= 2 && item.split(" ").length <= 8) {
        queries.push(item);
      }
    }

    // Strategy 4: Lines starting with clothing-related headers followed by description
    // e.g. "Shirt: Opt for a crisp white cotton shirt"  
    const headerDescRegex = /(?:^|\n)\s*(?:top|bottom|shirt|pants|trousers|shoes|footwear|outerwear|jacket|coat|accessories?|belt|bag|watch|scarf|dress|skirt)\s*[:—]\s*(?:opt for |go with |choose |try |wear |consider |a )?\s*(.+?)(?:\.|,|\n|$)/gi;
    for (const match of recommendation.matchAll(headerDescRegex)) {
      const item = clean(match[1]);
      // Take only the core item description (first 6 words max)
      const words = item.split(" ").slice(0, 6).join(" ");
      if (words.length > 3 && isClothing(words)) queries.push(words);
    }

    // Deduplicate: normalize and remove near-duplicates
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const q of queries) {
      const norm = q.toLowerCase().replace(/\s+/g, " ").trim();
      // Skip if we already have a very similar query
      const isDupe = [...seen].some((s) => {
        return s.includes(norm) || norm.includes(s) || 
               (norm.split(" ").length > 1 && s.split(" ").slice(-1)[0] === norm.split(" ").slice(-1)[0]);
      });
      if (!isDupe && norm.length > 3) {
        seen.add(norm);
        unique.push(q);
      }
      if (unique.length >= 5) break;
    }

    // Last resort: scan for any clothing keyword with adjacent color/descriptor words
    if (unique.length === 0) {
      const words = recommendation.replace(/[#*_`\n]/g, " ").split(/\s+/);
      for (let i = 0; i < words.length && unique.length < 3; i++) {
        const w = words[i].toLowerCase();
        if (clothingKW.some((kw) => w.includes(kw) && w.length > 3)) {
          const start = Math.max(0, i - 2);
          const end = Math.min(words.length, i + 2);
          const phrase = words.slice(start, end).join(" ");
          if (phrase.length > 3) unique.push(clean(phrase));
        }
      }
    }

    if (unique.length === 0) unique.push("fashion outfit clothing");

    console.log("[ProductSearch] Extracted queries:", unique);
    return unique;
  };

  const fetchProducts = async (query: string): Promise<Product[]> => {
    // Check cache first
    const cacheKey = query.toLowerCase().trim();
    if (productCache.has(cacheKey)) {
      return productCache.get(cacheKey)!;
    }

    const resp = await fetch(PRODUCTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ action: "search-products", query, limit: 5 }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const errorMsg = data?.error || "Product search failed";
      console.error("[ProductSearch] API error:", resp.status, errorMsg);
      throw new Error(errorMsg);
    }

    const products: Product[] = data.products || [];

    // Cache the results
    if (products.length > 0) {
      productCache.set(cacheKey, products);
    }

    return products;
  };

  const handleProductYes = async () => {
    setShowProductPrompt(false);

    // Add user response
    addMessage("user", "✅ Yes, show me products!");

    // Show loading state
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant" as const,
        content: "🔍 Searching for products matching your recommended outfit...",
        productsLoading: true,
      },
    ]);

    try {
      // Use lastRecommendation, or fallback to the latest assistant message content
      let recommendationText = lastRecommendation;
      if (!recommendationText || recommendationText.trim().length < 20) {
        // Fallback: find the last non-empty assistant message that has actual recommendation text
        const assistantMsgs = messages.filter(
          (m) => m.role === "assistant" && m.content && !m.productPrompt && !m.productsLoading && !m.analysisCard && m.content.length > 50
        );
        if (assistantMsgs.length > 0) {
          recommendationText = assistantMsgs[assistantMsgs.length - 1].content;
        }
      }

      console.log("[ProductSearch] Recommendation text length:", recommendationText.length);
      console.log("[ProductSearch] First 200 chars:", recommendationText.slice(0, 200));

      const queries = extractSearchQueries(recommendationText);
      let allProducts: Product[] = [];
      let lastError = "";

      // Fetch products for each extracted query
      for (const query of queries.slice(0, 3)) {
        try {
          console.log("[ProductSearch] Fetching products for:", query);
          const products = await fetchProducts(query);
          console.log("[ProductSearch] Got", products.length, "results for:", query);
          allProducts = [...allProducts, ...products];
        } catch (e) {
          lastError = e instanceof Error ? e.message : "Unknown error";
          console.error("[ProductSearch] Failed for query:", query, e);
        }
      }

      // Deduplicate by link
      const seen = new Set<string>();
      const uniqueProducts = allProducts.filter((p) => {
        if (seen.has(p.link)) return false;
        seen.add(p.link);
        return true;
      }).slice(0, 8);

      // Replace loading message with products
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.productsLoading);
        if (uniqueProducts.length === 0) {
          const errorHint = lastError
            ? `\n\n_Error: ${lastError}_`
            : "";
          return [
            ...filtered,
            {
              role: "assistant" as const,
              content: `😔 No matching products found. The product search service may be temporarily unavailable.${errorHint}\n\nYou can try searching for the recommended items directly on your favorite shopping site! 🛍️`,
            },
          ];
        }
        return [
          ...filtered,
          {
            role: "assistant" as const,
            content: `🛒 Found **${uniqueProducts.length} products** matching your recommended outfit:`,
            products: uniqueProducts,
          },
        ];
      });
    } catch (e) {
      console.error("[ProductSearch] Fatal error:", e);
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.productsLoading);
        return [
          ...filtered,
          {
            role: "assistant" as const,
            content: "❌ Sorry, I couldn't search for products right now. Please try again later!",
          },
        ];
      });
    }
  };

  const handleProductNo = () => {
    setShowProductPrompt(false);
    addMessage("user", "No thanks, just styling advice is fine 👍");
    addMessage("assistant", "No problem! Feel free to upload another photo or ask me anything about fashion. I'm here to help! ✨");
  };

  // ─── Handle Occasion Submit ────────────────────────────────────────

  const handleIntentSubmit = () => {
    const occasion = selectedOccasion === "custom" ? customOccasion : selectedOccasion;
    if (!occasion || useCurrentOutfit === null || !currentAnalysis) return;

    const intent: UserIntent = {
      occasion,
      useCurrentOutfit,
    };

    // Show user's choice
    addMessage("user", `📍 **Occasion:** ${occasion}\n${useCurrentOutfit ? "✅ Enhance my current outfit" : "🔄 Suggest a completely new outfit"}`);

    sendRecommendation(currentAnalysis, intent);
  };

  // ─── Text-only Chat ────────────────────────────────────────────────

  const sendTextChat = async (userMsg: Msg) => {
    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant" as const, content: assistantSoFar }];
      });
    };

    try {
      const profile = localStorage.getItem("stylesense-profile");
      const allMessages = messages
        .filter((m) => m.role !== "system-ui" && !m.productPrompt && !m.products)
        .concat(userMsg)
        .map(({ role, content }) => ({ role: role === "system-ui" ? "assistant" : role, content }));

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, styleProfile: profile ? JSON.parse(profile) : null }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) {
          upsertAssistant("Too many requests right now. Please try again in a moment. 🙏");
          setIsLoading(false);
          return;
        }
        throw new Error("Stream failed");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      upsertAssistant("Sorry, I encountered an error. Please try again!");
    }
    setIsLoading(false);
  };

  // ─── Send Handler ─────────────────────────────────────────────────

  const send = async () => {
    const hasText = input.trim().length > 0;
    const hasImage = !!pendingFile;
    if ((!hasText && !hasImage) || isLoading) return;

    setIsLoading(true);
    setShowProductPrompt(false);
    let imageUrl: string | undefined;
    let imageDataUrl: string | undefined;

    if (pendingFile) {
      setAnalysisPhase("uploading");
      imageDataUrl = pendingImage || undefined;
      const url = await uploadImage(pendingFile);
      if (url) imageUrl = url;
      setPendingImage(null);
      setPendingFile(null);
    }

    const userMsg: Msg = {
      role: "user",
      content: hasText ? input.trim() : "Analyze my outfit and recommend styles",
      imageUrl,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    if (imageUrl && imageDataUrl) {
      // Image analysis pipeline
      try {
        await runAnalysisPipeline(imageUrl, imageDataUrl);
      } catch (e) {
        console.error(e);
        addMessage("assistant", "❌ Sorry, I couldn't analyze that image. Please try a clearer photo.");
        setAnalysisPhase("idle");
      }
      setIsLoading(false);
    } else {
      // Text-only chat
      await sendTextChat(userMsg);
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────

  const addMessage = (role: Msg["role"], content: string) => {
    setMessages((prev) => [...prev, { role, content }]);
  };

  const updateLastAssistant = (content: string) => {
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = { ...copy[i], content };
          break;
        }
      }
      return copy;
    });
  };

  const formatAnalysisResults = (a: StructuredAnalysis): string => {
    let md = `## 🔍 High-Level Outfit Summary\n\n`;
    md += `| Attribute | Detected |\n|---|---|\n`;
    if (a.outfit_type) md += `| 👔 **Outfit Type** | ${a.outfit_type} |\n`;
    if (a.gender_expression) md += `| 👤 **Fit Expression** | ${a.gender_expression} |\n`;
    if (a.season) md += `| 🍂 **Season** | ${a.season} |\n`;
    if (a.style_vibe) md += `| ✨ **Style Vibe** | ${a.style_vibe} |\n`;
    if (a.color_strategy) md += `| 🎯 **Color Strategy** | ${a.color_strategy} |\n`;
    md += `| 🎨 **Skin Tone** | ${a.skin_tone.category} \`${a.skin_tone.hex}\` |\n`;
    md += `| 🏋️ **Body Type** | ${a.body_type} |\n`;
    if (a.layering_level) md += `| 🧅 **Layering** | ${a.layering_level} |\n`;
    if (a.formality_score) md += `| 📐 **Formality** | ${a.formality_score}/10 |\n`;
    if (a.boldness_score) md += `| 🔥 **Boldness** | ${a.boldness_score}/10 |\n`;
    md += "\n";

    // Individual garment breakdown
    if (a.outfit.length > 0) {
      a.outfit.forEach((item, idx) => {
        const emoji = item.zone?.toLowerCase().includes("outer") || item.zone?.toLowerCase().includes("top")
          ? "🧥" : item.zone?.toLowerCase().includes("shirt") || item.zone?.toLowerCase().includes("mid")
            ? "👕" : item.zone?.toLowerCase().includes("bottom")
              ? "👖" : item.zone?.toLowerCase().includes("foot")
                ? "👢" : "👔";
        md += `### ${emoji} ${idx + 1}. ${item.zone || "Clothing Item"}\n\n`;
        md += `| Detail | Value |\n|---|---|\n`;
        md += `| **Item** | ${item.type} |\n`;
        md += `| **Primary Color** | ${item.dominant_color} \`${item.hex}\` |\n`;
        if (item.fit) md += `| **Fit** | ${item.fit} |\n`;
        if (item.material_guess) md += `| **Material (Est.)** | ${item.material_guess} |\n`;
        if (item.confidence) md += `| **Confidence** | ${Math.round(item.confidence * 100)}% |\n`;
        md += "\n";
        if (item.description) md += `> ${item.description}\n\n`;
      });
    }

    // Accessories
    if (a.accessories.length > 0) {
      md += `### 🧣 Accessories\n\n`;
      for (const acc of a.accessories) {
        md += `- ${acc}\n`;
      }
      md += "\n";
    }

    // Color palette (human-readable)
    if (a.color_palette) {
      md += `### 🎨 Color Palette\n\n`;
      md += `| Aspect | Details |\n|---|---|\n`;
      if (a.color_palette.primary_colors.length > 0 && a.color_palette.primary_colors[0] !== "not clearly detected") {
        md += `| **Primary Colors** | ${a.color_palette.primary_colors.join(", ")} |\n`;
      }
      if (a.color_palette.secondary_colors.length > 0) {
        md += `| **Secondary Colors** | ${a.color_palette.secondary_colors.join(", ")} |\n`;
      }
      if (a.color_palette.neutrals.length > 0) {
        md += `| **Neutrals** | ${a.color_palette.neutrals.join(", ")} |\n`;
      }
      if (a.color_palette.color_temperature) {
        md += `| **Temperature** | ${a.color_palette.color_temperature} |\n`;
      }
      if (a.color_palette.contrast_level) {
        md += `| **Contrast** | ${a.color_palette.contrast_level} |\n`;
      }
      md += "\n";
    }

    // Style tags (human-readable)
    if (a.style_tags && a.style_tags.length > 0) {
      md += `### 🏷 Style Tags\n\n`;
      md += `> ${a.style_tags.join(" · ")}\n\n`;
    }

    return md;
  };

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pt-16 flex flex-col bg-gradient-to-b from-background via-background to-background/95">
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="p-6 border-b border-border/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center border border-accent/20">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                AI Stylist
              </h1>
              <p className="text-xs text-muted-foreground">
                Upload a photo for AI-powered outfit analysis & personalized recommendations
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && analysisPhase === "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16"
            >
              <div className="relative inline-block mb-6">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent/20 to-purple-500/10 flex items-center justify-center border border-accent/20 mx-auto">
                  <Sparkles className="h-10 w-10 text-accent/60" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              </div>

              <h2 className="font-display text-2xl font-semibold mb-2">
                Your AI Fashion Stylist
              </h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8">
                Upload an outfit photo for a complete analysis — skin tone, body type, outfit detection — then get personalized recommendations for any occasion!
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-6">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-3 p-4 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-all group text-left"
                >
                  <Camera className="h-5 w-5 text-accent group-hover:scale-110 transition-transform" />
                  <div>
                    <p className="text-sm font-medium">Upload Photo</p>
                    <p className="text-xs text-muted-foreground">Get full outfit analysis</p>
                  </div>
                </button>
                <button
                  onClick={() => setInput("What should I wear for ")}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-accent/30 bg-secondary/30 hover:bg-secondary/50 transition-all group text-left"
                >
                  <Sparkles className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors" />
                  <div>
                    <p className="text-sm font-medium">Ask for Advice</p>
                    <p className="text-xs text-muted-foreground">Get styling suggestions</p>
                  </div>
                </button>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {["Date night outfit ideas", "Office wear for summer", "Casual weekend look"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="px-4 py-2 rounded-full border border-border hover:border-accent/30 text-sm text-muted-foreground hover:text-foreground transition-all hover:bg-secondary/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="popLayout">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === "user"
                    ? "bg-accent text-accent-foreground rounded-br-md"
                    : "bg-secondary/70 backdrop-blur-sm text-secondary-foreground rounded-bl-md border border-border/50"
                    }`}
                >
                  {msg.imageUrl && (
                    <img
                      src={msg.imageUrl}
                      alt="Uploaded outfit"
                      className="rounded-lg mb-2 max-h-64 object-cover w-full border border-border/30"
                    />
                  )}

                  {/* Structured analysis card with visual data */}
                  {msg.analysisCard && (
                    <AnalysisCard analysis={msg.analysisCard} />
                  )}

                  {/* Product prompt buttons */}
                  {msg.productPrompt && showProductPrompt && (
                    <ProductPromptCard
                      onYes={handleProductYes}
                      onNo={handleProductNo}
                    />
                  )}

                  {/* Products loading */}
                  {msg.productsLoading && (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-accent" />
                      <span className="text-sm text-muted-foreground">Searching for products...</span>
                    </div>
                  )}

                  {/* Product cards */}
                  {msg.products && msg.products.length > 0 && (
                    <ProductGrid products={msg.products} />
                  )}

                  {msg.content && msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.content ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Intent Question Card */}
          {analysisPhase === "asking-intent" && currentAnalysis && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="max-w-[90%] w-full">
                <IntentCard
                  selectedOccasion={selectedOccasion}
                  setSelectedOccasion={setSelectedOccasion}
                  customOccasion={customOccasion}
                  setCustomOccasion={setCustomOccasion}
                  useCurrentOutfit={useCurrentOutfit}
                  setUseCurrentOutfit={setUseCurrentOutfit}
                  onSubmit={handleIntentSubmit}
                  isReady={
                    (selectedOccasion !== "" && selectedOccasion !== "custom" || customOccasion.trim() !== "") &&
                    useCurrentOutfit !== null
                  }
                />
              </div>
            </motion.div>
          )}

          {/* Loading states */}
          {isLoading && analysisPhase === "idle" && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-start">
              <div className="bg-secondary/70 rounded-2xl rounded-bl-md px-4 py-3 border border-border/50">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {analysisPhase === "uploading" && (
            <div className="flex justify-start">
              <div className="bg-secondary/70 rounded-2xl rounded-bl-md px-4 py-3 border border-border/50">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  <span className="text-xs text-muted-foreground">Uploading image...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pending image preview */}
        {pendingImage && (
          <div className="px-4 pb-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative inline-block"
            >
              <img src={pendingImage} alt="Preview" className="h-20 rounded-lg border border-accent/30 shadow-lg shadow-accent/5" />
              <button
                onClick={() => { setPendingImage(null); setPendingFile(null); }}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow-lg hover:scale-110 transition-transform"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border/50 p-4 backdrop-blur-sm">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex gap-2 max-w-3xl mx-auto"
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              disabled={isLoading || analysisPhase === "asking-intent"}
              className="rounded-full h-11 w-11 shrink-0 hover:bg-accent/10 hover:text-accent transition-all"
            >
              <ImagePlus className="h-5 w-5" />
            </Button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                analysisPhase === "asking-intent"
                  ? "Select an occasion above to continue..."
                  : "Ask your AI stylist or upload a photo..."
              }
              className="flex-1 bg-secondary/40 rounded-full px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 border border-border/50 transition-all focus:border-accent/30"
              disabled={isLoading || analysisPhase === "asking-intent"}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || (!input.trim() && !pendingFile) || analysisPhase === "asking-intent"}
              className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90 h-11 w-11 shadow-lg shadow-accent/20 transition-all hover:shadow-accent/30"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

// ─── Analysis Card Sub-Component ─────────────────────────────────────

function AnalysisCard({ analysis }: { analysis: StructuredAnalysis }) {
  return (
    <div className="mb-3 space-y-3">
      {/* Skin tone & Body Type row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/50 border border-border/50">
          <div
            className="w-8 h-8 rounded-full border-2 border-border shadow-inner"
            style={{ backgroundColor: analysis.skin_tone.hex }}
          />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Skin Tone</p>
            <p className="text-xs font-semibold">{analysis.skin_tone.category}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background/50 border border-border/50">
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
            <User className="h-4 w-4 text-accent" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Body Type</p>
            <p className="text-xs font-semibold">{analysis.body_type}</p>
          </div>
        </div>
      </div>

      {/* Outfit items */}
      {analysis.outfit.length > 0 && (
        <div className="space-y-1.5">
          {analysis.outfit.map((item, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-background/30 border border-border/30">
              <Shirt className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium flex-1">{item.type}</span>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ backgroundColor: item.hex }}
                />
                <span className="text-[10px] text-muted-foreground">{item.dominant_color}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accessories */}
      {analysis.accessories.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Watch className="h-3.5 w-3.5 text-muted-foreground" />
          {analysis.accessories.map((acc, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
              {acc}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Product Prompt Card ─────────────────────────────────────────────

function ProductPromptCard({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mt-3 mb-1"
    >
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={onYes}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold
                     bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400
                     border border-emerald-500/30 hover:border-emerald-400/50
                     hover:from-emerald-500/30 hover:to-teal-500/30
                     shadow-md shadow-emerald-500/5 hover:shadow-emerald-500/10
                     transition-all duration-200 hover:scale-[1.02]"
        >
          <ShoppingBag className="h-4 w-4" />
          Yes, show me products
        </button>
        <button
          onClick={onNo}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold
                     bg-background/50 text-muted-foreground
                     border border-border/50 hover:border-border
                     hover:bg-background/80 hover:text-foreground
                     transition-all duration-200"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          No, just styling advice
        </button>
      </div>
    </motion.div>
  );
}

// ─── Product Grid ────────────────────────────────────────────────────

function ProductGrid({ products }: { products: Product[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 mb-1"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {products.map((product, i) => (
          <motion.a
            key={i}
            href={product.link}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="group block rounded-xl overflow-hidden border border-border/50
                       bg-background/60 hover:bg-background/80
                       hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5
                       transition-all duration-250 hover:scale-[1.02]"
          >
            {/* Product image */}
            {product.image ? (
              <div className="aspect-square w-full overflow-hidden bg-secondary/30">
                <img
                  src={product.image}
                  alt={product.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ) : (
              <div className="aspect-square w-full bg-secondary/30 flex items-center justify-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
              </div>
            )}

            {/* Product info */}
            <div className="p-3 space-y-1.5">
              <p className="text-xs font-medium leading-tight line-clamp-2 group-hover:text-accent transition-colors">
                {product.title}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-400">
                  {product.price}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Buy Now <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </div>
          </motion.a>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Intent Card Sub-Component ───────────────────────────────────────

function IntentCard({
  selectedOccasion,
  setSelectedOccasion,
  customOccasion,
  setCustomOccasion,
  useCurrentOutfit,
  setUseCurrentOutfit,
  onSubmit,
  isReady,
}: {
  selectedOccasion: string;
  setSelectedOccasion: (v: string) => void;
  customOccasion: string;
  setCustomOccasion: (v: string) => void;
  useCurrentOutfit: boolean | null;
  setUseCurrentOutfit: (v: boolean) => void;
  onSubmit: () => void;
  isReady: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/40 backdrop-blur-md border border-accent/20 overflow-hidden shadow-xl shadow-accent/5"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold">What's the occasion?</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Tell me where you're going so I can give you the perfect recommendation
        </p>
      </div>

      {/* Occasion grid */}
      <div className="px-5 pb-3">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {OCCASION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelectedOccasion(opt.value)}
              className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-all border ${selectedOccasion === opt.value
                ? "bg-accent text-accent-foreground border-accent shadow-md shadow-accent/20"
                : "bg-background/50 border-border/50 hover:border-accent/30 hover:bg-accent/5"
                }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setSelectedOccasion("custom")}
            className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-all border ${selectedOccasion === "custom"
              ? "bg-accent text-accent-foreground border-accent shadow-md shadow-accent/20"
              : "bg-background/50 border-border/50 hover:border-accent/30 hover:bg-accent/5"
              }`}
          >
            ✏️ Other
          </button>
        </div>

        {selectedOccasion === "custom" && (
          <motion.input
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            value={customOccasion}
            onChange={(e) => setCustomOccasion(e.target.value)}
            placeholder="Type your occasion..."
            className="w-full mt-2 px-3 py-2 rounded-lg text-xs bg-background/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        )}
      </div>

      {/* Current outfit question */}
      <div className="px-5 pb-3">
        <p className="text-xs font-medium mb-2 text-muted-foreground">
          Do you want to use your current outfit or upgrade it?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setUseCurrentOutfit(true)}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all border ${useCurrentOutfit === true
              ? "bg-green-500/20 text-green-400 border-green-500/40 shadow-md shadow-green-500/10"
              : "bg-background/50 border-border/50 hover:border-green-500/30 hover:bg-green-500/5"
              }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Enhance Current
          </button>
          <button
            onClick={() => setUseCurrentOutfit(false)}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all border ${useCurrentOutfit === false
              ? "bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-md shadow-blue-500/10"
              : "bg-background/50 border-border/50 hover:border-blue-500/30 hover:bg-blue-500/5"
              }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            New Outfit
          </button>
        </div>
      </div>

      {/* Submit */}
      <div className="px-5 pb-5">
        <Button
          onClick={onSubmit}
          disabled={!isReady}
          className="w-full rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20 transition-all disabled:opacity-40 disabled:shadow-none"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Get Personalized Recommendations
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}

export default AIStylistChat;
