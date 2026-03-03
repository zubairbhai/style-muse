import { useRef, useEffect, useState } from "react";

interface Detection {
  category: string;
  confidence: number;
  bounding_box?: number[] | null;
}

interface Props {
  imageSrc: string;
  detections: Detection[];
}

const COLORS = [
  "hsl(var(--accent))",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

const ImageWithBoundingBoxes = ({ imageSrc, detections }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const maxW = 600;
      const scale = Math.min(maxW / img.width, 1);
      const w = img.width * scale;
      const h = img.height * scale;

      canvas.width = w;
      canvas.height = h;
      setDimensions({ w, h });

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, w, h);

      // Draw bounding boxes
      const boxDetections = detections.filter((d) => d.bounding_box);
      boxDetections.forEach((det, i) => {
        if (!det.bounding_box) return;
        const [x1, y1, x2, y2] = det.bounding_box;

        const sx = w / img.width;
        const sy = h / img.height;

        const bx = x1 * sx;
        const by = y1 * sy;
        const bw = (x2 - x1) * sx;
        const bh = (y2 - y1) * sy;

        const color = COLORS[i % COLORS.length];

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        // Label background
        const label = `${det.category} ${Math.round(det.confidence * 100)}%`;
        ctx.font = "bold 11px sans-serif";
        const textW = ctx.measureText(label).width;

        ctx.fillStyle = color;
        ctx.fillRect(bx, by - 16, textW + 8, 16);

        ctx.fillStyle = "#fff";
        ctx.fillText(label, bx + 4, by - 4);
      });
    };
    img.src = imageSrc;
  }, [imageSrc, detections]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-xl border border-border mx-auto block"
      style={{
        maxWidth: "100%",
        height: dimensions.h > 0 ? "auto" : "300px",
      }}
    />
  );
};

export default ImageWithBoundingBoxes;
