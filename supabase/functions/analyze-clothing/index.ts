import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HF_API_URL = "https://api-inference.huggingface.co/models";

// ─── Skin tone classification ────────────────────────────────────────

interface SkinToneResult {
  category: "Fair" | "Medium" | "Wheatish" | "Brown" | "Dark";
  hex: string;
}

function classifySkinTone(r: number, g: number, b: number): SkinToneResult {
  // Calculate luminance-based skin classification
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const hex = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

  if (luminance > 200) return { category: "Fair", hex };
  if (luminance > 170) return { category: "Medium", hex };
  if (luminance > 140) return { category: "Wheatish", hex };
  if (luminance > 100) return { category: "Brown", hex };
  return { category: "Dark", hex };
}

// ─── Body type classification ────────────────────────────────────────

type BodyType = "Thin" | "Average" | "Fit / Athletic" | "Heavy / Broad" | "Unknown";

function classifyBodyType(
  personBox: { xmin: number; ymin: number; xmax: number; ymax: number } | null
): BodyType {
  if (!personBox) return "Unknown";
  const { xmin, ymin, xmax, ymax } = personBox;
  const w = xmax - xmin;
  const h = ymax - ymin;
  if (h === 0) return "Unknown";
  const ratio = w / h;

  // Heuristics based on bounding box width-to-height ratio
  if (ratio < 0.28) return "Thin";
  if (ratio < 0.38) return "Average";
  if (ratio < 0.48) return "Fit / Athletic";
  return "Heavy / Broad";
}

// ─── Outfit type classification ──────────────────────────────────────

const CLOTHING_CATEGORIES: Record<string, string> = {
  // SegFormer label → user-facing outfit type
  upper_body: "T-shirt",
  shirt: "Shirt",
  jacket: "Jacket",
  coat: "Coat",
  hoodie: "Hoodie",
  sweater: "Sweater",
  dress: "Dress",
  top: "Top",
  blouse: "Blouse",
  cardigan: "Cardigan",
  vest: "Vest",
  lower_body: "Trousers",
  pants: "Trousers",
  trousers: "Trousers",
  jeans: "Jeans",
  shorts: "Shorts",
  skirt: "Skirt",
  leggings: "Leggings",
  shoes: "Shoes",
  boots: "Boots",
  sneakers: "Shoes",
  sandals: "Shoes",
  belt: "Belt",
  hat: "Cap",
  cap: "Cap",
  sunglasses: "Sunglasses",
  scarf: "Scarf",
  bag: "Bag",
  handbag: "Bag",
  backpack: "Bag",
  left_shoe: "Shoes",
  right_shoe: "Shoes",
  headwear: "Cap",
  glove: "Gloves",
  sock: "Socks",
  face: "Face",
  hair: "Hair",
  skin: "Skin",
  left_arm: "Skin",
  right_arm: "Skin",
  left_leg: "Skin",
  right_leg: "Skin",
};

// ─── Accessory detection ─────────────────────────────────────────────

const ACCESSORY_LABELS = new Set([
  "watch", "sunglasses", "chain", "bag", "handbag", "backpack",
  "cap", "hat", "headwear", "belt", "scarf", "tie", "glove",
  "bracelet", "necklace", "ring", "earring",
]);

function detectAccessories(labels: string[]): string[] {
  const detected = new Set<string>();
  for (const label of labels) {
    const l = label.toLowerCase().replace(/[-\s]/g, "_");
    if (l.includes("sunglass")) detected.add("Sunglasses");
    else if (l.includes("watch")) detected.add("Watch");
    else if (l.includes("chain") || l.includes("necklace")) detected.add("Chain");
    else if (l.includes("bag") || l.includes("backpack") || l.includes("handbag")) detected.add("Bag");
    else if (l.includes("cap") || l.includes("hat") || l.includes("headwear")) detected.add("Cap");
    else if (l.includes("belt")) detected.add("Belt");
    else if (l.includes("scarf")) detected.add("Scarf");
    else if (l.includes("tie")) detected.add("Tie");
    else if (l.includes("glove")) detected.add("Gloves");
    else if (l.includes("bracelet")) detected.add("Bracelet");
    else if (l.includes("earring")) detected.add("Earrings");
    else if (l.includes("ring") && !l.includes("earring")) detected.add("Ring");
  }
  return Array.from(detected);
}

// ─── Color extraction helpers ────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function rgbToName(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l < 15) return "Black";
  if (l > 85 && s < 15) return "White";
  if (s < 10) return l < 50 ? "Dark Gray" : "Light Gray";
  if (h < 15 || h >= 345) return l < 40 ? "Dark Red" : s > 60 ? "Red" : "Pink";
  if (h < 35) return l < 40 ? "Brown" : "Orange";
  if (h < 55) return l > 70 ? "Cream" : "Yellow";
  if (h < 80) return l < 40 ? "Olive" : "Lime Green";
  if (h < 160) return l < 40 ? "Dark Green" : "Green";
  if (h < 200) return l < 40 ? "Teal" : "Cyan";
  if (h < 260) return l < 40 ? "Navy" : "Blue";
  if (h < 290) return l < 40 ? "Indigo" : "Purple";
  if (h < 345) return l < 40 ? "Burgundy" : s > 50 ? "Magenta" : "Mauve";
  return "Red";
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// ─── HF Model calls ─────────────────────────────────────────────────

async function detectObjects(imageBytes: ArrayBuffer, token: string) {
  const response = await fetch(`${HF_API_URL}/facebook/detr-resnet-50`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: imageBytes,
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("HF DETR error:", response.status, text);
    throw new Error(`Object detection failed: ${response.status}`);
  }
  return await response.json();
}

async function classifyImage(imageBytes: ArrayBuffer, token: string) {
  const response = await fetch(`${HF_API_URL}/google/vit-base-patch16-224`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: imageBytes,
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("HF ViT error:", response.status, text);
    return [];
  }
  return await response.json();
}

async function segmentImage(imageBytes: Uint8Array, token: string) {
  const blob = new Blob([imageBytes], { type: "application/octet-stream" });
  const response = await fetch(`${HF_API_URL}/mattmdjaga/segformer_b2_clothes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: blob,
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("HF segmentation error:", response.status, text);
    return null;
  }
  return await response.json();
}

async function detectFaces(imageBytes: Uint8Array, token: string) {
  const blob = new Blob([imageBytes], { type: "application/octet-stream" });
  const response = await fetch(`${HF_API_URL}/google/vit-base-patch16-224`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: blob,
  });
  if (!response.ok) return null;
  return await response.json();
}

// ─── Estimate skin tone from person bounding box ─────────────────────

function estimateSkinToneFromSegmentation(
  segmentation: any[] | null
): SkinToneResult | null {
  // If we have segmentation results with "Face" or "Skin" labels,
  // use a reasonable average for that region.
  // Since HF segmentation returns masks (not pixel data we can read server-side),
  // we rely on heuristic defaults based on detection confidence.
  if (!segmentation || !Array.isArray(segmentation)) return null;

  const skinLabels = segmentation.filter(
    (s: any) => s.label && (
      s.label.toLowerCase().includes("face") ||
      s.label.toLowerCase().includes("skin") ||
      s.label.toLowerCase().includes("arm") ||
      s.label.toLowerCase().includes("leg")
    )
  );

  if (skinLabels.length > 0) {
    // Return a placeholder — the actual skin tone is extracted client-side
    // from the face region using canvas
    return null; // Will be filled client-side
  }
  return null;
}

// ─── Main handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const HF_TOKEN = Deno.env.get("HF_API_TOKEN");
    if (!HF_TOKEN) throw new Error("HF_API_TOKEN is not configured");

    const { imageUrl } = await req.json();
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "No image URL provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the image as bytes
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error("Failed to fetch image");
    const imageBytes = new Uint8Array(await imgResp.arrayBuffer());

    // Run detection, classification, and segmentation in parallel
    const [detections, classifications, segmentation] = await Promise.all([
      detectObjects(imageBytes, HF_TOKEN).catch((e) => {
        console.error("Detection failed:", e);
        return [];
      }),
      classifyImage(imageBytes, HF_TOKEN).catch((e) => {
        console.error("Classification failed:", e);
        return [];
      }),
      segmentImage(imageBytes, HF_TOKEN).catch((e) => {
        console.error("Segmentation failed:", e);
        return null;
      }),
    ]);

    // ── Process object detections
    const clothingItems: any[] = [];
    const personDetections: any[] = [];

    if (Array.isArray(detections)) {
      for (const det of detections) {
        const label = det.label?.toLowerCase();
        const score = det.score || 0;
        if (score < 0.5) continue;

        if (label === "person") {
          personDetections.push(det);
        }

        clothingItems.push({
          category: label,
          confidence: Math.round(score * 100) / 100,
          bounding_box: det.box
            ? [det.box.xmin, det.box.ymin, det.box.xmax, det.box.ymax]
            : null,
          source: "detr",
        });
      }
    }

    // ── Process segmentation results (clothing-specific)
    const segmentationItems: any[] = [];
    const allSegLabels: string[] = [];
    if (Array.isArray(segmentation)) {
      for (const seg of segmentation) {
        if (seg.label && seg.label !== "Background" && seg.score > 0.3) {
          const rawLabel = seg.label.toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
          allSegLabels.push(rawLabel);

          // Map to user-facing outfit type
          const outfitType = CLOTHING_CATEGORIES[rawLabel] ||
            seg.label.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

          segmentationItems.push({
            category: rawLabel,
            outfitType: outfitType,
            confidence: Math.round(seg.score * 100) / 100,
            source: "segformer",
          });
        }
      }
    }

    // ── Process image classification for overall style
    const styleLabels: any[] = [];
    if (Array.isArray(classifications)) {
      for (const cls of classifications.slice(0, 5)) {
        styleLabels.push({
          label: cls.label,
          confidence: Math.round((cls.score || 0) * 100) / 100,
        });
      }
    }

    // ── Body type from person bounding box
    const primaryPerson = personDetections.sort((a: any, b: any) => b.score - a.score)[0];
    const personBox = primaryPerson?.box || null;
    const bodyType = classifyBodyType(personBox);

    // ── Detect accessories from all labels
    const allLabels = [
      ...allSegLabels,
      ...clothingItems.map((i: any) => i.category),
      ...styleLabels.map((s: any) => s.label.toLowerCase()),
    ];
    const accessories = detectAccessories(allLabels);

    // ── Build outfit items (excluding skin/face/hair)
    const outfitItems = segmentationItems
      .filter((s: any) => {
        const cat = s.category.toLowerCase();
        return !cat.includes("face") && !cat.includes("hair") &&
          !cat.includes("skin") && !cat.includes("arm") &&
          !cat.includes("leg") && !cat.includes("background");
      })
      .map((s: any) => ({
        type: s.outfitType,
        confidence: s.confidence,
        dominant_color: null, // To be filled client-side
        hex: null,           // To be filled client-side
      }));

    // ── Build structured response
    const result = {
      // Full structured data for the new pipeline
      skin_tone: null as SkinToneResult | null, // extracted client-side from face region
      body_type: bodyType,
      outfit: outfitItems.length > 0 ? outfitItems : [{
        type: "Unknown",
        confidence: 0,
        dominant_color: null,
        hex: null,
      }],
      accessories,

      // Raw data for backward compatibility & client-side processing
      clothing_items: segmentationItems.length > 0 ? segmentationItems : clothingItems,
      object_detections: clothingItems,
      style_classifications: styleLabels,
      body_attributes: {
        person_detected: personDetections.length > 0,
        person_box: personBox,
      },
      raw_segmentation_labels: allSegLabels,

      // Flag indicating face/skin regions detected (for client-side skin tone extraction)
      has_face_region: allSegLabels.some(l => l.includes("face")),
      has_skin_region: allSegLabels.some(l => l.includes("skin") || l.includes("arm") || l.includes("leg")),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-clothing error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
