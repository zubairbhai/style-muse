/**
 * Client-side dominant color extraction using canvas sampling + simple clustering.
 * No paid APIs needed — runs entirely in the browser.
 */

interface ColorResult {
  color: string;
  hex: string;
  percentage: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")
  );
}

function rgbToName(r: number, g: number, b: number): string {
  const hsl = rgbToHsl(r, g, b);
  const [h, s, l] = hsl;

  if (l < 15) return "black";
  if (l > 85 && s < 15) return "white";
  if (s < 10) return l < 50 ? "dark gray" : "light gray";

  if (h < 15 || h >= 345) return l < 40 ? "dark red" : s > 60 ? "red" : "pink";
  if (h < 35) return l < 40 ? "brown" : "orange";
  if (h < 55) return l > 70 ? "cream" : "yellow";
  if (h < 80) return l < 40 ? "olive" : "lime";
  if (h < 160) return l < 40 ? "dark green" : "green";
  if (h < 200) return l < 40 ? "teal" : "cyan";
  if (h < 260) return l < 40 ? "navy" : "blue";
  if (h < 290) return l < 40 ? "indigo" : "purple";
  if (h < 345) return l < 40 ? "burgundy" : s > 50 ? "magenta" : "mauve";
  return "red";
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function distance(a: number[], b: number[]): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  );
}

/**
 * Simple k-means clustering on RGB pixel data
 */
function kMeans(pixels: number[][], k: number, iterations = 10): number[][] {
  if (pixels.length === 0) return [];
  // Initialize centroids with evenly spaced pixels
  const step = Math.max(1, Math.floor(pixels.length / k));
  let centroids = Array.from({ length: k }, (_, i) => [
    ...pixels[Math.min(i * step, pixels.length - 1)],
  ]);

  for (let iter = 0; iter < iterations; iter++) {
    const clusters: number[][][] = Array.from({ length: k }, () => []);
    for (const px of pixels) {
      let minDist = Infinity;
      let minIdx = 0;
      for (let j = 0; j < k; j++) {
        const d = distance(px, centroids[j]);
        if (d < minDist) {
          minDist = d;
          minIdx = j;
        }
      }
      clusters[minIdx].push(px);
    }

    centroids = clusters.map((cluster, i) => {
      if (cluster.length === 0) return centroids[i];
      const avg = [0, 0, 0];
      for (const px of cluster) {
        avg[0] += px[0];
        avg[1] += px[1];
        avg[2] += px[2];
      }
      return avg.map((v) => Math.round(v / cluster.length));
    });
  }

  return centroids;
}

export async function extractDominantColors(
  imageSrc: string,
  numColors = 5
): Promise<ColorResult[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 100; // sample at low res
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve([]);
        return;
      }

      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      const pixels: number[][] = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2],
          a = data[i + 3];
        if (a < 128) continue; // skip transparent
        pixels.push([r, g, b]);
      }

      const centroids = kMeans(pixels, numColors);

      // Count how many pixels belong to each centroid
      const counts = new Array(centroids.length).fill(0);
      for (const px of pixels) {
        let minDist = Infinity;
        let minIdx = 0;
        for (let j = 0; j < centroids.length; j++) {
          const d = distance(px, centroids[j]);
          if (d < minDist) {
            minDist = d;
            minIdx = j;
          }
        }
        counts[minIdx]++;
      }

      const total = pixels.length;
      const results: ColorResult[] = centroids
        .map((c, i) => ({
          color: rgbToName(c[0], c[1], c[2]),
          hex: rgbToHex(c[0], c[1], c[2]),
          percentage: (counts[i] / total) * 100,
        }))
        .sort((a, b) => b.percentage - a.percentage);

      resolve(results);
    };
    img.onerror = () => resolve([]);
    img.src = imageSrc;
  });
}
