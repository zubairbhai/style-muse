import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HF_API_URL = "https://api-inference.huggingface.co/models";

// Fashion-related COCO labels from DETR
const FASHION_LABELS = new Set([
  "person",
  "tie",
  "handbag",
  "suitcase",
  "umbrella",
  "backpack",
]);

// Map generic labels to fashion categories
function mapToFashionCategory(label: string): string | null {
  const map: Record<string, string> = {
    person: "full_outfit",
    tie: "accessory",
    handbag: "bag",
    suitcase: "bag",
    umbrella: "accessory",
    backpack: "bag",
  };
  return map[label] || null;
}

async function detectObjects(imageBytes: Uint8Array, token: string) {
  // Use facebook/detr-resnet-50 for object detection
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

async function classifyImage(imageBytes: Uint8Array, token: string) {
  // Use google/vit-base-patch16-224 for general image classification
  const response = await fetch(
    `${HF_API_URL}/google/vit-base-patch16-224`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: imageBytes,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error("HF ViT error:", response.status, text);
    return [];
  }

  return await response.json();
}

async function segmentImage(imageBytes: Uint8Array, token: string) {
  // Use image segmentation for better clothing detection
  const response = await fetch(
    `${HF_API_URL}/mattmdjaga/segformer_b2_clothes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: imageBytes,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error("HF segmentation error:", response.status, text);
    return null;
  }

  return await response.json();
}

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

    // Process object detections
    const clothingItems: any[] = [];

    // Process DETR detections
    if (Array.isArray(detections)) {
      for (const det of detections) {
        const label = det.label?.toLowerCase();
        const score = det.score || 0;
        if (score < 0.5) continue;

        const category = mapToFashionCategory(label);
        if (category || score > 0.7) {
          clothingItems.push({
            category: category || label,
            confidence: Math.round(score * 100) / 100,
            bounding_box: det.box
              ? [det.box.xmin, det.box.ymin, det.box.xmax, det.box.ymax]
              : null,
            source: "detr",
          });
        }
      }
    }

    // Process segmentation results (clothing-specific)
    const segmentationItems: any[] = [];
    if (Array.isArray(segmentation)) {
      for (const seg of segmentation) {
        if (seg.label && seg.label !== "Background" && seg.score > 0.3) {
          segmentationItems.push({
            category: seg.label.toLowerCase().replace(/-/g, "_"),
            confidence: Math.round(seg.score * 100) / 100,
            source: "segformer",
          });
        }
      }
    }

    // Process image classification for overall style
    const styleLabels: any[] = [];
    if (Array.isArray(classifications)) {
      for (const cls of classifications.slice(0, 5)) {
        styleLabels.push({
          label: cls.label,
          confidence: Math.round((cls.score || 0) * 100) / 100,
        });
      }
    }

    // Build structured response
    const result = {
      clothing_items: segmentationItems.length > 0 ? segmentationItems : clothingItems,
      object_detections: clothingItems,
      style_classifications: styleLabels,
      body_attributes: {
        person_detected: detections?.some?.(
          (d: any) => d.label === "person" && d.score > 0.5
        ) || false,
        person_box: detections?.find?.(
          (d: any) => d.label === "person" && d.score > 0.5
        )?.box || null,
      },
      raw_segmentation_labels: segmentationItems.map((s: any) => s.category),
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
