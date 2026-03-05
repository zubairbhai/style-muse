import { useEffect, useRef } from "react";

/**
 * Full-screen WebGL neon golden wave shader.
 * Renders behind the UI with `fixed inset-0 -z-10`.
 * GPU-accelerated — no DOM re-renders.
 */
export default function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) return;

    /* ───── vertex shader ───── */
    const vsSource = `
      attribute vec4 aVertexPosition;
      void main() {
        gl_Position = aVertexPosition;
      }
    `;

    const fsSource = `
      precision highp float;

      uniform vec2  iResolution;
      uniform float iTime;

      /* ── helpers ── */
      float hash(float n) { return fract(sin(n) * 43758.5453123); }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n = i.x + i.y * 57.0;
        return mix(
          mix(hash(n),       hash(n + 1.0),   f.x),
          mix(hash(n + 57.0), hash(n + 58.0), f.x),
          f.y
        );
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / iResolution.xy;
        float aspect = iResolution.x / iResolution.y;
        vec2 p = uv * 2.0 - 1.0;
        p.x *= aspect;

        float t = iTime * 0.22;

        /* ── deeper background for better neon contrast ── */
        vec3 bg = vec3(0.01, 0.005, 0.02);

        /* ── neon golden shining palette ── */
        vec3 neonGold = vec3(1.0, 0.85, 0.2);     /* primary neon gold */
        vec3 shiningWhite = vec3(1.0, 0.95, 0.8); /* white-hot highlights */
        vec3 amberGlow = vec3(1.0, 0.5, 0.1);    /* deep amber core */

        vec3 totalColor = vec3(0.0);

        /* ──── wave layer 1 — main shining neon wave ──── */
        float w1 = sin(p.x * 2.5 + t * 1.5) * 0.25 
                 + sin(p.x * 5.0 - t * 1.2) * 0.10;
        float d1 = abs(p.y - w1);
        
        // sharp shining peak
        float peak1 = smoothstep(0.012, 0.0, d1);
        // neon core glow
        float glow1 = exp(-d1 * 15.0) * 0.8;
        // broad ambient glow
        float amb1 = exp(-d1 * 3.0) * 0.3;
        
        totalColor += neonGold * glow1;
        totalColor += shiningWhite * peak1 * 1.2; // intense highlight
        totalColor += amberGlow * amb1 * 0.5;

        /* ──── wave layer 2 — secondary flowing wave ──── */
        float w2 = cos(p.x * 3.5 - t * 2.1) * 0.20 
                 + sin(p.x * 2.0 + t * 0.8) * 0.15;
        float d2 = abs(p.y - w2 + 0.3);
        
        float peak2 = smoothstep(0.01, 0.0, d2);
        float glow2 = exp(-d2 * 12.0) * 0.6;
        float amb2 = exp(-d2 * 4.0) * 0.2;
        
        totalColor += neonGold * glow2 * 0.8;
        totalColor += shiningWhite * peak2 * 1.0;
        totalColor += amberGlow * amb2 * 0.4;

        /* ──── wave layer 3 — soft background drift ──── */
        float w3 = sin(p.x * 1.8 + t * 0.6) * 0.35;
        float d3 = abs(p.y - w3 - 0.4);
        float glow3 = exp(-d3 * 8.0) * 0.4;
        totalColor += neonGold * glow3 * 0.3;

        /* ──── shimmering sparkle particles ──── */
        for (int i = 0; i < 16; i++) {
          float fi = float(i);
          float speed = 0.3 + hash(fi) * 0.4;
          vec2 spPos = vec2(
            sin(t * speed + fi * 1.5) * aspect * 0.9,
            cos(t * (speed * 0.8) + fi * 2.1) * 0.9
          );
          
          float spDist = length(p - spPos);
          // Twinkle effect
          float twinkle = sin(t * 5.0 + fi) * 0.5 + 0.5;
          float spGlow = smoothstep(0.025, 0.0, spDist) * (0.6 + 0.4 * twinkle);
          float spPeak = smoothstep(0.008, 0.0, spDist) * twinkle;
          
          totalColor += neonGold * spGlow * 0.6;
          totalColor += shiningWhite * spPeak * 1.5;
        }

        /* ── simple vignette ── */
        float vig = 1.0 - length(uv - 0.5) * 1.1;
        totalColor *= clamp(vig, 0.0, 1.0);

        /* output with tone mapping for 'neon' punch */
        vec3 finalColor = bg + totalColor;
        // high-exposure look for "shining"
        finalColor = 1.0 - exp(-finalColor * 1.5); 
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    /* ───── compile & link ───── */
    function compile(type: number, source: string) {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        console.warn("Shader compile error:", gl!.getShaderInfoLog(shader));
      }
      return shader;
    }

    const vertexShader = compile(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("Shader program link error:", gl.getProgramInfoLog(program));
    }

    /* ───── full-screen quad ───── */
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, "aVertexPosition");
    const resLoc = gl.getUniformLocation(program, "iResolution");
    const timeLoc = gl.getUniformLocation(program, "iTime");

    /* ───── resize handler ───── */
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl!.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener("resize", resize);
    resize();

    /* ───── render loop ───── */
    const start = performance.now();
    let animId: number;

    function render() {
      const time = (performance.now() - start) / 1000;

      gl!.clearColor(0, 0, 0, 1);
      gl!.clear(gl!.COLOR_BUFFER_BIT);

      gl!.useProgram(program);
      gl!.uniform2f(resLoc, canvas.width, canvas.height);
      gl!.uniform1f(timeLoc, time);

      gl!.bindBuffer(gl!.ARRAY_BUFFER, positionBuffer);
      gl!.vertexAttribPointer(posLoc, 2, gl!.FLOAT, false, 0, 0);
      gl!.enableVertexAttribArray(posLoc);

      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      animId = requestAnimationFrame(render);
    }
    render();

    /* ───── cleanup ───── */
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(positionBuffer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full -z-10"
      aria-hidden="true"
    />
  );
}
