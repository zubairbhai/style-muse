# WORKFLOW.md — StyleSense / Style Muse Complete Application Workflow

> **Last Updated:** March 2026  
> **Purpose:** This document describes the complete workflow of every feature in the StyleSense application, from user action to final result. It is written for developers who are seeing this codebase for the first time.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Feature-by-Feature Workflow](#3-feature-by-feature-workflow)
   - 3.1 [AI Stylist Chat](#31-ai-stylist-chat)
   - 3.2 [Image Analysis Pipeline](#32-image-analysis-pipeline)
   - 3.3 [Product Search](#33-product-search)
   - 3.4 [Outfit Generator](#34-outfit-generator)
   - 3.5 [Outfit Analyzer](#35-outfit-analyzer)
   - 3.6 [Trend Explorer](#36-trend-explorer)
   - 3.7 [Style Quiz](#37-style-quiz)
   - 3.8 [Wardrobe Manager](#38-wardrobe-manager)
   - 3.9 [Authentication & Profile](#39-authentication--profile)
   - 3.10 [Lookbook](#310-lookbook)
4. [AI Features Workflow](#4-ai-features-workflow-detailed)
5. [Database Workflow](#5-database-workflow)
6. [API Integrations](#6-api-integrations)
7. [Error Handling](#7-error-handling)
8. [Environment Variables](#8-environment-variables)
9. [Future Improvements](#9-future-improvements)

---

## 1. Project Overview

### What This Project Does

**StyleSense** (also called **Style Muse**) is an AI-powered fashion assistant web application. It helps users:

- Upload outfit photos and receive detailed AI analysis (skin tone, body type, garment detection, color palette)
- Get personalized outfit recommendations for specific occasions
- Search for real purchasable products matching recommendations
- Generate complete outfit suggestions from scratch (with AI-generated mood board images)
- Analyze and rate outfit combinations
- Discover trending fashion articles and AI-generated trend forecasts
- Take a style quiz to build a style profile
- Manage a digital wardrobe of clothing items

### Core Idea

The product combines **client-side computer vision** (Canvas API + K-Means color clustering) with **server-side AI models** (Google Gemini, OpenRouter) to deliver a comprehensive fashion advisory experience — from image analysis to product purchase.

### Main Technologies

| Layer | Technology |
|-------|-----------|
| **Frontend Framework** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS + shadcn/ui (Radix primitives) |
| **Animations** | Framer Motion |
| **Routing** | React Router DOM v6 |
| **State Management** | React useState/useEffect + React Query (TanStack) |
| **Backend/BaaS** | Supabase (PostgreSQL + Auth + Edge Functions + Storage) |
| **AI Models** | Google Gemini 3 Flash (via AI Gateway), Gemini 2.5 Flash Image, OpenRouter (free models) |
| **ML Models (Server)** | Hugging Face (DETR ResNet-50, ViT, SegFormer B2 Clothes) |
| **Product Search API** | RapidAPI Real-Time Product Search |
| **Fashion Articles** | Firecrawl Search API |
| **Image Analysis (Client)** | Canvas API + K-Means Clustering (zero API cost) |
| **Auth Background** | WebGL Neon Golden Wave Shader (GPU accelerated) |
| **Markdown Rendering** | react-markdown |
| **Theme** | next-themes (dark mode default) |

---

## 2. System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     USER (Browser)                        │
│                                                          │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────┐    │
│  │ React App  │  │ Canvas API  │  │  LocalStorage  │    │
│  │ (Vite)     │  │ (K-Means)   │  │  (Quiz/Look-   │    │
│  │            │  │             │  │   book data)   │    │
│  └──────┬─────┘  └──────┬──────┘  └──────┬─────────┘    │
│         │               │                │              │
│         ▼               ▼                ▼              │
│  ┌──────────────────────────────────────────────────┐    │
│  │            AUTHENTICATION GATE (AuthGate)        │    │
│  │        (Redirects unauthenticated → /auth)       │    │
│  └──────────────────────┬───────────────────────────┘    │
│                         │                                │
└─────────────────────────┼────────────────────────────────┘
          │               │
          │  Client-side   │  100% free image analysis
          │  analysis      │  (no API calls)
          │               │
          ▼               ▼
┌──────────────────────────────────────────────────────────┐
│              SUPABASE (Backend-as-a-Service)              │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Auth       │  │  PostgreSQL  │  │   Storage     │  │
│  │  (Email/     │  │  (profiles,  │  │  (outfit-     │  │
│  │   Password)  │  │   wardrobe,  │  │   uploads)    │  │
│  │              │  │   outfits)   │  │               │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │            EDGE FUNCTIONS (Deno Runtime)          │    │
│  │                                                   │    │
│  │  ┌──────────────┐  ┌──────────────────────┐      │    │
│  │  │ stylist-chat  │  │ generate-outfit       │      │    │
│  │  │ (Gemini 3     │  │ (OpenRouter + product │      │    │
│  │  │  Flash)       │  │  search fallback)     │      │    │
│  │  └──────────────┘  └──────────────────────┘      │    │
│  │  ┌──────────────┐  ┌──────────────────────┐      │    │
│  │  │ analyze-     │  │ stylist-recommend     │      │    │
│  │  │ clothing     │  │ (OpenRouter Gemini    │      │    │
│  │  │ (HuggingFace)│  │  2.0 Flash, streamed) │      │    │
│  │  └──────────────┘  └──────────────────────┘      │    │
│  │  ┌──────────────┐  ┌──────────────────────┐      │    │
│  │  │ generate-    │  │ fetch-fashion-        │      │    │
│  │  │ trends       │  │ articles              │      │    │
│  │  │ (Gemini 3    │  │ (Firecrawl)           │      │    │
│  │  │  + Image)    │  │                       │      │    │
│  │  └──────────────┘  └──────────────────────┘      │    │
│  │  ┌──────────────┐  ┌──────────────────────┐      │    │
│  │  │ analyze-     │  │ search-products       │      │    │
│  │  │ outfit       │  │ (RapidAPI)            │      │    │
│  │  │ (Gemini 3    │  │                       │      │    │
│  │  │  Flash)      │  │                       │      │    │
│  │  └──────────────┘  └──────────────────────┘      │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
          │               │               │
          ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│  AI Gateway  │ │  OpenRouter  │ │ RapidAPI Product │
│              │ │  API         │ │ Search           │
│  (Gemini 3   │ │  (Free tier  │ │                  │
│   Flash,     │ │   models)    │ │                  │
│   Image Gen) │ │              │ │                  │
└──────────────┘ └──────────────┘ └──────────────────┘
                                  ┌──────────────────┐
                                  │  Hugging Face    │
                                  │  Inference API   │
                                  │  (DETR, ViT,     │
                                  │   SegFormer)     │
                                  └──────────────────┘
                                  ┌──────────────────┐
                                  │  Firecrawl API   │
                                  │  (Web Scraping)  │
                                  └──────────────────┘
```

### Request Flow Pattern

Most features follow this pattern:

```
User Action (click/type/upload)
       ↓
React Component (src/pages/*.tsx)
       ↓
Supabase Client SDK  OR  direct fetch()
       ↓
Supabase Edge Function (supabase/functions/*)
       ↓
External API (AI Gateway/OpenRouter/RapidAPI/HuggingFace/Firecrawl)
       ↓
JSON Response (or SSE Stream)
       ↓
React State Update (useState/setMessages)
       ↓
UI Re-render (animated via Framer Motion)
```

---

## 3. Feature-by-Feature Workflow

---

### 3.1 AI Stylist Chat

#### Purpose
The core chatting feature. Users can type fashion questions directly and receive streamed AI responses. This is the text-only chat path — no image upload required.

#### Source

| Layer | File | Description |
|-------|------|-------------|
| Frontend | `src/pages/AIStylistChat.tsx` | Main chat UI component |
| Edge Function | `supabase/functions/stylist-chat/index.ts` | Proxies messages to Gemini AI |
| AI Model | `google/gemini-3-flash-preview`  | Generates fashion advice |
| Storage | `localStorage` key: `stylesense-profile` | Persists style quiz results |

#### Workflow

```
1. User types a message (e.g., "What should I wear for a gym workout?")
       ↓
2. User presses Enter or clicks Send button
       ↓
3. AIStylistChat.send() is called
       ↓
4. User message is added to messages[] state
       ↓
5. sendTextChat() is called — no image detected
       ↓
6. Frontend builds chat messages array:
   - Filters out system-ui messages, product prompts
   - Loads style profile from localStorage (if exists from Style Quiz)
       ↓
7. POST request to CHAT_URL:
   https://<supabase-project>.supabase.co/functions/v1/stylist-chat
   Headers: Authorization (Supabase anon key)
   Body: { messages: [...], styleProfile: {...} | null }
       ↓
8. Edge Function (stylist-chat/index.ts):
   - Reads AI_API_KEY from Deno.env
   - Builds system prompt with "StyleSense" persona
   - If styleProfile exists, appends user preferences to system prompt
   - Calls AI Gateway: https://ai.gateway.example.dev/v1/chat/completions
     Model: google/gemini-3-flash-preview
     stream: true
       ↓
9. SSE stream is returned to frontend
       ↓
10. Frontend reads stream via ReadableStream reader:
    - Decodes chunks with TextDecoder
    - Parses SSE "data: {...}" lines
    - Extracts content from: parsed.choices[0].delta.content
    - Calls upsertAssistant(content) to append to last assistant message
       ↓
11. Message bubbles render in real-time via ReactMarkdown
       ↓
12. When stream ends ([DONE]), isLoading is set to false
```

#### Files Involved
- `src/pages/AIStylistChat.tsx` — Lines 520-591 (`sendTextChat`)
- `supabase/functions/stylist-chat/index.ts` — Full file (81 lines)
- `src/integrations/supabase/client.ts` — Supabase client setup

#### APIs Used
| API | Purpose | Endpoint |
|-----|---------|----------|
| AI Gateway | AI chat completion (Gemini 3 Flash) | `https://ai.gateway.example.dev/v1/chat/completions` |

#### Data Flow
```
Frontend (messages[]) → POST /stylist-chat → AI Gateway → Gemini 3 Flash
→ SSE Stream → Frontend parses chunks → upsertAssistant() → React re-render
```

---

### 3.2 Image Analysis Pipeline

#### Purpose
When a user uploads an outfit photo, the app performs a complete multi-zone analysis **entirely client-side** using the Canvas API and K-Means color clustering. This detects skin tone, body type, garment types, colors, fabric estimates, accessories, and more — all without any API calls (100% free and unlimited).

#### Source

| Layer | File | Description |
|-------|------|-------------|
| Frontend | `src/pages/AIStylistChat.tsx` | Upload UI + analysis trigger |
| Client Analysis | `src/lib/imageAnalysis.ts` | Full client-side analysis engine (822 lines) |
| Color Extraction | `src/lib/colorExtraction.ts` | K-Means dominant color extraction |
| Storage | Supabase Storage bucket: `outfit-uploads` | Uploaded image files |
| Edge Function | `supabase/functions/analyze-clothing/index.ts` | Server-side ML analysis (HuggingFace) — alternative path |

#### Workflow

```
1. User clicks the image upload button (camera icon)
       ↓
2. handleImageSelect() fires:
   - Reads file as DataURL (base64 for client-side canvas)
   - Sets pendingFile and pendingImage state
   - Shows preview thumbnail
       ↓
3. User presses Send (or Enter)
       ↓
4. send() is called:
   - setAnalysisPhase("uploading")
   - Calls uploadImage(file):
     → supabase.storage.from("outfit-uploads").upload(path, file)
     → Returns public URL from Supabase Storage
       ↓
5. User message is added to messages[] with imageUrl
       ↓
6. runAnalysisPipeline(imageUrl, imageDataUrl) is called:
   - setAnalysisPhase("analyzing")
   - Shows "🔍 Analyzing your outfit" message
       ↓
7. runFullClientAnalysis(imageDataUrl) — in imageAnalysis.ts:

   Step 7a: Load image onto Canvas
   - Creates offscreen <canvas> element
   - Draws image at native resolution
   - Gets 2D rendering context

   Step 7b: Extract Skin Tone
   - Samples pixels from head region (top 15% of image, center 40%)
   - Filters for skin-like pixels: r > 60, g > 40, b > 20, r > b
   - Calculates average RGB of skin pixels
   - Classifies into: Fair / Medium / Wheatish / Brown / Dark
   - Returns hex color code

   Step 7c: Multi-Zone Color Extraction
   - Defines 8 image zones:
     ┌─────────────────────┐
     │  head_accessories    │  0-12% height
     │  upper_body          │  12-35% height
     │  mid_body            │  30-55% height
     │  waist_accessories   │  45-55% height
     │  lower_body          │  50-80% height
     │  footwear            │  80-100% height
     │  left_hand           │  35-60% height, 0-20% width
     │  right_hand          │  35-60% height, 80-100% width
     └─────────────────────┘
   - For each zone:
     → Extracts pixel data via ctx.getImageData()
     → Runs K-Means clustering (k=4) on RGB pixels
     → Returns sorted ZoneColor[] with color name, hex, percentage

   Step 7d: Garment Inference
   - For main clothing zones (upper_body, mid_body, lower_body, footwear):
     → Filters out skin-like and background colors
     → Calls guessGarmentFromColor() which maps zone + color → garment type
     → Example: upper_body + black → "Structured Blazer / Coat"
     → Also infers: fit, material_guess, description

   Step 7e: Accessory Detection
   - Analyzes waist, hand, and head zones for accessory signals
   - Maps color patterns to: Belt, Watch, Bag, Headwear
   - Falls back to "Likely: Watch, Belt" if outfit seems complete

   Step 7f: Body Type from Aspect Ratio
   - width/height < 0.4 → "Tall / Slim"
   - width/height < 0.55 → "Athletic / Proportional"
   - width/height < 0.7 → "Average Build"
   - width/height >= 0.7 → "Broad / Stocky"

   Step 7g: Style Classification
   - classifyOutfitStyle() analyzes items for:
     → Structured pieces (blazer, coat) → formal
     → Casual pieces (t-shirt, sneaker) → casual
     → Edgy pieces (combat, leather) → edgy
     → Patterns → artistic
   - Determines: outfitType, styleVibe, colorStrategy, formality (1-10),
     boldness (1-10), layering level, style tags

   Step 7h: Season Detection
   - Checks garment types: coat/blazer/boots → "Fall / Winter"
   - Sandal/tank/shorts → "Spring / Summer"
   - Falls back to current month if ambiguous

   Step 7i: Color Palette Assembly
   - Separates colors into: primary, secondary, neutrals
   - Determines color_temperature (Warm/Cool/Mixed)
   - Determines contrast_level (High/Medium/Low)
       ↓
8. Returns StructuredAnalysis object with all data
       ↓
9. setAnalysisPhase("results")
   - Rich analysis card replaces loading message
   - AnalysisCard component shows visual data:
     → Skin tone swatch, body type badge
     → Outfit items with color dots
     → Accessories with tags
       ↓
10. formatAnalysisResults() generates markdown summary table
       ↓
11. After 500ms delay:
    setAnalysisPhase("asking-intent")
    - IntentCard component appears
    - User selects occasion (12 preset options + custom)
    - User chooses: "Enhance Current" or "New Outfit"
       ↓
12. handleIntentSubmit() → sendRecommendation(analysis, intent)
    [See Section 3.1 + AI Recommendation flow below]
```

#### Files Involved
- `src/pages/AIStylistChat.tsx` — Lines 83-141 (image upload + analysis pipeline)
- `src/lib/imageAnalysis.ts` — Complete 822-line client-side engine
- `src/lib/colorExtraction.ts` — 178-line K-Means extraction utility

#### APIs Used
| API | Purpose | Endpoint |
|-----|---------|----------|
| Supabase Storage | Store uploaded images | `supabase.storage.from("outfit-uploads").upload()` |
| **None for analysis!** | Client-side Canvas + K-Means | Runs entirely in the browser |

#### Data Flow
```
Image File → FileReader (DataURL) → Canvas → getImageData() → K-Means Clustering
→ Zone Color Extraction → Garment Inference → Style Classification
→ StructuredAnalysis object → AnalysisCard UI + IntentCard UI
```

---

### 3.3 Product Search

#### Purpose
After the AI generates outfit recommendations, the user is asked "Would you like me to find real products you can buy?" If they click "Yes", the app extracts search queries from the recommendation text and searches for purchasable products via the RapidAPI Product Search API. If RapidAPI is unavailable, it falls back to direct links to Amazon, Flipkart, and Myntra.

#### Source

| Layer | File | Description |
|-------|------|-------------|
| Frontend | `src/pages/AIStylistChat.tsx` | Product prompt UI, extraction, rendering |
| Edge Function | `supabase/functions/generate-outfit/index.ts` | Proxies product search to RapidAPI |
| Fallback Edge | `supabase/functions/search-products/index.ts` | Standalone product search (not used by default) |
| External API | RapidAPI Real-Time Product Search | Searches for real products |

#### Workflow

```
1. After sendRecommendation() completes with a successful response:
   - setLastRecommendation(assistantSoFar) stores the full text
   - After 800ms, a ProductPromptCard appears:
     "🛍️ Would you like me to find real products you can buy for this outfit?"
     [Yes, show me products]  [No, just styling advice]
       ↓
2. User clicks "Yes, show me products"
       ↓
3. handleProductYes() is called:
   - Adds user message: "✅ Yes, show me products!"
   - Shows loading spinner with productsLoading flag
       ↓
4. Extract search queries from recommendation text:
   extractSearchQueries(recommendationText):
   
   Strategy 1: Extract from **bold text** (e.g., "**Navy Slim-Fit Blazer**")
   - Regex: /\*\*([^*]+)\*\*/g
   - Filter: must contain a clothing keyword
   
   Strategy 2: Extract from bullet lists (- item, • item, 1. item)
   - Regex: /(?:^|\n)\s*(?:[-•*]|\d+[.)]) ?(.+?)(?:\n|$)/g
   
   Strategy 3: Extract from "Label: item" patterns
   - Regex: /(?:top|bottom|shoes|...)[:\s—-]+(.+?)(?:\n|$)/gi
   
   Strategy 4: Scan for clothing keyword phrases in sentences
   
   Strategy 5 (last resort): Concatenate found clothing keywords + "fashion"
   
   Returns up to 5 unique query strings
       ↓
5. For each query (up to 3):
   fetchProducts(query) is called:
   
   5a. Check productCache (Map<string, Product[]>)
       - If cached, return immediately (avoid duplicate API calls)
   
   5b. POST request to PRODUCTS_URL:
       https://<supabase>.supabase.co/functions/v1/generate-outfit
       Body: { action: "search-products", query, limit: 5 }
       ↓
6. Edge Function handleProductSearch():
   
   6a. Clean query (remove numbered prefixes, "The Top:" patterns)
   
   6b. Try RapidAPI (if RAPIDAPI_KEY exists):
       GET https://real-time-product-search.p.rapidapi.com/search
       Params: q, country=in, language=en, limit, sort_by=BEST_MATCH
       
       Parse response:
       - product_title → title
       - offer.price / product_price → price
       - product_photos[0] → image
       - product_page_url → link
       
       If products found → return them
   
   6c. Fallback (RapidAPI fails or no key):
       Generate direct shopping links:
       - Amazon:   https://www.amazon.in/s?k={query}
       - Flipkart: https://www.flipkart.com/search?q={query}
       - Myntra:   https://www.myntra.com/{query}
       ↓
7. Frontend deduplicates products by link
       ↓
8. Frontend sanitizes Google Shopping links (legacy fix):
   - If link contains "google.com/search" → replace with Amazon link
   - Extracts original query from URL param ?q=
       ↓
9. ProductGrid component renders product cards:
   - If product has image → shows image with hover zoom
   - If fallback product (no image) → shows shopping site emoji (🛒/🏪/👗)
   - Title, price, "Buy Now" or "Search" label
   - Card is an <a> tag with target="_blank"
       ↓
10. User clicks a product card → opens in new browser tab
```

#### Files Involved
- `src/pages/AIStylistChat.tsx` — Lines 277-500 (product search flow), Lines 1091-1175 (ProductGrid component)
- `supabase/functions/generate-outfit/index.ts` — Lines 23-131 (handleProductSearch)

#### APIs Used
| API | Purpose | Endpoint |
|-----|---------|----------|
| RapidAPI Real-Time Product Search | Search for real products | `https://real-time-product-search.p.rapidapi.com/search` |
| Supabase Edge Function | Proxy + API key security | `/functions/v1/generate-outfit` |

#### Data Flow
```
AI Recommendation Text → extractSearchQueries() → ["Navy Blazer", "White Shirt", ...]
→ fetchProducts(query) → POST /generate-outfit (action: "search-products")
→ RapidAPI (or fallback links) → Product[] → ProductGrid UI → New Tab on click
```

---

### 3.4 Outfit Generator

#### Purpose
Users select parameters (gender, occasion, season, color palette, style vibe) and the AI generates a complete outfit recommendation with optional mood board image.

#### Source

| Layer | File | Description |
|-------|------|-------------|
| Frontend | `src/pages/OutfitGenerator.tsx` | Parameter selection + result display |
| Edge Function | `supabase/functions/generate-outfit/index.ts` | Text generation + image generation |
| AI Models | OpenRouter (text) + Gemini 2.5 Flash Image (image) | Content generation |

#### Workflow

```
1. User visits /generator page
       ↓
2. User selects:
   - Gender: Male / Female
   - Occasion: Work / Date Night / Casual / Party / Travel / Wedding
   - Season: Spring / Summer / Autumn / Winter
   - (Optional) Color Palette: Neutrals / Pastels / Bold / Earth Tones / etc.
   - (Optional) Style Vibe: Minimalist / Streetwear / Bohemian / Classic / etc.
       ↓
3. User clicks "Generate Outfit"
       ↓
4. generate() calls:
   supabase.functions.invoke("generate-outfit", {
     body: { occasion, season, palette, vibe, gender }
   })
       ↓
5. Edge Function handleOutfitGeneration():
   
   5a. Text Generation:
       → OpenRouter API: https://openrouter.ai/api/v1/chat/completions
       → Model: arcee-ai/trinity-large-preview:free
       → System prompt: "You are StyleSense, an expert AI fashion stylist"
       → User prompt: includes occasion, season, palette, vibe, gender
       → Non-streamed response
   
   5b. Image Generation (optional):
       → AI Gateway: https://ai.gateway.example.dev/v1/chat/completions
       → Model: google/gemini-2.5-flash-image
       → Prompt: "Fashion flat-lay mood board for a {vibe} {gender} {occasion} outfit"
       → modalities: ["image", "text"]
       → Returns image URL (if successful)
       ↓
6. Response: { text: "...", imageUrl: "..." }
       ↓
7. Frontend renders:
   - Mood board image (if generated)
   - Markdown outfit description (via ReactMarkdown)
   - "Save to Lookbook" button
       ↓
8. If user clicks "Save to Lookbook":
   - Saves outfit data to localStorage key: "stylesense-lookbook"
   - Includes: text, imageUrl, occasion, season, palette, vibe, savedAt timestamp
```

#### Files Involved
- `src/pages/OutfitGenerator.tsx` — Full file (174 lines)
- `supabase/functions/generate-outfit/index.ts` — Lines 133-218 (handleOutfitGeneration)

#### APIs Used
| API | Purpose | Endpoint |
|-----|---------|----------|
| OpenRouter | Text generation (free model) | `https://openrouter.ai/api/v1/chat/completions` |
| AI Gateway | Image generation (Gemini 2.5) | `https://ai.gateway.example.dev/v1/chat/completions` |

---

### 3.5 Outfit Analyzer

#### Purpose
Users upload 1-4 outfit photos and get AI-powered styling feedback including rating, what works well, areas for improvement, combination suggestions, and styling tips.

#### Source

| Layer | File | Description |
|-------|------|-------------|
| Frontend | `src/pages/OutfitAnalyzer.tsx` | Image upload + analysis display |
| Edge Function | `supabase/functions/analyze-outfit/index.ts` | Vision analysis via Gemini |
| Edge Function | `supabase/functions/analyze-clothing/index.ts` | ML-based clothing detection (HuggingFace) |
| Storage | Supabase Storage bucket: `outfit-uploads` | Stores uploaded images |

#### Workflow

```
1. User visits /analyzer page
       ↓
2. User uploads 1-4 images (drag & drop or click)
       ↓
3. handleFiles() → reads files as DataURLs for preview
       ↓
4. User optionally selects:
   - Occasion (Work / Date Night / Casual / Party / Travel / Wedding)
   - Season (Spring / Summer / Autumn / Winter)
   - Context (Rate my outfit / Suggest combinations / etc.)
       ↓
5. User clicks "Detect Clothing" button:
   detectClothing() → for each image:
   - Uploads to Supabase Storage
   - Calls analyze-clothing edge function with image URL
   - Edge function runs 3 HuggingFace models in parallel:
     a) DETR ResNet-50: object detection (bounding boxes)
     b) ViT Base: image classification (style labels)
     c) SegFormer B2 Clothes: clothing segmentation
   - Returns detected clothing items, body attributes, accessories
       ↓
6. User clicks "Analyze Style" button:
   analyzeStyle() → calls analyze-outfit edge function
   - Sends all image URLs + occasion/season/context
   - Edge function calls Gemini 3 Flash (vision-capable) with images
   - Returns detailed markdown analysis:
     → Overall Assessment (rating 1-10)
     → What Works Well
     → Areas for Improvement
     → Combination Suggestions
     → Styling Tips
     → Alternative Pieces
       ↓
7. Frontend renders analysis via ReactMarkdown
```

#### Files Involved
- `src/pages/OutfitAnalyzer.tsx` — Full file (289 lines)
- `supabase/functions/analyze-outfit/index.ts` — Full file (106 lines)
- `supabase/functions/analyze-clothing/index.ts` — Full file (429 lines)

#### APIs Used
| API | Purpose | Endpoint |
|-----|---------|----------|
| HuggingFace DETR | Object detection | `https://api-inference.huggingface.co/models/facebook/detr-resnet-50` |
| HuggingFace ViT | Image classification | `https://api-inference.huggingface.co/models/google/vit-base-patch16-224` |
| HuggingFace SegFormer | Clothing segmentation | `https://api-inference.huggingface.co/models/mattmdjaga/segformer_b2_clothes` |
| AI Gateway | Vision analysis (Gemini 3) | `https://ai.gateway.lovable.dev/v1/chat/completions` |

---

### 3.6 Trend Explorer

#### Purpose
Discover trending fashion content through two modes: AI-generated trend forecasts with images, and curated trending articles from the web.

#### Source

| Layer | File | Description |
|-------|------|-------------|
| Frontend | `src/pages/TrendExplorer.tsx` | Category tabs + trend/article display |
| Edge Function | `supabase/functions/generate-trends/index.ts` | AI trend generation |
| Edge Function | `supabase/functions/fetch-fashion-articles/index.ts` | Web article scraping |

#### Workflow

**Mode A: Trending Articles (Firecrawl)**
```
1. User selects category (Seasonal / Street Style / Workwear / Evening)
       ↓
2. fetchArticles(category):
   supabase.functions.invoke("fetch-fashion-articles", { body: { category } })
       ↓
3. Edge function:
   - Maps category → search query (e.g., "Seasonal" → "trending seasonal fashion 2026")
   - Calls Firecrawl API: POST https://api.firecrawl.dev/v1/search
   - Returns up to 8 articles with: title, description, url, source
       ↓
4. Articles render as clickable cards with source attribution
```

**Mode B: AI Trends (Gemini + Image Generation)**
```
1. User switches to "AI Trends" tab
       ↓
2. fetchTrends(category):
   supabase.functions.invoke("generate-trends", { body: { category } })
       ↓
3. Edge function:
   Step 3a: Generate 4 trend titles + descriptions
   - Gemini 3 Flash: returns JSON array of { title, description }
   
   Step 3b: Generate image for each trend
   - Gemini 2.5 Flash Image: fashion editorial photo generation
   - Each trend gets a unique AI-generated image
       ↓
4. Trends render as cards with AI image + description
```

#### Files Involved
- `src/pages/TrendExplorer.tsx` — Full file (209 lines)
- `supabase/functions/generate-trends/index.ts` — Full file (96 lines)
- `supabase/functions/fetch-fashion-articles/index.ts` — Full file (80 lines)

#### APIs Used
| API | Purpose | Endpoint |
|-----|---------|----------|
| Firecrawl | Web search + scraping | `https://api.firecrawl.dev/v1/search` |
| AI Gateway | Trend text generation | `google/gemini-3-flash-preview` |
| AI Gateway | Trend image generation | `google/gemini-2.5-flash-image` |

---

### 3.7 Style Quiz

#### Purpose
A multi-step quiz that builds a style profile (favorite styles, colors, fit preferences, occasions). The results are saved to `localStorage` and used by the AI Stylist Chat to personalize recommendations.

#### Source

| Layer | File | Description |
|-------|------|-------------|
| Frontend | `src/pages/StyleQuiz.tsx` | Multi-step quiz UI |
| Storage | `localStorage` key: `stylesense-profile` | Persisted quiz results |

#### Workflow

```
1. User visits /quiz page
       ↓
2. Quiz progresses through 4 steps:
   Step 1: "What styles do you love?" → Select multiple (Casual, Smart Casual,
           Formal, Streetwear, Bohemian, Minimalist, Vintage, Sporty, Romantic, Edgy)
   Step 2: "Favorite colors" → Select multiple (Black, White, Navy, Grey,
           Beige, Brown, Pastels, Bold Colors, Earth Tones, Jewel Tones)
   Step 3: "Preferred fit" → Select multiple (Relaxed, Regular, Slim,
           Oversized, Tailored, Athletic)
   Step 4: "Main occasions" → Select multiple (Work, Casual, Date Night,
           Party, Travel, Workout, Wedding, Social Events)
       ↓
3. toggleOption() handles multi-select (adds/removes from array)
       ↓
4. handleNext() advances steps:
   - Steps 1-3: moves to next step
   - Step 4 (final): saves to localStorage:
     {
       styles: ["Casual", "Minimalist"],
       colors: ["Black", "Navy"],
       fit: ["Slim", "Tailored"],
       occasions: ["Work", "Date Night"]
     }
   - Navigates to /chat
       ↓
5. In AIStylistChat.sendTextChat():
   - Reads localStorage "stylesense-profile"
   - Sends as styleProfile in the API request
   - Edge function appends these preferences to the system prompt
```

#### Files Involved
- `src/pages/StyleQuiz.tsx` — Full file (234 lines)
- `src/pages/AIStylistChat.tsx` — Lines 536-548 (reads styleProfile)
- `supabase/functions/stylist-chat/index.ts` — Lines 26-33 (appends profile to prompt)

#### APIs Used
None — fully client-side.

---

### 3.8 Wardrobe Manager

#### Purpose
A digital wardrobe where authenticated users can add, view, search, filter, favorite, and delete clothing items. Items are stored in the Supabase database with optional image uploads.

#### Source

| Layer | File | Description |
|-------|------|-------------|
| Frontend | `src/pages/Wardrobe.tsx` | CRUD UI for wardrobe items |
| Database | Supabase table: `wardrobe_items` | Persistent storage |
| Storage | Supabase Storage bucket: `outfit-uploads` | Item photos |
| Auth | `src/hooks/useAuth.tsx` | Requires authentication |

#### Workflow

```
1. User visits /wardrobe (redirects to /auth if not logged in)
       ↓
2. fetchItems() loads all wardrobe items:
   supabase.from("wardrobe_items")
     .select("*")
     .eq("user_id", user.id)
     .order("created_at", { ascending: false })
       ↓
3. Items display as grid cards with:
   - Image (or placeholder icon)
   - Name, category, color, brand
   - Season tag
   - Favorite heart toggle
   - Delete button
       ↓
4. User can filter by:
   - Search text (name, brand, color)
   - Favorites only toggle
       ↓
5. "Add Item" form (bottom of page):
   - Name (required)
   - Category select: Tops / Bottoms / Dresses / Outerwear / Shoes / Accessories / Bags / Activewear
   - Color input
   - Brand input
   - Season select: Spring / Summer / Fall / Winter / All Season
   - Image upload (optional)
       ↓
6. addItem():
   - If image: uploads to Supabase Storage → gets public URL
   - Inserts row into wardrobe_items table
   - Refreshes item list
       ↓
7. toggleFavorite(): updates favorite boolean in database
       ↓
8. deleteItem(): deletes row from wardrobe_items table
```

#### Files Involved
- `src/pages/Wardrobe.tsx` — Full file (306 lines)
- `src/hooks/useAuth.tsx` — Auth context provider

#### Database Table: `wardrobe_items`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| name | text | Item name |
| category | text | Clothing category |
| color | text | Color description |
| brand | text | Brand name |
| season | text | Season suitability |
| image_url | text | Storage URL |
| tags | text[] | Custom tags |
| favorite | boolean | Favorited flag |
| notes | text | User notes |
| created_at | timestamp | Creation date |
| updated_at | timestamp | Last update |

---

#### Purpose
Email/password authentication via Supabase Auth. Authentication is implemented as a **Global Gate** — users must be signed in to access any part of the application. The login page serves as a high-end entry point with a WebGL animated background.

#### Source

| Layer | File | Description |
|-------|------|-------------|
| **Auth Gate** | `src/components/AuthGate.tsx` | Middleware component protecting all routes |
| Frontend | `src/pages/Auth.tsx` | Login/signup form + WebGL Shader |
| Background | `src/components/ui/shader-background.tsx` | WebGL Neon Golden Wave Shader |
| Auth Hook | `src/hooks/useAuth.tsx` | Auth context (user, session, signOut) |
| Database | Supabase table: `profiles` | User profile data |

#### Workflow

**The Auth Gate (Security Layer):**
```
1. User attempts to visit any route (e.g., /, /wardrobe, /generator)
2. AuthGate.tsx checks current user session via useAuth()
3. If no session is found:
   - Redirects to /auth
   - Navbar is hidden for a clean landing experience
4. If session exists:
   - Renders the requested page
   - Navbar becomes visible
```

**Sign Up:**
```
1. User visits /auth → sign up mode
2. Page renders the WebGL Golden Wave background behind a dark glass card
3. User enters: display name, email, password
4. supabase.auth.signUp({ email, password, options: { data: { display_name } } })
5. Email verification sent
6. After verification → auto-login → redirect to Home (/)
```

**Sign In:**
```
1. User visits /auth → login mode
2. supabase.auth.signInWithPassword({ email, password })
3. Success → redirect to Home (/)
```

**Profile Management:**
```
1. User visits /profile (redirects to /auth if not logged in)
2. loadProfile() → supabase.from("profiles").select("*").eq("user_id", user.id)
3. Shows: display name, bio, premium badge (if applicable)
4. saveProfile() → supabase.from("profiles").update({ display_name, bio })
5. Sign out → supabase.auth.signOut()
```

#### Database Table: `profiles`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| display_name | text | User's display name |
| bio | text | Short bio |
| avatar_url | text | Profile picture URL |
| is_premium | boolean | Premium membership flag |
| style_preferences | JSON | Style quiz results |
| created_at | timestamp | Account creation |
| updated_at | timestamp | Last profile update |

---

### 3.10 Lookbook

#### Purpose
View saved outfit recommendations from the Outfit Generator. Data is stored in localStorage.

#### Source

| Layer | File | Description |
|-------|------|-------------|
| Frontend | `src/pages/Lookbook.tsx` | Saved outfits display |
| Storage | `localStorage` key: `stylesense-lookbook` | Saved outfits |

#### Workflow

```
1. User visits /lookbook
2. Reads JSON array from localStorage "stylesense-lookbook"
3. Displays saved outfits as cards:
   - Mood board image (if available)
   - Outfit description (markdown)
   - Occasion, season, palette, vibe labels
   - Saved date
4. User can delete individual lookbook entries
```

---

## 4. AI Features Workflow (Detailed)

### Image Upload Pipeline

```
User selects image file
       ↓
FileReader.readAsDataURL() → base64 DataURL (for Canvas)
       ↓
supabase.storage.upload() → public URL (for sharing/display)
       ↓
Both URLs passed to runAnalysisPipeline()
```

### AI Recommendation Logic (Post-Analysis)

After image analysis is complete and user selects an occasion:

```
1. sendRecommendation(analysis, intent):
   
2. Builds structured prompt with ALL analysis data:
   "You are a professional AI fashion stylist. Based on:
    - Skin Tone: {category} ({hex})
    - Body Type: {type}
    - Currently Wearing: {items with colors}
    - Accessories: {list}
    
    User wants: {occasion}, {enhance current or new outfit}
    
    Tasks: evaluate match, recommend items, explain color theory,
    suggest silhouettes, recommend accessories"
   
3. Sends to stylist-chat edge function (uses Gemini 3 Flash)
   
4. Response is streamed via SSE back to frontend
   
5. assistantSoFar accumulates full recommendation text
   
6. After stream completes:
   - setLastRecommendation(assistantSoFar)
   - After 800ms delay → show ProductPromptCard
   - Flow continues to Product Search (Section 3.3) if user clicks "Yes"
```

### Chat Interaction Flow (Text-Only)

```
User types question → sendTextChat()
       ↓
Builds messages array from conversation history
(filters out system-ui, product-related messages)
       ↓
Includes styleProfile from localStorage (if available)
       ↓
POST to stylist-chat → Gemini 3 Flash (streaming)
       ↓
Response displayed token-by-token in chat bubble
```

---

## 5. Database Workflow

### Supabase PostgreSQL Tables

The application uses **3 database tables**:

#### Table: `profiles`
- **Purpose:** Stores user profile information
- **Written on:** User sign-up (auto-created), profile save
- **Read on:** Profile page load, authentication
- **Key columns:** user_id, display_name, bio, is_premium, style_preferences

#### Table: `wardrobe_items`
- **Purpose:** Digital wardrobe of clothing items
- **Written on:** Adding new wardrobe items
- **Read on:** Wardrobe page load
- **Updated on:** Toggle favorite, edit item
- **Deleted on:** Remove item
- **Key columns:** user_id, name, category, color, brand, season, image_url, favorite

#### Table: `saved_outfits`
- **Purpose:** Saved AI-generated outfit recommendations
- **Written on:** Saving from Outfit Generator (currently uses localStorage instead)
- **Key columns:** user_id, name, ai_generated_text, image_url, occasion, season, items

### Supabase Storage

- **Bucket:** `outfit-uploads`
- **Purpose:** Stores uploaded outfit images and wardrobe item photos
- **Upload path:** `chat/{timestamp}.{ext}` for chat uploads
- **Access:** Public URLs via `supabase.storage.from("outfit-uploads").getPublicUrl(path)`

### localStorage Usage

| Key | Purpose | Written By | Read By |
|-----|---------|-----------|---------|
| `stylesense-profile` | Style quiz results | StyleQuiz.tsx | AIStylistChat.tsx (sendTextChat) |
| `stylesense-lookbook` | Saved outfits | OutfitGenerator.tsx | Lookbook.tsx |

---

## 6. API Integrations

### 1. AI Gateway

- **Purpose:** Primary AI model provider for chat, analysis, trends, and image generation
- **Base URL:** `https://ai.gateway.example.dev/v1/chat/completions`
- **Auth:** `Authorization: Bearer {AI_API_KEY}` (server-side only)
- **Models Used:**
  - `google/gemini-3-flash-preview` — Chat, recommendations, outfit analysis, trend generation
  - `google/gemini-2.5-flash-image` — Image generation (mood boards, trend visuals)
- **Data Returned:** Chat completions (streamed or non-streamed), generated images

### 2. OpenRouter

- **Purpose:** Fallback AI model provider for outfit text generation and styled recommendations
- **Base URL:** `https://openrouter.ai/api/v1/chat/completions`
- **Auth:** `Authorization: Bearer {OPENROUTER_API_KEY}` (server-side only)
- **Models Used:**
  - `arcee-ai/trinity-large-preview:free` — Outfit Generator text
  - `google/gemini-2.0-flash-exp:free` — Stylist recommendations (streamed)
- **Data Returned:** Chat completions (streamed or non-streamed)

### 3. RapidAPI Real-Time Product Search

- **Purpose:** Search for real purchasable fashion products
- **Endpoint:** `GET https://real-time-product-search.p.rapidapi.com/search`
- **Auth:** `x-rapidapi-key: {RAPIDAPI_KEY}` (server-side only)
- **Parameters:** q (query), country (in), language (en), limit, sort_by (BEST_MATCH)
- **Data Returned:** Array of products with: title, price, image, link, product page URL
- **Fallback:** If unavailable, generates direct links to Amazon.in, Flipkart, and Myntra

### 4. Hugging Face Inference API

- **Purpose:** Server-side ML models for clothing detection and classification
- **Base URL:** `https://api-inference.huggingface.co/models/{model}`
- **Auth:** `Authorization: Bearer {HF_API_TOKEN}` (server-side only)
- **Models Used:**
  - `facebook/detr-resnet-50` — Object detection (bounding boxes for person, items)
  - `google/vit-base-patch16-224` — Image classification (style labels)
  - `mattmdjaga/segformer_b2_clothes` — Clothing segmentation (garment masks)
- **Data Returned:** Object detections, classification labels, segmentation masks

### 5. Firecrawl API

- **Purpose:** Web search and scraping for fashion articles
- **Endpoint:** `POST https://api.firecrawl.dev/v1/search`
- **Auth:** `Authorization: Bearer {FIRECRAWL_API_KEY}` (server-side only)
- **Parameters:** query, limit (8), scrapeOptions: { formats: ["markdown"] }
- **Data Returned:** Search results with: title, description (markdown excerpt), url

---

## 7. Error Handling

### API Call Errors

| Scenario | Handling | User-Facing Message |
|----------|----------|---------------------|
| **AI Service 429 (Rate Limit)** | Caught in edge function, returns 429 | "Too many requests. Please try again in a moment. 🙏" |
| **AI Service 402 (Payment)** | Caught in edge function, returns 402 | "⚠️ AI credits exhausted. Please add more credits..." |
| **API Gateway 500** | Caught, logged server-side | "AI gateway error" |
| **OpenRouter Rate Limit** | Caught in edge function | "Rate limit exceeded. Please try again." |
| **Network Failure** | Caught in try/catch | "Sorry, I encountered an error. Please try again!" |
| **RapidAPI 429** | Returns empty products + error message | "Rate limit exceeded. Try again later." |
| **RapidAPI Failure** | Falls back to Amazon/Flipkart/Myntra direct links | Products still shown with shopping site links |
| **Firecrawl Not Configured** | Returns 500 with message | "Firecrawl connector not configured" |

### AI Response Errors

| Scenario | Handling |
|----------|----------|
| AI returns empty content | Fallback text: "Unable to generate outfit." / "Unable to analyze the outfit." |
| JSON parse failure (trends) | Logs error, returns empty trends array |
| Malformed SSE stream | Buffer resets, continues parsing next chunk |
| Stream connection lost | `done = true` from reader, partial response shown |

### Image Upload Errors

| Scenario | Handling |
|----------|----------|
| Upload to Supabase Storage fails | `console.error`, returns null, image analysis skipped |
| Image load fails (Canvas) | Returns fallback analysis with "Unknown" values |
| Image too large | Supabase Storage handles limits |
| Invalid image format | FileReader fails gracefully, `setPendingImage` not called |

### Product Fetch Errors

| Scenario | Handling |
|----------|----------|
| All product queries fail | Shows: "😔 No matching products found..." with last error hint |
| Individual query fails | Logs error, continues with next query |
| Google Shopping link returned | Frontend converts to Amazon.in link (sanitizer) |
| Product image fails to load | `onError`: hides broken image, shows shopping emoji fallback |
| Fatal product search error | Shows: "❌ Sorry, I couldn't search for products right now." |

---

## 8. Environment Variables

### Frontend (.env)
| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anonymous/public key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project identifier |

### Supabase Edge Functions (Deno.env / Supabase Dashboard)
| Variable | Used By | Purpose |
|----------|---------|---------|
| `AI_API_KEY` | stylist-chat, analyze-outfit, generate-trends | AI Gateway auth |
| `OPENROUTER_API_KEY` | generate-outfit, stylist-recommend | OpenRouter API auth |
| `HF_API_TOKEN` | analyze-clothing | Hugging Face Inference API auth |
| `RAPIDAPI_KEY` | generate-outfit (product search) | RapidAPI auth |
| `FIRECRAWL_API_KEY` | fetch-fashion-articles | Firecrawl API auth |

---

## 9. Future Improvements

### Architecture
- **Move lookbook storage to Supabase DB** — Currently uses localStorage, which means saved outfits are lost on different devices
- **Add caching layer** — Redis or Supabase cache for AI responses and product search results
- **Implement WebSocket** — Replace SSE streaming with WebSocket for bidirectional chat
- **Add service worker** — PWA support for offline access to wardrobe and lookbook
- **Rate limiting on frontend** — Debounce rapid API calls

### Features
- **Outfit comparison** — Side-by-side comparison of multiple generated outfits
- **Social sharing** — Share outfit analyses and recommendations
- **Outfit history** — Save all AI stylist chat conversations
- **Wardrobe outfit builder** — Combine wardrobe items into outfits
- **Color wheel integration** — Visual color harmony tool for wardrobe items
- **Price tracking** — Track prices of recommended products
- **Multi-language support** — Internationalize the AI prompts and UI

### AI Improvements
- **Fine-tuned fashion model** — Custom model trained on fashion datasets for better garment detection
- **Better body type estimation** — Use pose estimation (MediaPipe) instead of aspect ratio heuristic
- **Real skin tone extraction** — Use face detection API to precisely locate skin regions
- **Occasion-aware product search** — Filter products by occasion relevance
- **Conversational memory** — Persist chat history across sessions for contextual recommendations

### Product Search
- **Multi-region support** — Support product search in different countries
- **Price comparison** — Show prices from multiple retailers
- **Affiliate integration** — Monetize product links via affiliate programs
- **Image-based search** — Search for products using outfit images directly

### DevOps
- **CI/CD pipeline** — Automated testing and deployment for edge functions
- **Edge function versioning** — Proper deployment workflow with rollback capability
- **Monitoring & alerts** — Track API usage, error rates, and response times
- **A/B testing** — Test different AI prompts and UI layouts

---

> **Note for Developers:** When making changes to Supabase Edge Functions, you must deploy them using `npx supabase functions deploy <function-name> --no-verify-jwt` after logging in with `npx supabase login`. Local changes to edge function files do NOT automatically take effect — they must be deployed to the Supabase remote environment.
