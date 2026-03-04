/**
 * Client-side image analysis utilities.
 * 
 * Handles:
 * - Skin tone extraction from face region using canvas
 * - Dominant color extraction per clothing item
 * - Building the structured analysis JSON
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface SkinTone {
    category: "Fair" | "Medium" | "Wheatish" | "Brown" | "Dark";
    hex: string;
}

export interface OutfitItem {
    type: string;
    dominant_color: string;
    hex: string;
    confidence?: number;
}

export interface StructuredAnalysis {
    skin_tone: SkinTone;
    body_type: string;
    outfit: OutfitItem[];
    accessories: string[];
}

export interface UserIntent {
    occasion: string;
    useCurrentOutfit: boolean;
}

export interface FullAnalysisPayload {
    analysisData: StructuredAnalysis;
    userIntent: UserIntent;
    imageUrl?: string;
}

// Raw analysis from the edge function
export interface RawAnalysis {
    skin_tone: SkinTone | null;
    body_type: string;
    outfit: { type: string; dominant_color: string | null; hex: string | null; confidence?: number }[];
    accessories: string[];
    clothing_items: any[];
    object_detections: any[];
    style_classifications: any[];
    body_attributes: {
        person_detected: boolean;
        person_box: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
    };
    raw_segmentation_labels: string[];
    has_face_region: boolean;
    has_skin_region: boolean;
}

// ─── Skin Tone Extraction ────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function classifySkinTone(r: number, g: number, b: number): SkinTone {
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const hex = rgbToHex(r, g, b);

    if (luminance > 200) return { category: "Fair", hex };
    if (luminance > 170) return { category: "Medium", hex };
    if (luminance > 140) return { category: "Wheatish", hex };
    if (luminance > 100) return { category: "Brown", hex };
    return { category: "Dark", hex };
}

/**
 * Extract skin tone from the face/upper body region of an image.
 * Uses canvas to sample pixels from the upper-center region (likely face area).
 */
export function extractSkinTone(
    imageSrc: string,
    personBox?: { xmin: number; ymin: number; xmax: number; ymax: number } | null
): Promise<SkinTone> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve({ category: "Medium", hex: "#C68642" });
                return;
            }
            ctx.drawImage(img, 0, 0);

            // Define face sampling region
            let sampleX: number, sampleY: number, sampleW: number, sampleH: number;

            if (personBox) {
                // Face is roughly the top 25% of the person bounding box, centered
                const px = personBox.xmin;
                const py = personBox.ymin;
                const pw = personBox.xmax - personBox.xmin;
                const ph = personBox.ymax - personBox.ymin;

                sampleX = Math.round(px + pw * 0.3);
                sampleY = Math.round(py);
                sampleW = Math.round(pw * 0.4);
                sampleH = Math.round(ph * 0.2);
            } else {
                // Default: sample upper-center of image (likely head/face area)
                sampleX = Math.round(w * 0.3);
                sampleY = Math.round(h * 0.05);
                sampleW = Math.round(w * 0.4);
                sampleH = Math.round(h * 0.2);
            }

            // Clamp values
            sampleX = Math.max(0, Math.min(sampleX, w - 1));
            sampleY = Math.max(0, Math.min(sampleY, h - 1));
            sampleW = Math.max(1, Math.min(sampleW, w - sampleX));
            sampleH = Math.max(1, Math.min(sampleH, h - sampleY));

            const imageData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
            const data = imageData.data;

            // Collect skin-like pixels (filter out non-skin tones)
            let totalR = 0, totalG = 0, totalB = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2];

                // Simple skin-color filter (works for a wide range of skin tones)
                // Skin pixels tend to have R > G > B with certain thresholds
                if (r > 60 && g > 40 && b > 20 && r > b && (r - g) < 100 && r < 250) {
                    totalR += r;
                    totalG += g;
                    totalB += b;
                    count++;
                }
            }

            if (count > 0) {
                const avgR = Math.round(totalR / count);
                const avgG = Math.round(totalG / count);
                const avgB = Math.round(totalB / count);
                resolve(classifySkinTone(avgR, avgG, avgB));
            } else {
                // Fallback: just average all pixels in the region
                let tR = 0, tG = 0, tB = 0, n = 0;
                for (let i = 0; i < data.length; i += 4) {
                    tR += data[i]; tG += data[i + 1]; tB += data[i + 2]; n++;
                }
                if (n > 0) {
                    resolve(classifySkinTone(Math.round(tR / n), Math.round(tG / n), Math.round(tB / n)));
                } else {
                    resolve({ category: "Medium", hex: "#C68642" });
                }
            }
        };
        img.onerror = () => resolve({ category: "Medium", hex: "#C68642" });
        img.src = imageSrc;
    });
}

// ─── Dominant Color Extraction ───────────────────────────────────────

function rgbToColorName(r: number, g: number, b: number): string {
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

/**
 * Extract dominant color from a specific region of an image using KMeans clustering.
 */
export function extractRegionColor(
    imageSrc: string,
    regionPct?: { x: number; y: number; w: number; h: number }
): Promise<{ color: string; hex: string }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const size = 80;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve({ color: "Unknown", hex: "#808080" });
                return;
            }

            if (regionPct) {
                // Draw only the specified region
                const sx = Math.round(regionPct.x * img.naturalWidth);
                const sy = Math.round(regionPct.y * img.naturalHeight);
                const sw = Math.round(regionPct.w * img.naturalWidth);
                const sh = Math.round(regionPct.h * img.naturalHeight);
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
            } else {
                // Draw the middle portion (likely clothing area)
                const sx = Math.round(img.naturalWidth * 0.2);
                const sy = Math.round(img.naturalHeight * 0.25);
                const sw = Math.round(img.naturalWidth * 0.6);
                const sh = Math.round(img.naturalHeight * 0.5);
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
            }

            const data = ctx.getImageData(0, 0, size, size).data;
            const pixels: number[][] = [];
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 128) continue;
                pixels.push([data[i], data[i + 1], data[i + 2]]);
            }

            if (pixels.length === 0) {
                resolve({ color: "Unknown", hex: "#808080" });
                return;
            }

            // Simple KMeans with k=3 to find dominant clothing color
            const centroids = simpleKMeans(pixels, 3);
            // Pick the centroid with most pixels (excluding very light/dark — likely skin/background)
            const counts = new Array(centroids.length).fill(0);
            for (const px of pixels) {
                let minDist = Infinity, minIdx = 0;
                for (let j = 0; j < centroids.length; j++) {
                    const d = Math.sqrt(
                        (px[0] - centroids[j][0]) ** 2 +
                        (px[1] - centroids[j][1]) ** 2 +
                        (px[2] - centroids[j][2]) ** 2
                    );
                    if (d < minDist) { minDist = d; minIdx = j; }
                }
                counts[minIdx]++;
            }

            // Find the centroid that's most likely clothing (not too bright, not skin-like)
            let bestIdx = 0;
            let bestCount = 0;
            for (let i = 0; i < centroids.length; i++) {
                const [r, g, b] = centroids[i];
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                // Skip very light (likely background) or skin-like colors
                const isSkinLike = r > 150 && g > 100 && b > 70 && r > b && (r - g) < 60;
                const skipFactor = (lum > 240 || isSkinLike) ? 0.3 : 1;
                const adjustedCount = counts[i] * skipFactor;
                if (adjustedCount > bestCount) {
                    bestCount = adjustedCount;
                    bestIdx = i;
                }
            }

            const [r, g, b] = centroids[bestIdx];
            resolve({
                color: rgbToColorName(r, g, b),
                hex: rgbToHex(r, g, b),
            });
        };
        img.onerror = () => resolve({ color: "Unknown", hex: "#808080" });
        img.src = imageSrc;
    });
}

function simpleKMeans(pixels: number[][], k: number, iterations = 8): number[][] {
    if (pixels.length === 0) return [];
    const step = Math.max(1, Math.floor(pixels.length / k));
    let centroids = Array.from({ length: k }, (_, i) => [
        ...pixels[Math.min(i * step, pixels.length - 1)],
    ]);

    for (let iter = 0; iter < iterations; iter++) {
        const clusters: number[][][] = Array.from({ length: k }, () => []);
        for (const px of pixels) {
            let minDist = Infinity, minIdx = 0;
            for (let j = 0; j < k; j++) {
                const d = Math.sqrt(
                    (px[0] - centroids[j][0]) ** 2 +
                    (px[1] - centroids[j][1]) ** 2 +
                    (px[2] - centroids[j][2]) ** 2
                );
                if (d < minDist) { minDist = d; minIdx = j; }
            }
            clusters[minIdx].push(px);
        }
        centroids = clusters.map((cluster, i) => {
            if (cluster.length === 0) return centroids[i];
            const avg = [0, 0, 0];
            for (const px of cluster) {
                avg[0] += px[0]; avg[1] += px[1]; avg[2] += px[2];
            }
            return avg.map((v) => Math.round(v / cluster.length));
        });
    }
    return centroids;
}

// ─── Build Structured Analysis ───────────────────────────────────────

/**
 * Takes raw analysis from edge function + client-side extracted data
 * and builds the structured analysis JSON.
 */
export function buildStructuredAnalysis(
    rawAnalysis: RawAnalysis,
    skinTone: SkinTone,
    outfitColors: { color: string; hex: string }[]
): StructuredAnalysis {
    const rawOutfit = rawAnalysis?.outfit || [];
    const outfit: OutfitItem[] = rawOutfit
        .filter((o) => o && o.type !== "Unknown")
        .map((o, i) => ({
            type: o.type || "Unknown",
            dominant_color: outfitColors[i]?.color || o.dominant_color || "Unknown",
            hex: outfitColors[i]?.hex || o.hex || "#808080",
            confidence: o.confidence,
        }));

    // If no outfit items detected, create a generic one with extracted color
    if (outfit.length === 0 && outfitColors.length > 0) {
        outfit.push({
            type: "Outfit",
            dominant_color: outfitColors[0].color,
            hex: outfitColors[0].hex,
        });
    }

    return {
        skin_tone: skinTone,
        body_type: rawAnalysis?.body_type || "Unknown",
        outfit,
        accessories: rawAnalysis?.accessories || [],
    };
}

// ─── Occasion Options ────────────────────────────────────────────────

export const OCCASION_OPTIONS = [
    { label: "🏋️ Gym", value: "Gym" },
    { label: "💼 Office", value: "Office" },
    { label: "☕ Casual Outing", value: "Casual outing" },
    { label: "🎉 Party", value: "Party" },
    { label: "❤️ Date", value: "Date" },
    { label: "🎓 College", value: "College" },
    { label: "💒 Wedding", value: "Wedding" },
    { label: "✈️ Travel", value: "Travel" },
    { label: "🏖️ Beach", value: "Beach" },
    { label: "🍽️ Dinner", value: "Dinner" },
    { label: "🎭 Formal Event", value: "Formal Event" },
    { label: "🎤 Interview", value: "Interview" },
];
