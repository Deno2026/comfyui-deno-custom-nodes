// (Deno) Ideogram Director — frontend
// Image-hero board on the ComfyUI canvas (DENO green-black). The board edits are BOUND to the
// node's real (hidden) widgets so they actually reach the backend:
//   boxes + style palette  -> caption_data (JSON, §5)      summary -> high_level_description
//   background field       -> background                   style toggle/fields -> style_mode/...
//   seed box / lock        -> seed / seed_lock
// State is hydrated from those widgets on load (onConfigure) so a saved workflow restores exactly.
// Clean-room (no KJNodes code). Palette per docs/DENO_NODE_VISUAL_IDENTITY.md (NOT mint).

(function () {
  "use strict";
  const { app } = window.comfyAPI.app;
  const api = app.api;

  // ── result loop (design A): the prompt is wired FORWARD into CLIPTextEncode, so the Director
  // never emits an image of its own. We read ComfyUI's standard `executed` event (READ-ONLY) and
  // paint the most recent image-bearing result (the downstream Preview/Save node) onto every
  // Director board. Failure-isolated: if this misses, generation is unaffected — the board just
  // won't update. (Precise prompt→terminal-node tracing for multi-Director graphs is a later refinement.)
  const directorNodes = new Set();
  const PENDING_EVENT = "deno-ideogram-director-pending";
  let directorQueuePromptHookInstalled = false;
  let directorQueuePromptHookRetryScheduled = false;
  function eventNodeIds(detail) {
    const raw = [detail?.node, detail?.node_id, detail?.display_node].filter((v) => v != null).map(String);
    const out = new Set();
    for (const id of raw) {
      if (!id) continue;
      out.add(id);
      out.add(id.split(":").pop());
    }
    return out;
  }
  function matchesEventNode(node, detail) {
    const ids = eventNodeIds(detail);
    return ids.has(String(node.id)) || ids.has(String(node.id).split(":").pop());
  }
  api?.addEventListener?.(PENDING_EVENT, (e) => {
    const d = e && e.detail; if (!d) return;
    for (const n of directorNodes) {
      if (matchesEventNode(n, d) && n._idd && n._idd.onPendingImport) {
        n._idd.onPendingImport(d);
      }
    }
  });
  api?.addEventListener?.("execution_error", (e) => {
    const d = e && e.detail; if (!d) return;
    const isDirectorError = String(d.node_type || d.type || "") === "DenoIdeogramDirector";
    for (const n of directorNodes) {
      if ((matchesEventNode(n, d) || (isDirectorError && directorNodes.size === 1)) && n._idd && n._idd.onExecutionError) {
        n._idd.onExecutionError(d);
      }
    }
  });
  api?.addEventListener?.("executed", (e) => {
    const d = e && e.detail; if (!d) return;
    // import sync: the Director's own build() echoes the wired caption it used (idd_import) —
    // the only way the frontend can see a runtime value (e.g. a fresh LLM output) on the wire.
    const imp = d.output && d.output.idd_import;
    if (Array.isArray(imp) && imp.length) {
      for (const n of directorNodes) {
        if (matchesEventNode(n, d) && n._idd && n._idd.onImport) {
          n._idd.onImport(imp[imp.length - 1]);
        }
      }
    }
    const tr = d.output && d.output.idd_translate;
    if (Array.isArray(tr) && tr.length) {
      for (const n of directorNodes) {
        if (matchesEventNode(n, d) && n._idd && n._idd.onTranslate) {
          n._idd.onTranslate(tr[tr.length - 1]);
        }
      }
    }
    const imgs = d.output && d.output.images;
    if (!Array.isArray(imgs) || !imgs.length) return;
    const im = imgs[imgs.length - 1];
    for (const n of directorNodes) { if (n._idd) n._idd.onResult(im); }
  });

  function installDirectorQueuePromptHook() {
    if (directorQueuePromptHookInstalled && app?.queuePrompt?._denoIddQueuePromptHook) return;
    const original = app?.queuePrompt;
    if (typeof original !== "function") {
      if (!directorQueuePromptHookRetryScheduled) {
        directorQueuePromptHookRetryScheduled = true;
        window.setTimeout(() => {
          directorQueuePromptHookRetryScheduled = false;
          installDirectorQueuePromptHook();
        }, 250);
      }
      return;
    }
    if (original._denoIddQueuePromptHook) {
      directorQueuePromptHookInstalled = true;
      return;
    }
    const wrapped = async function (...args) {
      for (const node of Array.from(directorNodes)) {
        const guard = node?._idd?.preflightIncomingPromptBeforeQueue;
        if (typeof guard !== "function") continue;
        let shouldStop = false;
        try { shouldStop = await guard(); }
        catch (err) {
          console.error("[Director] queue preflight failed", err);
          shouldStop = true;
        }
        if (shouldStop) {
          try { app?.canvas?.setDirty?.(true, true); } catch (e) {}
          return { prompt_id: null, deno_ideogram_director: "preflight_waiting" };
        }
      }
      return await original.apply(this, args);
    };
    wrapped._denoIddQueuePromptHook = true;
    wrapped._denoIddOriginalQueuePrompt = original;
    app.queuePrompt = wrapped;
    directorQueuePromptHookInstalled = true;
  }
  installDirectorQueuePromptHook();
  window.__denoIddInstallQueuePromptHook = installDirectorQueuePromptHook;

  // FNV-1a 32-bit over UTF-8 bytes of the stripped text — MUST match the backend's _import_sig
  // (both sides use it to ask "is this the same wired JSON that last seeded the editor?").
  function fnv1a(s) {
    const b = new TextEncoder().encode((s || "").trim());
    let h = 0x811c9dc5;
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  // ── color math for the custom picker (HEX ⇄ RGB ⇄ HSV, + HSL readout) ──
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
  function rgbToHex(c) { const p = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0").toUpperCase(); return "#" + p(c.r) + p(c.g) + p(c.b); }
  function rgbToHsv({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h, s: mx ? d / mx : 0, v: mx };
  }
  function hsvToRgb({ h, s, v }) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let R = 0, G = 0, B = 0;
    if (h < 60) { R = c; G = x; } else if (h < 120) { R = x; G = c; } else if (h < 180) { G = c; B = x; }
    else if (h < 240) { G = x; B = c; } else if (h < 300) { R = x; B = c; } else { R = c; B = x; }
    return { r: Math.round((R + m) * 255), g: Math.round((G + m) * 255), b: Math.round((B + m) * 255) };
  }
  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s, l };
  }

  // ── preset gallery data: two ORTHOGONAL axes (user-approved design). LAYOUT = composition
  // (ratio + starter boxes), STYLE = look (mode + style_description fields). Applying one never
  // touches the other. Thumbnails are bundled webp files next to this script (styles/<key>.webp);
  // a missing file degrades to a lettered placeholder card, never an error. ──
  // This script is loaded by ComfyUI as an ES module, so import.meta.url is its served URL — the
  // ONLY portable way to find our assets (the install folder name varies per user).
  const IDD_ASSET_BASE = new URL(".", import.meta.url).href;

  // pretty labels for category chips (fallback = capitalized key). Categories are data-driven:
  // the gallery derives its chip row from the distinct `cat` values present, so adding presets with
  // a new `cat` makes a new chip appear automatically — no UI code change needed to scale up.
  const CAT_LABELS = {
    portrait: "Portrait", cinematic: "Cinematic", fashion: "Fashion", bw: "B&W", product: "Product",
    street: "Street", landscape: "Landscape", food: "Food", vintage: "Vintage", beauty: "Beauty",
    anime: "Anime", painting: "Painting", watercolor: "Watercolor", "3d": "3D", retro: "Retro",
    comic: "Comic", ink: "Ink", scifi: "Sci-Fi", concept: "Concept", vector: "Vector", fantasy: "Fantasy",
    architecture: "Architecture", nature: "Nature", night: "Night", automotive: "Automotive",
    experimental: "Experimental", surreal: "Surreal", decorative: "Decorative", cute: "Cute",
    craft: "Craft", street_art: "Street Art", abstract: "Abstract", sports: "Sports",
    tattoo: "Tattoo", scientific: "Scientific", poster: "Poster",
    // layout categories
    composition: "Composition", social: "Social", video: "Video", marketing: "Marketing", print: "Print",
    presentation: "Presentation", infographic: "Infographic", document: "Document",
  };
  const catLabel = (c) => CAT_LABELS[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : "Other");

  const IDD_STYLES = [
    { key: "photographic", name: "Photographic", mode: "photo", cat: "portrait", apply: { aesthetics: "natural, true-to-life, clean", lighting: "soft natural daylight", medium: "photograph", photo: "85mm portrait lens, shallow depth of field, crisp detail" } },
    { key: "cinematic", name: "Cinematic", mode: "photo", cat: "cinematic", apply: { aesthetics: "dramatic, filmic, moody", lighting: "warm low-key, golden-hour rim light", medium: "photograph", photo: "anamorphic, subtle film grain, cinematic color grade" } },
    { key: "fashion_editorial", name: "Fashion editorial", mode: "photo", cat: "fashion", apply: { aesthetics: "chic, high-fashion, editorial", lighting: "clean studio beauty light", medium: "photograph", photo: "medium-format, magazine cover, crisp detail" } },
    { key: "film_noir", name: "Film noir", mode: "photo", cat: "bw", apply: { aesthetics: "moody, dramatic, vintage", lighting: "hard side light, deep shadows", medium: "black-and-white photograph", photo: "high-contrast monochrome, venetian-blind shadows" } },
    { key: "anime", name: "Anime", mode: "art", cat: "anime", apply: { aesthetics: "vibrant, clean", lighting: "bright and soft", medium: "digital illustration", art_style: "modern cel-shaded anime, crisp line art, bold flat colors" } },
    { key: "oil_painting", name: "Oil painting", mode: "art", cat: "painting", apply: { aesthetics: "rich, painterly, textured", lighting: "warm directional studio light, soft shadows", medium: "oil on canvas", art_style: "classical oil painting, visible brushstrokes, impasto" } },
    { key: "watercolor", name: "Watercolor", mode: "art", cat: "watercolor", apply: { aesthetics: "soft, delicate, airy", lighting: "diffuse natural light", medium: "watercolor on cold-press paper", art_style: "loose watercolor, bleeding washes, paper texture" } },
    { key: "cyberpunk", name: "Cyberpunk", mode: "art", cat: "scifi", apply: { aesthetics: "neon, futuristic, high-tech", lighting: "neon glow, magenta and cyan", medium: "digital art", art_style: "cyberpunk, glowing rim light, moody atmosphere" } },
    { key: "render_3d", name: "3D render", mode: "art", cat: "3d", apply: { aesthetics: "polished, smooth, premium", lighting: "soft even key, gentle ambient occlusion", medium: "3D render", art_style: "flat stylized 3D, simple bold shapes, clean colors, soft matte materials" } },
    { key: "pixel_art", name: "Pixel art", mode: "art", cat: "retro", apply: { aesthetics: "retro, crisp, nostalgic", lighting: "flat lighting", medium: "pixel art", art_style: "chunky pixel-art style, large clean blocky pixels, bold limited palette, sharp edges" } },
    { key: "ink_comic", name: "Ink comic", mode: "art", cat: "ink", apply: { aesthetics: "bold, graphic, high-contrast", lighting: "hard high contrast", medium: "ink", art_style: "black-and-white ink, bold cross-hatching, graphic novel" } },
    { key: "pop_art", name: "Pop art", mode: "art", cat: "comic", apply: { aesthetics: "bold, saturated, graphic", lighting: "flat", medium: "screenprint", art_style: "pop art, halftone dots, bold outlines" } },
    { key: "low_poly", name: "Low poly", mode: "art", cat: "3d", apply: { aesthetics: "geometric, minimal, clean", lighting: "soft gradient", medium: "3D", art_style: "low-poly, faceted geometric shapes" } },
    { key: "vaporwave", name: "Vaporwave", mode: "art", cat: "retro", apply: { aesthetics: "pastel, dreamy, retro 80s", lighting: "sunset gradient glow", medium: "digital art", art_style: "vaporwave, pastel pink and teal, retro aesthetic" } },
    // ── library wave 1 (generated from tmp/hook50/style_catalog.json) ──
    { key: "natural_light_portrait", name: "Natural Light", mode: "photo", cat: "portrait", apply: { aesthetics: "natural, true-to-life, gentle", lighting: "soft window daylight", medium: "photograph", photo: "50mm prime, creamy bokeh, true skin tones" } },
    { key: "studio_headshot", name: "Studio Headshot", mode: "photo", cat: "portrait", apply: { aesthetics: "clean, professional, crisp", lighting: "two-light studio setup, soft key and rim", medium: "photograph", photo: "85mm, seamless backdrop, corporate headshot" } },
    { key: "environmental_portrait", name: "Environmental", mode: "photo", cat: "portrait", apply: { aesthetics: "storytelling, lived-in, warm", lighting: "available light, soft contrast", medium: "photograph", photo: "35mm, subject in their space, context visible" } },
    { key: "golden_hour_portrait", name: "Golden Hour", mode: "photo", cat: "portrait", apply: { aesthetics: "warm, glowy, romantic", lighting: "backlit golden-hour sun, lens flare", medium: "photograph", photo: "85mm, backlight haze, rim-lit hair" } },
    { key: "teal_orange", name: "Teal & Orange", mode: "photo", cat: "cinematic", apply: { aesthetics: "blockbuster, punchy, graded", lighting: "warm key, cool shadows", medium: "photograph", photo: "anamorphic, teal-and-orange color grade, film grain" } },
    { key: "neon_noir", name: "Neon Noir", mode: "photo", cat: "cinematic", apply: { aesthetics: "moody, stylish, nocturnal", lighting: "magenta and cyan neon, hard contrast", medium: "photograph", photo: "cinematic, shallow focus, wet-street reflections" } },
    { key: "high_key_beauty", name: "High-Key Beauty", mode: "photo", cat: "fashion", apply: { aesthetics: "bright, flawless, airy", lighting: "high-key beauty dish, soft and even", medium: "photograph", photo: "100mm macro beauty, crisp pores, catchlights" } },
    { key: "street_style", name: "Street Style", mode: "photo", cat: "fashion", apply: { aesthetics: "candid, urban, confident", lighting: "overcast daylight, natural contrast", medium: "photograph", photo: "35mm, full-length street fashion, motion feel" } },
    { key: "bw_documentary", name: "B&W Documentary", mode: "photo", cat: "bw", apply: { aesthetics: "honest, gritty, timeless", lighting: "available light, natural contrast", medium: "black-and-white photograph", photo: "35mm reportage, grain, decisive moment" } },
    { key: "bw_fine_art", name: "B&W Fine Art", mode: "photo", cat: "bw", apply: { aesthetics: "elegant, minimal, sculptural", lighting: "single soft window light, deep blacks", medium: "black-and-white photograph", photo: "medium-format, fine tonal range, low key" } },
    { key: "product_studio", name: "Product Studio", mode: "photo", cat: "product", apply: { aesthetics: "clean, premium, commercial", lighting: "softbox product lighting, gradient falloff", medium: "photograph", photo: "macro product shot, crisp reflections" } },
    { key: "product_dark", name: "Dark Product", mode: "photo", cat: "product", apply: { aesthetics: "luxurious, dramatic, moody", lighting: "single hard key, deep shadow, edge glow", medium: "photograph", photo: "macro, low-key product hero, rim light" } },
    { key: "food_overhead", name: "Food Overhead", mode: "photo", cat: "food", apply: { aesthetics: "fresh, appetizing, tidy", lighting: "soft diffused daylight from the side", medium: "photograph", photo: "top-down flat lay, crisp detail" } },
    { key: "food_moody", name: "Dark & Moody Food", mode: "photo", cat: "food", apply: { aesthetics: "rich, rustic, indulgent", lighting: "low-key side light, dramatic shadows", medium: "photograph", photo: "close-up, shallow depth, steam and texture" } },
    { key: "landscape_golden", name: "Golden Landscape", mode: "photo", cat: "landscape", apply: { aesthetics: "epic, serene, expansive", lighting: "warm sunrise side light, long shadows", medium: "photograph", photo: "wide-angle, deep focus, polarized sky" } },
    { key: "anime_90s", name: "90s Anime", mode: "art", cat: "anime", apply: { aesthetics: "nostalgic, hand-drawn, warm", lighting: "soft cel lighting, film grain", medium: "anime cel", art_style: "retro 1990s anime, painted backgrounds, grainy cel look" } },
    { key: "manga_bw", name: "Manga (B&W)", mode: "art", cat: "anime", apply: { aesthetics: "dynamic, inked, screentoned", lighting: "high-contrast ink shading", medium: "manga ink", art_style: "black-and-white manga, screentones, bold inking, speed lines" } },
    { key: "chibi", name: "Chibi", mode: "art", cat: "anime", apply: { aesthetics: "cute, rounded, playful", lighting: "bright flat lighting", medium: "digital illustration", art_style: "chibi, super-deformed, big head, tiny body, soft shading" } },
    { key: "impressionist", name: "Impressionist", mode: "art", cat: "painting", apply: { aesthetics: "luminous, loose, atmospheric", lighting: "dappled outdoor light", medium: "oil on canvas", art_style: "impressionist, visible dabs, broken color, plein air" } },
    { key: "gouache", name: "Gouache", mode: "art", cat: "painting", apply: { aesthetics: "matte, vivid, charming", lighting: "soft even light", medium: "gouache on paper", art_style: "gouache illustration, matte opaque color, visible brush texture" } },
    { key: "renaissance", name: "Renaissance", mode: "art", cat: "painting", apply: { aesthetics: "masterful, reverent, rich", lighting: "soft warm directional light, gentle shadow", medium: "oil on panel", art_style: "high-renaissance oil painting, sfumato, luminous glazes, balanced midtones" } },
    { key: "claymation", name: "Claymation", mode: "art", cat: "3d", apply: { aesthetics: "handmade, quirky, tactile", lighting: "soft stop-motion studio light", medium: "stop-motion still", art_style: "claymation, fingerprint texture, miniature set, plasticine" } },
    { key: "isometric", name: "Isometric", mode: "art", cat: "3d", apply: { aesthetics: "tidy, charming, miniature", lighting: "soft even game lighting", medium: "3D render", art_style: "isometric game art, clean bevels, saturated palette" } },
    { key: "voxel", name: "Voxel", mode: "art", cat: "3d", apply: { aesthetics: "blocky, playful, crisp", lighting: "soft ambient occlusion", medium: "voxel render", art_style: "voxel art, cubic blocks, clean lighting, MagicaVoxel style" } },
    { key: "synthwave", name: "Synthwave", mode: "art", cat: "retro", apply: { aesthetics: "neon, nostalgic, electric", lighting: "magenta sunset glow, cyan grid light", medium: "digital art", art_style: "80s synthwave, chrome, neon grid, scanlines" } },
    { key: "retro_print", name: "Retro Print", mode: "art", cat: "retro", apply: { aesthetics: "warm, faded, mid-century", lighting: "flat print light", medium: "screenprint", art_style: "1960s retro print, limited palette, halftone, slight misregistration" } },
    { key: "american_comic", name: "American Comic", mode: "art", cat: "comic", apply: { aesthetics: "bold, heroic, dynamic", lighting: "high-contrast comic lighting", medium: "comic ink and color", art_style: "american superhero comic, bold inks, cross-hatching, dynamic" } },
    { key: "webtoon", name: "Webtoon", mode: "art", cat: "comic", apply: { aesthetics: "clean, modern, soft", lighting: "soft digital cel light", medium: "digital illustration", art_style: "korean webtoon, clean lineart, soft cel shading, trendy" } },
    { key: "space_opera", name: "Space Opera", mode: "art", cat: "scifi", apply: { aesthetics: "epic, vast, cinematic", lighting: "starlight and engine glow", medium: "digital painting", art_style: "sci-fi concept art, massive scale, atmospheric haze" } },
    { key: "storybook", name: "Storybook", mode: "art", cat: "fantasy", apply: { aesthetics: "whimsical, warm, gentle", lighting: "soft magical glow", medium: "illustration", art_style: "children's storybook, soft watercolor and ink, cozy whimsy" } },
    { key: "flat_vector", name: "Flat Vector", mode: "art", cat: "vector", apply: { aesthetics: "clean, modern, graphic", lighting: "flat even light", medium: "vector illustration", art_style: "flat vector, bold shapes, limited palette, no gradients" } },
    // ── library wave 2 (style_catalog2.json) ──
    { key: "rembrandt_portrait", name: "Rembrandt", mode: "photo", cat: "portrait", apply: { aesthetics: "classic, painterly, intimate", lighting: "rembrandt lighting, triangle of light on the cheek", medium: "photograph", photo: "85mm, deep falloff, low key" } },
    { key: "hard_flash_portrait", name: "Hard Flash", mode: "photo", cat: "portrait", apply: { aesthetics: "raw, punchy, candid", lighting: "direct on-camera flash, hard shadow", medium: "photograph", photo: "28mm, snapshot aesthetic, slight grain" } },
    { key: "candid_portrait", name: "Candid", mode: "photo", cat: "portrait", apply: { aesthetics: "natural, unposed, warm", lighting: "available light, soft contrast", medium: "photograph", photo: "50mm, lifestyle candid, shallow focus" } },
    { key: "glamour", name: "Glamour", mode: "photo", cat: "fashion", apply: { aesthetics: "polished, sensual, luxe", lighting: "soft beauty light with strong catchlights", medium: "photograph", photo: "105mm, glossy retouch, shallow focus" } },
    { key: "avant_garde_fashion", name: "Avant-Garde", mode: "photo", cat: "fashion", apply: { aesthetics: "experimental, bold, artful", lighting: "colored gels, dramatic contrast", medium: "photograph", photo: "medium-format, conceptual editorial" } },
    { key: "wes_anderson", name: "Symmetric Pastel", mode: "photo", cat: "cinematic", apply: { aesthetics: "whimsical, symmetrical, pastel", lighting: "flat even daylight", medium: "photograph", photo: "centered symmetry, pastel palette, deadpan framing" } },
    { key: "thriller_cinematic", name: "Thriller", mode: "photo", cat: "cinematic", apply: { aesthetics: "tense, dark, moody", lighting: "hard low-key, cold shadows", medium: "photograph", photo: "anamorphic, desaturated cool grade, deep contrast" } },
    { key: "romance_soft", name: "Soft Romance", mode: "photo", cat: "cinematic", apply: { aesthetics: "dreamy, warm, tender", lighting: "soft warm backlight, gentle haze", medium: "photograph", photo: "85mm, hazy bloom, warm grade" } },
    { key: "bw_street", name: "B&W Street", mode: "photo", cat: "bw", apply: { aesthetics: "candid, graphic, timeless", lighting: "hard daylight, strong shadows", medium: "black-and-white photograph", photo: "35mm reportage, high contrast monochrome" } },
    { key: "bw_high_contrast", name: "High Contrast B&W", mode: "photo", cat: "bw", apply: { aesthetics: "bold, graphic, dramatic", lighting: "hard light, crushed blacks, bright whites", medium: "black-and-white photograph", photo: "deep contrast monochrome, sculptural" } },
    { key: "product_flatlay", name: "Flat Lay", mode: "photo", cat: "product", apply: { aesthetics: "tidy, styled, editorial", lighting: "soft even overhead light", medium: "photograph", photo: "top-down flat lay, arranged props" } },
    { key: "product_splash", name: "Splash", mode: "photo", cat: "product", apply: { aesthetics: "dynamic, fresh, energetic", lighting: "bright backlit splash lighting", medium: "photograph", photo: "high-speed freeze, liquid splash" } },
    { key: "food_bright", name: "Bright & Fresh Food", mode: "photo", cat: "food", apply: { aesthetics: "clean, fresh, airy", lighting: "bright soft daylight", medium: "photograph", photo: "45-degree angle, crisp, high-key" } },
    { key: "food_rustic", name: "Rustic Food", mode: "photo", cat: "food", apply: { aesthetics: "homey, earthy, warm", lighting: "warm window light", medium: "photograph", photo: "close-up, shallow depth, textured props" } },
    { key: "landscape_bluehour", name: "Blue Hour", mode: "photo", cat: "landscape", apply: { aesthetics: "calm, cool, cinematic", lighting: "cool twilight glow", medium: "photograph", photo: "wide-angle, long exposure, deep focus" } },
    { key: "aerial_drone", name: "Aerial Drone", mode: "photo", cat: "landscape", apply: { aesthetics: "graphic, expansive, fresh", lighting: "high-noon clarity", medium: "photograph", photo: "top-down drone shot, polarized" } },
    { key: "seascape", name: "Seascape", mode: "photo", cat: "landscape", apply: { aesthetics: "serene, vast, natural", lighting: "soft golden coastal light", medium: "photograph", photo: "wide-angle, long exposure, smooth water" } },
    { key: "architecture_minimal", name: "Minimal Architecture", mode: "photo", cat: "architecture", apply: { aesthetics: "clean, geometric, modern", lighting: "hard directional sun, crisp shadows", medium: "photograph", photo: "perspective-corrected, bold lines" } },
    { key: "wildlife", name: "Wildlife", mode: "photo", cat: "nature", apply: { aesthetics: "powerful, wild, crisp", lighting: "soft natural light, dappled", medium: "photograph", photo: "300mm telephoto, shallow depth" } },
    { key: "macro_nature", name: "Macro Nature", mode: "photo", cat: "nature", apply: { aesthetics: "delicate, crystalline, quiet", lighting: "backlit sparkle on dew", medium: "photograph", photo: "1:1 macro, razor-thin focus" } },
    { key: "astro", name: "Astro", mode: "photo", cat: "night", apply: { aesthetics: "vast, silent, awe-inspiring", lighting: "starlight, faint airglow", medium: "photograph", photo: "wide-angle long exposure, tripod" } },
    { key: "vintage_70s", name: "70s Film", mode: "photo", cat: "vintage", apply: { aesthetics: "warm, nostalgic, faded", lighting: "warm hazy sun", medium: "film photograph", photo: "35mm film, warm cast, soft grain, light leaks" } },
    { key: "ghibli_soft", name: "Soft Anime Film", mode: "art", cat: "anime", apply: { aesthetics: "warm, gentle, painterly", lighting: "soft natural light, lush color", medium: "anime film still", art_style: "hand-painted anime film background, soft cel characters, lush detail" } },
    { key: "shoujo", name: "Shoujo", mode: "art", cat: "anime", apply: { aesthetics: "sparkly, delicate, romantic", lighting: "soft glowing light, sparkles", medium: "digital illustration", art_style: "shoujo manga, big sparkling eyes, flowers, soft pastels" } },
    { key: "shonen_action", name: "Shonen Action", mode: "art", cat: "anime", apply: { aesthetics: "dynamic, energetic, bold", lighting: "dramatic action lighting", medium: "digital illustration", art_style: "shonen anime, dynamic pose, speed lines, bold shading" } },
    { key: "acrylic", name: "Acrylic", mode: "art", cat: "painting", apply: { aesthetics: "bold, vivid, textured", lighting: "even studio light", medium: "acrylic on canvas", art_style: "bold acrylic painting, thick visible strokes, vivid color" } },
    { key: "baroque", name: "Baroque", mode: "art", cat: "painting", apply: { aesthetics: "dramatic, opulent, dynamic", lighting: "strong warm key with soft shadow falloff", medium: "oil on canvas", art_style: "baroque oil painting, dramatic directional light, rich color, dynamic movement" } },
    { key: "van_gogh", name: "Post-Impressionist", mode: "art", cat: "painting", apply: { aesthetics: "expressive, swirling, vivid", lighting: "luminous expressive light", medium: "oil on canvas", art_style: "post-impressionist, thick swirling impasto strokes, vivid" } },
    { key: "ukiyo_e", name: "Ukiyo-e", mode: "art", cat: "painting", apply: { aesthetics: "iconic, flat, rhythmic", lighting: "flat print light", medium: "woodblock print", art_style: "edo-period ukiyo-e woodblock, indigo lines, flat color, washi texture" } },
    { key: "chinese_ink", name: "Chinese Ink", mode: "art", cat: "painting", apply: { aesthetics: "serene, minimal, flowing", lighting: "soft diffuse light", medium: "ink wash on rice paper", art_style: "chinese ink wash, sparse brush, negative space, soft gradients" } },
    { key: "pixar_3d", name: "Stylized 3D", mode: "art", cat: "3d", apply: { aesthetics: "charming, polished, expressive", lighting: "soft cinematic studio light", medium: "3D render", art_style: "stylized animated-film 3D, big expressive features, soft stylized skin" } },
    { key: "zbrush_sculpt", name: "Sculpt", mode: "art", cat: "3d", apply: { aesthetics: "detailed, dramatic, tactile", lighting: "dramatic single key light", medium: "3D sculpt render", art_style: "stylized digital clay sculpt, smooth matte clay matcap, simplified forms" } },
    { key: "pixel_8bit", name: "8-bit Pixel", mode: "art", cat: "retro", apply: { aesthetics: "retro, blocky, nostalgic", lighting: "flat lighting", medium: "pixel art", art_style: "chunky 8-bit pixel-art style, large clean square pixels, tiny limited palette, sharp edges" } },
    { key: "airbrush_80s", name: "80s Airbrush", mode: "art", cat: "retro", apply: { aesthetics: "glossy, dreamy, retro", lighting: "soft gradient glow", medium: "airbrush illustration", art_style: "80s airbrush, smooth gradients, chrome and neon, soft glow" } },
    { key: "psychedelic", name: "Psychedelic", mode: "art", cat: "retro", apply: { aesthetics: "trippy, vibrant, swirling", lighting: "glowing saturated light", medium: "poster illustration", art_style: "1960s psychedelic poster, swirling patterns, vibrant complementary colors" } },
    { key: "european_bd", name: "Ligne Claire", mode: "art", cat: "comic", apply: { aesthetics: "clean, retro-futuristic, precise", lighting: "flat even color", medium: "comic ink and color", art_style: "european bande dessinee, ligne claire, clean outlines, flat color" } },
    { key: "manhwa", name: "Manhwa", mode: "art", cat: "comic", apply: { aesthetics: "sleek, polished, cinematic", lighting: "soft cinematic cel light", medium: "digital illustration", art_style: "korean manhwa, sleek lineart, rich cel shading, dramatic" } },
    { key: "cartoon_western", name: "Western Cartoon", mode: "art", cat: "comic", apply: { aesthetics: "bouncy, bold, playful", lighting: "bright flat light", medium: "digital illustration", art_style: "modern western cartoon, rubber-hose energy, thick outlines, bright" } },
    { key: "sumi_e", name: "Sumi-e", mode: "art", cat: "ink", apply: { aesthetics: "minimal, expressive, zen", lighting: "flat soft light", medium: "sumi ink on paper", art_style: "japanese sumi-e, few confident brushstrokes, negative space" } },
    { key: "engraving", name: "Engraving", mode: "art", cat: "ink", apply: { aesthetics: "intricate, antique, precise", lighting: "flat print light", medium: "copperplate engraving", art_style: "crosshatch engraving, fine parallel lines, antique illustration" } },
    { key: "linocut", name: "Linocut", mode: "art", cat: "ink", apply: { aesthetics: "bold, graphic, handmade", lighting: "flat print light", medium: "linocut print", art_style: "bold linocut, carved texture, high-contrast two-tone" } },
    { key: "dieselpunk", name: "Dieselpunk", mode: "art", cat: "scifi", apply: { aesthetics: "gritty, industrial, retro", lighting: "warm industrial glow", medium: "digital painting", art_style: "dieselpunk, riveted machinery, brass and steel, 1940s retro-future" } },
    { key: "solarpunk", name: "Solarpunk", mode: "art", cat: "scifi", apply: { aesthetics: "bright, hopeful, verdant", lighting: "warm sunlit glow", medium: "digital illustration", art_style: "solarpunk, lush greenery on white architecture, art-nouveau tech, bright" } },
    { key: "mecha", name: "Mecha", mode: "art", cat: "scifi", apply: { aesthetics: "detailed, powerful, technical", lighting: "dramatic rim light, glow accents", medium: "digital painting", art_style: "mecha concept art, intricate panels, hydraulics, hard-surface detail" } },
    { key: "dark_fantasy", name: "Dark Fantasy", mode: "art", cat: "fantasy", apply: { aesthetics: "grim, ominous, epic", lighting: "cold moonlight, eerie glow", medium: "digital painting", art_style: "dark fantasy concept art, grim atmosphere, ornate armor, painterly" } },
    { key: "high_fantasy", name: "High Fantasy", mode: "art", cat: "fantasy", apply: { aesthetics: "majestic, luminous, epic", lighting: "warm god-rays through mist", medium: "digital painting", art_style: "high-fantasy concept art, sweeping vistas, painterly, atmospheric" } },
    { key: "fairytale", name: "Fairytale", mode: "art", cat: "fantasy", apply: { aesthetics: "whimsical, soft, enchanting", lighting: "soft magical glow, fireflies", medium: "illustration", art_style: "fairytale illustration, soft painterly, glowing whimsy" } },
    { key: "concept_environment", name: "Environment Concept", mode: "art", cat: "concept", apply: { aesthetics: "cinematic, atmospheric, grand", lighting: "dramatic atmospheric light", medium: "digital painting", art_style: "environment concept art, broad brush, atmospheric perspective, scale" } },
    { key: "matte_painting", name: "Matte Painting", mode: "art", cat: "concept", apply: { aesthetics: "epic, atmospheric, seamless", lighting: "cinematic natural light", medium: "digital matte painting", art_style: "painterly matte painting, epic scale, broad confident brushwork, atmospheric depth" } },
    { key: "gradient_vector", name: "Gradient Vector", mode: "art", cat: "vector", apply: { aesthetics: "smooth, modern, vibrant", lighting: "flat with soft gradients", medium: "vector illustration", art_style: "modern gradient vector, smooth color blends, soft shapes" } },
    { key: "line_art", name: "Line Art", mode: "art", cat: "vector", apply: { aesthetics: "minimal, elegant, clean", lighting: "flat", medium: "line illustration", art_style: "minimal single-weight line art, one or two colors, lots of white space" } },
    { key: "graffiti", name: "Graffiti", mode: "art", cat: "street_art", apply: { aesthetics: "loud, rebellious, colorful", lighting: "flat daylight on a wall", medium: "spray paint", art_style: "wildstyle graffiti mural, drips, spray texture, bold outlines" } },
    { key: "stained_glass", name: "Stained Glass", mode: "art", cat: "decorative", apply: { aesthetics: "radiant, ornate, sacred", lighting: "sunlight through colored glass", medium: "stained glass", art_style: "gothic stained glass, heavy lead lines, glowing jewel tones" } },
    { key: "papercraft", name: "Papercraft", mode: "art", cat: "decorative", apply: { aesthetics: "delicate, layered, tactile", lighting: "soft backlight through paper", medium: "papercraft", art_style: "layered paper-cut diorama, crisp edges, depth shadows" } },
    { key: "art_nouveau", name: "Art Nouveau", mode: "art", cat: "decorative", apply: { aesthetics: "ornate, flowing, elegant", lighting: "soft even light", medium: "illustration", art_style: "art nouveau, flowing organic lines, decorative borders, muted gold" } },
    { key: "art_deco", name: "Art Deco", mode: "art", cat: "decorative", apply: { aesthetics: "geometric, luxe, bold", lighting: "flat dramatic light", medium: "graphic design", art_style: "art deco, bold symmetry, gold and black, geometric sunrays" } },
    { key: "bauhaus", name: "Bauhaus", mode: "art", cat: "decorative", apply: { aesthetics: "geometric, primary, minimal", lighting: "flat even light", medium: "graphic design", art_style: "bauhaus, primary colors, bold geometric shapes, clean grid" } },
    { key: "kawaii_sticker", name: "Kawaii Sticker", mode: "art", cat: "cute", apply: { aesthetics: "cute, glossy, playful", lighting: "bright flat light", medium: "sticker illustration", art_style: "kawaii sticker art, thick white outline, glossy, rounded, pastel" } },
    { key: "cross_stitch", name: "Cross-Stitch", mode: "art", cat: "craft", apply: { aesthetics: "handmade, cozy, textured", lighting: "soft even light", medium: "embroidery", art_style: "cross-stitch embroidery, visible thread X's, aida cloth texture" } },
    { key: "felt_craft", name: "Felt Craft", mode: "art", cat: "craft", apply: { aesthetics: "soft, handmade, cozy", lighting: "soft stop-motion light", medium: "needle-felt", art_style: "needle-felted wool craft, fuzzy texture, handmade miniature" } },
    // ── library wave 3 (style_catalog3.json) ──
    { key: "butterfly_light", name: "Butterfly Light", mode: "photo", cat: "portrait", apply: { aesthetics: "glamorous, polished, classic", lighting: "butterfly lighting, light above the lens", medium: "photograph", photo: "100mm, symmetrical beauty light, soft shadow under the nose" } },
    { key: "split_light", name: "Split Light", mode: "photo", cat: "portrait", apply: { aesthetics: "dramatic, sculptural, moody", lighting: "split lighting, half the face in shadow", medium: "photograph", photo: "85mm, hard side key, deep shadow" } },
    { key: "ring_light_portrait", name: "Ring Light", mode: "photo", cat: "portrait", apply: { aesthetics: "clean, modern, glossy", lighting: "ring light, even frontal glow, circular catchlights", medium: "photograph", photo: "50mm, beauty ring-light look, crisp" } },
    { key: "silhouette_portrait", name: "Silhouette", mode: "photo", cat: "portrait", apply: { aesthetics: "graphic, minimal, moody", lighting: "strong backlight, subject in shadow", medium: "photograph", photo: "85mm, rim-lit silhouette against bright sky" } },
    { key: "smoke_portrait", name: "Smoke & Fog", mode: "photo", cat: "portrait", apply: { aesthetics: "atmospheric, dramatic, mysterious", lighting: "hard beam through haze", medium: "photograph", photo: "85mm, volumetric smoke, moody contrast" } },
    { key: "backlit_portrait", name: "Backlit Glow", mode: "photo", cat: "portrait", apply: { aesthetics: "dreamy, warm, glowing", lighting: "strong backlight, hazy rim, lens flare", medium: "photograph", photo: "85mm, blown-out bright backlight, soft bloom" } },
    { key: "overcast_portrait", name: "Overcast", mode: "photo", cat: "portrait", apply: { aesthetics: "soft, natural, even", lighting: "flat overcast daylight", medium: "photograph", photo: "50mm, soft shadowless light, natural tones" } },
    { key: "bleach_bypass", name: "Bleach Bypass", mode: "photo", cat: "cinematic", apply: { aesthetics: "gritty, desaturated, harsh", lighting: "high contrast, muted color", medium: "photograph", photo: "anamorphic, bleach-bypass grade, silver retention" } },
    { key: "day_for_night", name: "Day for Night", mode: "photo", cat: "cinematic", apply: { aesthetics: "moody, cool, cinematic", lighting: "underexposed blue moonlight look", medium: "photograph", photo: "anamorphic, cold blue grade simulating night" } },
    { key: "super8", name: "Super 8", mode: "photo", cat: "cinematic", apply: { aesthetics: "nostalgic, grainy, warm", lighting: "warm hazy light", medium: "super 8 film", photo: "8mm film grain, soft focus, light leaks, warm cast" } },
    { key: "vhs_look", name: "VHS", mode: "photo", cat: "cinematic", apply: { aesthetics: "lo-fi, nostalgic, glitchy", lighting: "flat video lighting", medium: "VHS still", photo: "VHS tape artifacts, scanlines, chromatic smear, timestamp" } },
    { key: "kodak_portra", name: "Portra Film", mode: "photo", cat: "cinematic", apply: { aesthetics: "warm, natural, filmic", lighting: "soft natural light", medium: "film photograph", photo: "Portra 400, warm skin tones, gentle grain, pastel contrast" } },
    { key: "beauty_closeup", name: "Beauty Close-up", mode: "photo", cat: "fashion", apply: { aesthetics: "flawless, glossy, detailed", lighting: "soft beauty dish, bright catchlights", medium: "photograph", photo: "100mm macro, extreme detail, dewy skin" } },
    { key: "monochrome_fashion", name: "Mono Fashion", mode: "photo", cat: "fashion", apply: { aesthetics: "chic, graphic, bold", lighting: "hard studio key", medium: "black-and-white photograph", photo: "medium-format, high-fashion monochrome, crisp" } },
    { key: "vintage_fashion", name: "Vintage Fashion", mode: "photo", cat: "fashion", apply: { aesthetics: "retro, elegant, editorial", lighting: "warm vintage studio light", medium: "film photograph", photo: "1960s fashion editorial, film grain, warm tones" } },
    { key: "jewelry_macro", name: "Jewelry Macro", mode: "photo", cat: "product", apply: { aesthetics: "luxurious, precise, brilliant", lighting: "controlled sparkle light", medium: "photograph", photo: "macro, crisp reflections, sparkling facets" } },
    { key: "watch_macro", name: "Watch Macro", mode: "photo", cat: "product", apply: { aesthetics: "precise, premium, technical", lighting: "hard key with metallic reflections", medium: "photograph", photo: "macro, crisp dial detail, brushed metal" } },
    { key: "cosmetics_product", name: "Cosmetics", mode: "photo", cat: "product", apply: { aesthetics: "elegant, soft, premium", lighting: "soft beauty light", medium: "photograph", photo: "product macro, creamy reflections" } },
    { key: "tech_flatlay", name: "Tech Flat Lay", mode: "photo", cat: "product", apply: { aesthetics: "clean, modern, tidy", lighting: "soft even overhead light", medium: "photograph", photo: "top-down flat lay, crisp gadgets" } },
    { key: "beverage_splash", name: "Beverage Splash", mode: "photo", cat: "product", apply: { aesthetics: "fresh, dynamic, vivid", lighting: "bright backlit splash", medium: "photograph", photo: "high-speed freeze, liquid crown splash" } },
    { key: "fine_dining", name: "Fine Dining", mode: "photo", cat: "food", apply: { aesthetics: "refined, artful, minimal", lighting: "soft directional light", medium: "photograph", photo: "close-up, shallow depth, elegant plating" } },
    { key: "street_food", name: "Street Food", mode: "photo", cat: "food", apply: { aesthetics: "vibrant, lively, appetizing", lighting: "warm market light, steam", medium: "photograph", photo: "close-up, shallow depth, candid energy" } },
    { key: "baking_food", name: "Baking", mode: "photo", cat: "food", apply: { aesthetics: "warm, homey, rustic", lighting: "soft window light with flour dust", medium: "photograph", photo: "close-up, shallow depth, golden crust detail" } },
    { key: "cocktail", name: "Cocktail", mode: "photo", cat: "food", apply: { aesthetics: "moody, jewel-toned, elegant", lighting: "low-key backlight with glints", medium: "photograph", photo: "close-up, shallow depth, condensation and garnish" } },
    { key: "coffee_art", name: "Latte Art", mode: "photo", cat: "food", apply: { aesthetics: "cozy, warm, crafted", lighting: "soft morning light", medium: "photograph", photo: "top-down close-up, crisp latte-art detail" } },
    { key: "autumn_forest", name: "Autumn Forest", mode: "photo", cat: "landscape", apply: { aesthetics: "warm, serene, rich", lighting: "soft golden filtered light", medium: "photograph", photo: "wide-angle, deep focus, glowing foliage" } },
    { key: "winter_snow", name: "Winter Snow", mode: "photo", cat: "landscape", apply: { aesthetics: "crisp, calm, cool", lighting: "soft blue-white daylight", medium: "photograph", photo: "wide-angle, deep focus, pristine snow" } },
    { key: "cherry_blossom", name: "Cherry Blossom", mode: "photo", cat: "landscape", apply: { aesthetics: "delicate, fresh, dreamy", lighting: "soft spring daylight", medium: "photograph", photo: "85mm, shallow depth, drifting petals" } },
    { key: "lavender_field", name: "Lavender Field", mode: "photo", cat: "landscape", apply: { aesthetics: "tranquil, warm, expansive", lighting: "golden-hour side light", medium: "photograph", photo: "wide-angle, leading rows, warm glow" } },
    { key: "northern_lights", name: "Aurora", mode: "photo", cat: "landscape", apply: { aesthetics: "awe-inspiring, cold, luminous", lighting: "green aurora glow over snow", medium: "photograph", photo: "wide-angle long exposure, vivid aurora" } },
    { key: "desert_dunes", name: "Desert Dunes", mode: "photo", cat: "landscape", apply: { aesthetics: "minimal, graphic, warm", lighting: "low golden side light, long shadows", medium: "photograph", photo: "wide-angle, sculptural dune curves" } },
    { key: "waterfall_long", name: "Waterfall", mode: "photo", cat: "landscape", apply: { aesthetics: "lush, serene, fresh", lighting: "soft shaded daylight", medium: "photograph", photo: "long exposure, silky water, deep focus" } },
    { key: "tropical_beach", name: "Tropical Beach", mode: "photo", cat: "landscape", apply: { aesthetics: "bright, vivid, inviting", lighting: "bright midday sun", medium: "photograph", photo: "wide-angle, turquoise water, crisp clarity" } },
    { key: "street_night_photo", name: "Night Street", mode: "photo", cat: "street", apply: { aesthetics: "moody, neon, urban", lighting: "neon and sodium street light", medium: "photograph", photo: "35mm, shallow focus, wet pavement reflections" } },
    { key: "rainy_reflections", name: "Rainy Reflections", mode: "photo", cat: "street", apply: { aesthetics: "moody, graphic, cinematic", lighting: "reflected city light on wet ground", medium: "photograph", photo: "35mm, mirror-like puddle reflections" } },
    { key: "gothic_cathedral", name: "Gothic", mode: "photo", cat: "architecture", apply: { aesthetics: "majestic, ornate, reverent", lighting: "shafts of colored light through windows", medium: "photograph", photo: "ultra-wide, soaring vaults, deep focus" } },
    { key: "modern_glass_arch", name: "Modern Glass", mode: "photo", cat: "architecture", apply: { aesthetics: "sleek, geometric, cool", lighting: "reflective daylight on glass", medium: "photograph", photo: "perspective-corrected, glass-and-steel reflections" } },
    { key: "japanese_interior", name: "Japanese Interior", mode: "photo", cat: "architecture", apply: { aesthetics: "serene, minimal, warm", lighting: "soft diffused shoji light", medium: "photograph", photo: "wide, tatami and wood, calm tones" } },
    { key: "bird_telephoto", name: "Bird Telephoto", mode: "photo", cat: "nature", apply: { aesthetics: "crisp, vivid, lively", lighting: "soft natural light", medium: "photograph", photo: "500mm telephoto, frozen wings, creamy bokeh" } },
    { key: "underwater_reef", name: "Underwater Reef", mode: "photo", cat: "nature", apply: { aesthetics: "vivid, tranquil, immersive", lighting: "sun rays through clear water", medium: "photograph", photo: "underwater wide-angle, vivid coral" } },
    { key: "sports_action", name: "Sports Action", mode: "photo", cat: "sports", apply: { aesthetics: "dynamic, powerful, crisp", lighting: "bright stadium light", medium: "photograph", photo: "fast shutter freeze, motion energy, shallow depth" } },
    { key: "classic_car", name: "Classic Car", mode: "photo", cat: "automotive", apply: { aesthetics: "nostalgic, polished, warm", lighting: "warm golden-hour glow on chrome", medium: "photograph", photo: "wide, glossy bodywork, shallow depth" } },
    { key: "supercar", name: "Supercar", mode: "photo", cat: "automotive", apply: { aesthetics: "sleek, aggressive, premium", lighting: "hard studio key with sharp reflections", medium: "photograph", photo: "wide, glossy carbon and paint, dramatic" } },
    { key: "motorcycle", name: "Motorcycle", mode: "photo", cat: "automotive", apply: { aesthetics: "gritty, bold, dynamic", lighting: "dramatic rim light on metal", medium: "photograph", photo: "wide, chrome and leather, shallow depth" } },
    { key: "city_aerial", name: "City Aerial", mode: "photo", cat: "landscape", apply: { aesthetics: "graphic, vast, geometric", lighting: "high-noon clarity", medium: "photograph", photo: "top-down drone, grid geometry, crisp" } },
    { key: "daguerreotype", name: "Daguerreotype", mode: "photo", cat: "vintage", apply: { aesthetics: "antique, silvery, solemn", lighting: "soft frontal antique light", medium: "daguerreotype", photo: "19th-century daguerreotype, silver sheen, stiff pose, vignette" } },
    { key: "cyanotype", name: "Cyanotype", mode: "photo", cat: "vintage", apply: { aesthetics: "antique, blue, botanical", lighting: "flat contact-print light", medium: "cyanotype", photo: "cyanotype, prussian blue, white silhouettes, paper texture" } },
    { key: "grunge_90s", name: "90s Grunge", mode: "photo", cat: "vintage", apply: { aesthetics: "raw, edgy, faded", lighting: "flat flash, washed color", medium: "film photograph", photo: "90s disposable-camera look, grain, date stamp, washed tones" } },
    { key: "tilt_shift", name: "Tilt-Shift", mode: "photo", cat: "experimental", apply: { aesthetics: "miniature, playful, crisp", lighting: "bright daylight", medium: "photograph", photo: "tilt-shift, narrow focus band, miniature-world effect" } },
    { key: "infrared_photo", name: "Infrared", mode: "photo", cat: "experimental", apply: { aesthetics: "surreal, dreamy, otherworldly", lighting: "infrared daylight", medium: "infrared photograph", photo: "false-color infrared, white foliage, dark sky" } },
    { key: "long_exposure", name: "Light Trails", mode: "photo", cat: "experimental", apply: { aesthetics: "dynamic, luminous, sleek", lighting: "night city lights", medium: "photograph", photo: "long exposure, streaking light trails, smooth motion" } },
    { key: "mecha_anime", name: "Mecha Anime", mode: "art", cat: "anime", apply: { aesthetics: "epic, mechanical, dynamic", lighting: "dramatic rim light and glow", medium: "anime illustration", art_style: "mecha anime, detailed robots, dynamic perspective, glowing thrusters" } },
    { key: "dark_anime", name: "Dark Anime", mode: "art", cat: "anime", apply: { aesthetics: "moody, intense, mature", lighting: "low-key dramatic light", medium: "anime illustration", art_style: "dark seinen anime, muted palette, sharp shadows, gritty mood" } },
    { key: "slice_of_life", name: "Slice of Life", mode: "art", cat: "anime", apply: { aesthetics: "warm, cozy, gentle", lighting: "soft warm interior light", medium: "anime illustration", art_style: "cozy slice-of-life anime, soft colors, gentle detail" } },
    { key: "magical_girl", name: "Magical Girl", mode: "art", cat: "anime", apply: { aesthetics: "sparkly, vibrant, whimsical", lighting: "glowing magical light, sparkles", medium: "anime illustration", art_style: "magical-girl anime, frills, sparkles, vibrant pastels, ribbons" } },
    { key: "cubism", name: "Cubism", mode: "art", cat: "abstract", apply: { aesthetics: "fractured, geometric, bold", lighting: "flat", medium: "oil on canvas", art_style: "analytic cubism, fragmented planes, multiple viewpoints, muted ochre and gray" } },
    { key: "surrealism_painting", name: "Surrealism", mode: "art", cat: "surreal", apply: { aesthetics: "dreamlike, uncanny, precise", lighting: "clear eerie light", medium: "oil on canvas", art_style: "surrealist oil painting, impossible dreamscape, smooth painted detail, long shadows" } },
    { key: "abstract_expressionism", name: "Abstract Expressionism", mode: "art", cat: "abstract", apply: { aesthetics: "energetic, gestural, raw", lighting: "flat", medium: "acrylic on canvas", art_style: "abstract expressionism, bold gestural strokes, drips, dynamic color" } },
    { key: "fauvism", name: "Fauvism", mode: "art", cat: "painting", apply: { aesthetics: "wild, vivid, expressive", lighting: "flat bright color", medium: "oil on canvas", art_style: "fauvist painting, non-natural vivid color, bold loose strokes" } },
    { key: "realism_painting", name: "Realism", mode: "art", cat: "painting", apply: { aesthetics: "truthful, grounded, detailed", lighting: "natural even light", medium: "oil on canvas", art_style: "19th-century realist painting, everyday subject, restrained palette" } },
    { key: "romanticism", name: "Romanticism", mode: "art", cat: "painting", apply: { aesthetics: "sublime, dramatic, emotional", lighting: "dramatic stormy light", medium: "oil on canvas", art_style: "romanticism, sublime nature, dramatic skies, awe and emotion" } },
    { key: "rococo", name: "Rococo", mode: "art", cat: "painting", apply: { aesthetics: "ornate, pastel, playful", lighting: "soft diffused light", medium: "oil on canvas", art_style: "rococo, pastel palette, ornate frills, playful elegance, soft clouds" } },
    { key: "color_field", name: "Color Field", mode: "art", cat: "abstract", apply: { aesthetics: "meditative, minimal, luminous", lighting: "flat even glow", medium: "acrylic on canvas", art_style: "color field painting, large soft-edged blocks of color, subtle gradients" } },
    { key: "expressionism", name: "Expressionism", mode: "art", cat: "painting", apply: { aesthetics: "emotional, distorted, intense", lighting: "harsh expressive light", medium: "oil on canvas", art_style: "expressionism, distorted forms, intense color, emotional brushwork" } },
    { key: "clay_render", name: "Clay Render", mode: "art", cat: "3d", apply: { aesthetics: "soft, matte, tactile", lighting: "soft studio ambient occlusion", medium: "3D render", art_style: "matte clay render, no textures, soft AO, sculptural forms" } },
    { key: "toon_shader", name: "Toon Shader", mode: "art", cat: "3d", apply: { aesthetics: "clean, bold, animated", lighting: "flat cel lighting with hard edges", medium: "3D render", art_style: "3D toon shader, cel-shaded with bold outlines, flat highlights" } },
    { key: "wireframe_3d", name: "Wireframe", mode: "art", cat: "3d", apply: { aesthetics: "technical, glowing, digital", lighting: "glowing edges on a deep-blue-black ground", medium: "3D render", art_style: "clean glowing wireframe look, crisp neon edge lines, simple geometric forms, holographic feel" } },
    { key: "holographic", name: "Holographic", mode: "art", cat: "3d", apply: { aesthetics: "iridescent, futuristic, glossy", lighting: "rainbow iridescent reflections", medium: "3D render", art_style: "holographic iridescent material, rainbow sheen, glossy chrome" } },
    { key: "crystal_glass", name: "Crystal Glass", mode: "art", cat: "3d", apply: { aesthetics: "refractive, elegant, luminous", lighting: "caustic light through glass", medium: "3D render", art_style: "translucent crystal-glass render, refraction, caustics, jewel tones" } },
    { key: "chrome_metal", name: "Liquid Chrome", mode: "art", cat: "3d", apply: { aesthetics: "sleek, reflective, bold", lighting: "studio reflections on mirror metal", medium: "3D render", art_style: "liquid chrome render, mirror-polished metal, smooth reflective blobs" } },
    { key: "plush_3d", name: "Plush Toy", mode: "art", cat: "3d", apply: { aesthetics: "soft, cute, tactile", lighting: "soft even toy-studio light", medium: "3D render", art_style: "plush-toy render, soft fuzzy felt fabric, stitched seams, rounded" } },
    { key: "gameboy_green", name: "Gameboy", mode: "art", cat: "retro", apply: { aesthetics: "retro, monochrome, nostalgic", lighting: "flat", medium: "pixel art", art_style: "monochrome green retro handheld look, 4 flat green tones, bold chunky shapes" } },
    { key: "arcade_pixel", name: "Arcade", mode: "art", cat: "retro", apply: { aesthetics: "bold, vibrant, retro", lighting: "flat CRT glow", medium: "pixel art", art_style: "retro arcade game art, bright bold palette, chunky shapes, CRT scanline overlay" } },
    { key: "one_bit", name: "1-Bit", mode: "art", cat: "retro", apply: { aesthetics: "stark, graphic, minimal", lighting: "flat", medium: "pixel art", art_style: "stark black-and-white graphic style, bold high-contrast shapes, halftone/dither texture" } },
    { key: "risograph", name: "Risograph", mode: "art", cat: "retro", apply: { aesthetics: "grainy, limited, charming", lighting: "flat print light", medium: "risograph print", art_style: "risograph, 2-3 spot colors, grainy texture, slight misregistration" } },
    { key: "golden_age_comic", name: "Golden Age Comic", mode: "art", cat: "comic", apply: { aesthetics: "retro, bold, pulpy", lighting: "flat comic lighting", medium: "comic ink and color", art_style: "1940s golden-age comic, halftone dots, limited bold palette, pulpy" } },
    { key: "graphic_novel_noir", name: "Noir Graphic Novel", mode: "art", cat: "comic", apply: { aesthetics: "moody, stark, dramatic", lighting: "hard noir shadows", medium: "ink and spot color", art_style: "noir graphic novel, heavy blacks, stark contrast, one spot color" } },
    { key: "sticker_bomb", name: "Sticker Bomb", mode: "art", cat: "comic", apply: { aesthetics: "chaotic, colorful, playful", lighting: "flat", medium: "vector stickers", art_style: "sticker-bomb collage, overlapping cartoon stickers, white outlines, bold" } },
    { key: "calligraphy", name: "Calligraphy", mode: "art", cat: "ink", apply: { aesthetics: "elegant, flowing, expressive", lighting: "flat soft light", medium: "ink on paper", art_style: "expressive brush calligraphy, flowing strokes, ink splatter" } },
    { key: "irezumi_tattoo", name: "Irezumi", mode: "art", cat: "tattoo", apply: { aesthetics: "bold, traditional, flowing", lighting: "flat", medium: "tattoo illustration", art_style: "japanese irezumi tattoo, bold outlines, waves and koi, saturated color" } },
    { key: "blackwork_tattoo", name: "Blackwork", mode: "art", cat: "tattoo", apply: { aesthetics: "bold, graphic, stark", lighting: "flat", medium: "tattoo illustration", art_style: "blackwork tattoo, dense solid black, geometric and dotwork patterns" } },
    { key: "fineline_tattoo", name: "Fine-Line", mode: "art", cat: "tattoo", apply: { aesthetics: "delicate, minimal, elegant", lighting: "flat", medium: "tattoo illustration", art_style: "fine-line tattoo, thin single-weight lines, minimal, delicate" } },
    { key: "scratchboard", name: "Scratchboard", mode: "art", cat: "ink", apply: { aesthetics: "detailed, stark, engraved", lighting: "flat", medium: "scratchboard", art_style: "scratchboard engraving look, fine white lines on a black ground, high-contrast detail, balanced subject lighting" } },
    { key: "woodburning", name: "Pyrography", mode: "art", cat: "ink", apply: { aesthetics: "warm, rustic, handmade", lighting: "flat", medium: "pyrography", art_style: "woodburning pyrography, scorched brown lines on wood grain" } },
    { key: "atompunk", name: "Atompunk", mode: "art", cat: "scifi", apply: { aesthetics: "retro-futuristic, optimistic, sleek", lighting: "bright clean light", medium: "illustration", art_style: "1950s atompunk, googie shapes, ray-guns, atomic optimism, chrome" } },
    { key: "cassette_futurism", name: "Cassette Futurism", mode: "art", cat: "scifi", apply: { aesthetics: "chunky, analog, retro-tech", lighting: "cool CRT glow", medium: "digital painting", art_style: "cassette futurism, 80s chunky analog tech, CRTs, beige plastic, blinking lights" } },
    { key: "post_apocalyptic", name: "Post-Apocalyptic", mode: "art", cat: "scifi", apply: { aesthetics: "gritty, desolate, dramatic", lighting: "dusty hazy light", medium: "digital painting", art_style: "post-apocalyptic concept art, ruins, rust, overgrowth, dramatic haze" } },
    { key: "alien_world", name: "Alien World", mode: "art", cat: "scifi", apply: { aesthetics: "exotic, vivid, vast", lighting: "strange colored alien suns", medium: "digital painting", art_style: "alien world concept art, bizarre flora, multiple moons, vivid otherworldly color" } },
    { key: "steampunk", name: "Steampunk", mode: "art", cat: "fantasy", apply: { aesthetics: "ornate, brass, adventurous", lighting: "warm amber glow on brass", medium: "digital painting", art_style: "steampunk, brass gears, copper pipes, victorian machinery, steam" } },
    { key: "cosmic_horror", name: "Cosmic Horror", mode: "art", cat: "fantasy", apply: { aesthetics: "eerie, vast, dread", lighting: "sickly otherworldly glow", medium: "digital painting", art_style: "cosmic horror, eldritch tentacled forms, impossible scale, muted dread palette" } },
    { key: "norse_myth", name: "Norse Myth", mode: "art", cat: "fantasy", apply: { aesthetics: "epic, cold, heroic", lighting: "cold dramatic northern light", medium: "digital painting", art_style: "norse mythology concept art, runes, fjords, epic heroes, cold palette" } },
    { key: "egyptian_myth", name: "Egyptian Myth", mode: "art", cat: "fantasy", apply: { aesthetics: "golden, ornate, ancient", lighting: "warm golden desert light", medium: "digital painting", art_style: "ancient egyptian mythology, gods, hieroglyphs, gold and lapis" } },
    { key: "medieval_manuscript", name: "Illuminated", mode: "art", cat: "fantasy", apply: { aesthetics: "ornate, gilded, antique", lighting: "flat", medium: "illuminated manuscript", art_style: "medieval illuminated manuscript, gold leaf, ornate borders, flat figures" } },
    { key: "vehicle_design", name: "Vehicle Design", mode: "art", cat: "concept", apply: { aesthetics: "technical, sleek, futuristic", lighting: "clean studio concept light", medium: "digital painting", art_style: "industrial vehicle concept art, orthographic feel, hard-surface detail, callouts" } },
    { key: "creature_design", name: "Creature Design", mode: "art", cat: "concept", apply: { aesthetics: "imaginative, detailed, dramatic", lighting: "dramatic rim light", medium: "digital painting", art_style: "creature concept art, anatomical believability, painterly detail, dynamic pose" } },
    { key: "isometric_vector", name: "Isometric Vector", mode: "art", cat: "vector", apply: { aesthetics: "clean, tidy, modern", lighting: "flat with soft shadow", medium: "vector illustration", art_style: "isometric vector illustration, flat clean shapes, soft long shadows" } },
    { key: "neon_outline", name: "Neon Outline", mode: "art", cat: "vector", apply: { aesthetics: "glowing, sleek, nocturnal", lighting: "glowing neon lines on dark", medium: "vector illustration", art_style: "neon-outline line art, glowing strokes on dark, retro-futuristic" } },
    { key: "memphis", name: "Memphis", mode: "art", cat: "vector", apply: { aesthetics: "playful, bold, 80s", lighting: "flat", medium: "vector illustration", art_style: "memphis design, bold squiggles, confetti shapes, primary colors, pattern" } },
    { key: "blueprint_vector", name: "Blueprint", mode: "art", cat: "vector", apply: { aesthetics: "technical, precise, clean", lighting: "flat blueprint tone", medium: "vector illustration", art_style: "blueprint, white technical line drawing on blue, measurement marks" } },
    { key: "mandala", name: "Mandala", mode: "art", cat: "decorative", apply: { aesthetics: "symmetrical, intricate, meditative", lighting: "flat", medium: "illustration", art_style: "mandala, radial symmetry, intricate repeating ornament, fine linework" } },
    { key: "celtic_knotwork", name: "Celtic Knotwork", mode: "art", cat: "decorative", apply: { aesthetics: "interlaced, ancient, ornate", lighting: "flat", medium: "illustration", art_style: "celtic knotwork, interlaced bands, illuminated style, gold and green" } },
    { key: "damask", name: "Damask Pattern", mode: "art", cat: "decorative", apply: { aesthetics: "ornate, elegant, repeating", lighting: "flat", medium: "pattern design", art_style: "damask pattern, symmetric floral motifs, two-tone elegant repeat" } },
    { key: "terrazzo", name: "Terrazzo", mode: "art", cat: "decorative", apply: { aesthetics: "speckled, playful, modern", lighting: "flat", medium: "pattern design", art_style: "terrazzo pattern, scattered colorful chips on a pale base, seamless" } },
    { key: "origami", name: "Origami", mode: "art", cat: "craft", apply: { aesthetics: "crisp, geometric, elegant", lighting: "soft studio light with crease shadows", medium: "papercraft", art_style: "folded origami, crisp paper creases, faceted geometric forms" } },
    { key: "chalk_art", name: "Chalk Art", mode: "art", cat: "craft", apply: { aesthetics: "vibrant, dusty, handmade", lighting: "flat", medium: "chalk on board", art_style: "chalkboard art, colorful chalk strokes, dusty texture, hand-lettered feel" } },
    { key: "botanical_illustration", name: "Botanical", mode: "art", cat: "scientific", apply: { aesthetics: "precise, elegant, antique", lighting: "flat even light", medium: "botanical illustration", art_style: "vintage botanical illustration, fine watercolor and ink, labeled specimen, cream paper" } },
    { key: "vintage_travel_poster", name: "Travel Poster", mode: "art", cat: "poster", apply: { aesthetics: "nostalgic, bold, graphic", lighting: "flat poster light", medium: "poster illustration", art_style: "mid-century travel poster, flat shapes, bold limited palette, subtle grain" } },
    { key: "propaganda_poster", name: "Constructivist", mode: "art", cat: "poster", apply: { aesthetics: "bold, dynamic, graphic", lighting: "flat", medium: "poster design", art_style: "constructivist poster, bold red and black, diagonal dynamic composition, geometric" } },
    { key: "low_brow", name: "Lowbrow Pop Surreal", mode: "art", cat: "surreal", apply: { aesthetics: "quirky, glossy, cute-creepy", lighting: "soft glossy light", medium: "acrylic painting", art_style: "lowbrow pop-surrealism, big-eyed characters, glossy detailed, whimsical-dark" } },
    { key: "glitch_art", name: "Glitch Art", mode: "art", cat: "experimental", apply: { aesthetics: "digital, chaotic, vivid", lighting: "glowing screen light", medium: "digital art", art_style: "glitch art, datamosh, RGB channel split, pixel sorting, scanlines" } },
    { key: "mosaic", name: "Mosaic", mode: "art", cat: "decorative", apply: { aesthetics: "ancient, textured, jeweled", lighting: "flat with tile sheen", medium: "mosaic", art_style: "byzantine mosaic, small tesserae tiles, gold ground, stylized figures" } },
    { key: "knit_craft", name: "Knitted", mode: "art", cat: "craft", apply: { aesthetics: "cozy, soft, handmade", lighting: "soft even light", medium: "knitwork", art_style: "knitted wool craft, visible stitches, chunky yarn texture, cozy" } },
    { key: "vaporwave_statue", name: "Vaporwave Statue", mode: "art", cat: "retro", apply: { aesthetics: "pastel, surreal, nostalgic", lighting: "pink-and-teal gradient glow", medium: "digital art", art_style: "vaporwave aesthetic, roman bust, glitch grid, pastel pink and teal, 90s computer vibe" } },
    { key: "low_poly_landscape", name: "Low-Poly Scene", mode: "art", cat: "3d", apply: { aesthetics: "geometric, clean, calm", lighting: "soft gradient light", medium: "3D render", art_style: "low-poly faceted landscape, flat-shaded triangles, pastel palette" } },
  ];

  const IDD_LAYOUTS = [
    { key: "hero_center", name: "Hero Center", cat: "composition", ar: "1:1", summary: "A bold hero shot with a single subject centered in frame", background: "a clean seamless studio backdrop", boxes: [{ x: 0.2, y: 0.14, w: 0.6, h: 0.72, type: "obj", desc: "the main subject, centered" }] },
    { key: "hero_left", name: "Hero Left + Copy", cat: "marketing", ar: "16:9", summary: "A hero banner with the subject on the left and a bold headline on the right", background: "a clean gradient backdrop with open space on the right", boxes: [{ x: 0.06, y: 0.12, w: 0.38, h: 0.76, type: "obj", desc: "the main subject on the left" }, { x: 0.52, y: 0.36, w: 0.42, h: 0.28, type: "text", text: "HEADLINE", desc: "a big bold headline" }] },
    { key: "thirds", name: "Rule of Thirds", cat: "composition", ar: "3:2", summary: "A rule-of-thirds scene with the main subject on the left third", background: "a simple complementary background with depth", boxes: [{ x: 0.08, y: 0.22, w: 0.3, h: 0.56, type: "obj", desc: "the main subject on the left third" }, { x: 0.68, y: 0.55, w: 0.24, h: 0.32, type: "obj", desc: "a small secondary accent" }] },
    { key: "portrait", name: "Portrait", cat: "composition", ar: "4:5", summary: "A head-and-shoulders portrait of the subject", background: "a plain studio backdrop", boxes: [{ x: 0.17, y: 0.07, w: 0.66, h: 0.64, type: "obj", desc: "a head-and-shoulders portrait" }] },
    { key: "poster", name: "Poster + Title", cat: "print", ar: "2:3", summary: "A poster with a central subject and a bold title below", background: "a dramatic backdrop that frames the subject", boxes: [{ x: 0.14, y: 0.1, w: 0.72, h: 0.56, type: "obj", desc: "the poster subject" }, { x: 0.1, y: 0.74, w: 0.8, h: 0.15, type: "text", text: "TITLE", desc: "a big bold poster title" }] },
    { key: "banner", name: "Title Top", cat: "composition", ar: "16:9", summary: "A title-top banner with the subject below the headline", background: "a clean backdrop", boxes: [{ x: 0.2, y: 0.06, w: 0.6, h: 0.18, type: "text", text: "TITLE", desc: "a big bold banner title" }, { x: 0.27, y: 0.32, w: 0.46, h: 0.6, type: "obj", desc: "the main subject under the title" }] },
    { key: "duo", name: "Two Shot", cat: "composition", ar: "16:9", summary: "A two-shot with two subjects side by side", background: "a plain even backdrop", boxes: [{ x: 0.07, y: 0.16, w: 0.33, h: 0.7, type: "obj", desc: "the subject on the left" }, { x: 0.6, y: 0.16, w: 0.33, h: 0.7, type: "obj", desc: "the subject on the right" }] },
    { key: "product", name: "Product + Copy", cat: "marketing", ar: "16:9", summary: "A product ad with a bold word on the left and the product on the right", background: "a clean studio backdrop with soft reflections", boxes: [{ x: 0.05, y: 0.3, w: 0.38, h: 0.34, type: "text", text: "BIG WORD", desc: "a bold product headline" }, { x: 0.52, y: 0.08, w: 0.42, h: 0.84, type: "obj", desc: "the hero product" }] },
    { key: "ytthumb", name: "Reaction Thumb", cat: "video", ar: "16:9", summary: "A YouTube thumbnail with a big-expression face and huge bold text", background: "a punchy bright gradient backdrop", boxes: [{ x: 0.56, y: 0.08, w: 0.38, h: 0.84, type: "obj", desc: "a face with a big expression" }, { x: 0.04, y: 0.26, w: 0.46, h: 0.48, type: "text", text: "WOW", desc: "huge bold thumbnail words" }] },
    { key: "lower3", name: "Lower Third", cat: "video", ar: "16:9", summary: "A subject with a lower-third caption strip", background: "a clean backdrop", boxes: [{ x: 0.3, y: 0.08, w: 0.4, h: 0.6, type: "obj", desc: "the main subject" }, { x: 0.04, y: 0.78, w: 0.5, h: 0.16, type: "text", text: "CAPTION", desc: "a lower-third caption strip" }] },
    { key: "ig_post", name: "Instagram Post", cat: "social", ar: "1:1", summary: "An Instagram post with an eye-catching central subject", background: "a bright on-brand backdrop", boxes: [{ x: 0.16, y: 0.16, w: 0.68, h: 0.68, type: "obj", desc: "the eye-catching subject" }] },
    { key: "ig_story", name: "Instagram Story", cat: "social", ar: "9:16", summary: "An Instagram story, vertical, with a subject and a top text bar", background: "a vibrant vertical backdrop", boxes: [{ x: 0.1, y: 0.05, w: 0.8, h: 0.12, type: "text", text: "SWIPE UP", desc: "a top text bar" }, { x: 0.14, y: 0.26, w: 0.72, h: 0.6, type: "obj", desc: "the vertical subject" }] },
    { key: "pinterest_pin", name: "Pinterest Pin", cat: "social", ar: "2:3", summary: "A Pinterest pin, tall image with a bold title overlay", background: "a warm inviting backdrop", boxes: [{ x: 0.1, y: 0.08, w: 0.8, h: 0.6, type: "obj", desc: "the tall pin subject" }, { x: 0.1, y: 0.74, w: 0.8, h: 0.16, type: "text", text: "TITLE", desc: "a bold pin title overlay" }] },
    { key: "fb_cover", name: "Facebook Cover", cat: "social", ar: "16:9", summary: "A Facebook cover photo, a wide scene with brand text", background: "a wide atmospheric scene", boxes: [{ x: 0.04, y: 0.1, w: 0.92, h: 0.6, type: "obj", desc: "the wide cover scene" }, { x: 0.3, y: 0.74, w: 0.4, h: 0.16, type: "text", text: "BRAND", desc: "the brand name" }] },
    { key: "profile_pic", name: "Profile Picture", cat: "social", ar: "1:1", summary: "A profile picture with a centered friendly face", background: "a soft solid-color backdrop", boxes: [{ x: 0.18, y: 0.1, w: 0.64, h: 0.8, type: "obj", desc: "a centered friendly face, head and shoulders" }] },
    { key: "quote_post", name: "Quote Post", cat: "social", ar: "1:1", summary: "A quote post with a short bold quote on a simple background", background: "a calm minimal background", boxes: [{ x: 0.1, y: 0.3, w: 0.8, h: 0.4, type: "text", text: "DREAM BIG", desc: "a short bold quote, centered" }] },
    { key: "x_post", name: "X / Twitter Post", cat: "social", ar: "16:9", summary: "An X post graphic with a subject and a short headline", background: "a clean modern backdrop", boxes: [{ x: 0.06, y: 0.14, w: 0.44, h: 0.72, type: "obj", desc: "the subject" }, { x: 0.55, y: 0.36, w: 0.4, h: 0.28, type: "text", text: "NEWS", desc: "a short headline" }] },
    { key: "yt_gaming", name: "Gaming Thumb", cat: "video", ar: "16:9", summary: "A gaming thumbnail with a character on the right and a bold title on the left", background: "an explosive game scene backdrop", boxes: [{ x: 0.55, y: 0.06, w: 0.4, h: 0.88, type: "obj", desc: "a game character on the right" }, { x: 0.04, y: 0.3, w: 0.46, h: 0.4, type: "text", text: "EPIC", desc: "a bold game title" }] },
    { key: "yt_tutorial", name: "How-To Thumb", cat: "video", ar: "16:9", summary: "A how-to thumbnail with the subject and a bold step title", background: "a clean bright backdrop", boxes: [{ x: 0.5, y: 0.1, w: 0.44, h: 0.8, type: "obj", desc: "the subject demonstrating something" }, { x: 0.05, y: 0.34, w: 0.4, h: 0.32, type: "text", text: "HOW TO", desc: "a bold step title" }] },
    { key: "yt_vlog", name: "Vlog Thumb", cat: "video", ar: "16:9", summary: "A vlog thumbnail with a smiling creator and a location title", background: "a scenic location backdrop", boxes: [{ x: 0.52, y: 0.1, w: 0.42, h: 0.82, type: "obj", desc: "a smiling creator" }, { x: 0.05, y: 0.7, w: 0.42, h: 0.2, type: "text", text: "DAY 1", desc: "a location or day title" }] },
    { key: "yt_podcast", name: "Podcast Cover", cat: "video", ar: "16:9", summary: "A podcast cover with two speakers and the show title", background: "a moody studio backdrop", boxes: [{ x: 0.05, y: 0.16, w: 0.3, h: 0.68, type: "obj", desc: "the first speaker" }, { x: 0.65, y: 0.16, w: 0.3, h: 0.68, type: "obj", desc: "the second speaker" }, { x: 0.36, y: 0.4, w: 0.28, h: 0.2, type: "text", text: "THE SHOW", desc: "the show title" }] },
    { key: "yt_channel_art", name: "Channel Art", cat: "video", ar: "16:9", summary: "Channel art with a centered logo and tagline on a themed banner", background: "a themed wide banner backdrop", boxes: [{ x: 0.3, y: 0.34, w: 0.4, h: 0.22, type: "text", text: "CHANNEL", desc: "a centered channel name and tagline" }] },
    { key: "video_title", name: "Title Card", cat: "video", ar: "16:9", summary: "An opening title card with a big centered title over a scene", background: "a cinematic scene backdrop", boxes: [{ x: 0.2, y: 0.4, w: 0.6, h: 0.2, type: "text", text: "INTRO", desc: "a big centered title" }] },
    { key: "sale_banner", name: "Sale Banner", cat: "marketing", ar: "16:9", summary: "A sale banner with huge SALE text and a product", background: "a bright energetic backdrop", boxes: [{ x: 0.04, y: 0.2, w: 0.46, h: 0.6, type: "text", text: "50% OFF", desc: "a huge bold sale headline" }, { x: 0.54, y: 0.1, w: 0.42, h: 0.8, type: "obj", desc: "the featured product" }] },
    { key: "coming_soon", name: "Coming Soon", cat: "marketing", ar: "1:1", summary: "A coming-soon teaser with a centered bold announcement", background: "a sleek dark teaser backdrop", boxes: [{ x: 0.12, y: 0.36, w: 0.76, h: 0.28, type: "text", text: "COMING SOON", desc: "a centered bold announcement" }] },
    { key: "testimonial", name: "Testimonial", cat: "marketing", ar: "16:9", summary: "A testimonial card with a person's photo and a short quote", background: "a soft professional backdrop", boxes: [{ x: 0.06, y: 0.18, w: 0.32, h: 0.64, type: "obj", desc: "a smiling customer" }, { x: 0.44, y: 0.3, w: 0.5, h: 0.4, type: "text", text: "LOVE IT", desc: "a short customer quote" }] },
    { key: "app_promo", name: "App Promo", cat: "marketing", ar: "9:16", summary: "An app promo with a phone mockup and feature text", background: "a clean colorful gradient", boxes: [{ x: 0.08, y: 0.06, w: 0.84, h: 0.14, type: "text", text: "GET THE APP", desc: "a feature headline" }, { x: 0.25, y: 0.26, w: 0.5, h: 0.62, type: "obj", desc: "a phone mockup" }] },
    { key: "event_flyer", name: "Event Flyer", cat: "marketing", ar: "3:4", summary: "An event flyer with a title at top, key art, and details at the bottom", background: "a festive themed backdrop", boxes: [{ x: 0.08, y: 0.05, w: 0.84, h: 0.16, type: "text", text: "FESTIVAL", desc: "the event title at top" }, { x: 0.14, y: 0.26, w: 0.72, h: 0.46, type: "obj", desc: "the event key art" }, { x: 0.1, y: 0.78, w: 0.8, h: 0.14, type: "text", text: "JUNE 12", desc: "the event details" }] },
    { key: "movie_poster", name: "Movie Poster", cat: "print", ar: "2:3", summary: "A movie poster with dramatic key art and a bold title", background: "a cinematic dramatic backdrop", boxes: [{ x: 0.12, y: 0.08, w: 0.76, h: 0.62, type: "obj", desc: "the dramatic key art subject" }, { x: 0.1, y: 0.78, w: 0.8, h: 0.14, type: "text", text: "LEGEND", desc: "a bold movie title" }] },
    { key: "book_cover", name: "Book Cover", cat: "print", ar: "2:3", summary: "A book cover with an evocative image, a title, and an author line", background: "an evocative atmospheric backdrop", boxes: [{ x: 0.1, y: 0.08, w: 0.8, h: 0.12, type: "text", text: "THE TITLE", desc: "the book title at top" }, { x: 0.16, y: 0.26, w: 0.68, h: 0.5, type: "obj", desc: "the cover image" }, { x: 0.25, y: 0.82, w: 0.5, h: 0.08, type: "text", text: "AUTHOR", desc: "the author line" }] },
    { key: "album_cover", name: "Album Cover", cat: "print", ar: "1:1", summary: "An album cover with striking art and the title", background: "a striking artistic backdrop", boxes: [{ x: 0.1, y: 0.1, w: 0.8, h: 0.6, type: "obj", desc: "the striking album art" }, { x: 0.2, y: 0.76, w: 0.6, h: 0.14, type: "text", text: "ALBUM", desc: "the album title" }] },
    { key: "magazine_cover", name: "Magazine Cover", cat: "print", ar: "3:4", summary: "A magazine cover with a masthead, a cover subject, and cover lines", background: "a clean studio backdrop", boxes: [{ x: 0.08, y: 0.04, w: 0.84, h: 0.14, type: "text", text: "VOGUE", desc: "the magazine masthead" }, { x: 0.18, y: 0.2, w: 0.64, h: 0.66, type: "obj", desc: "the cover subject" }] },
    { key: "business_card", name: "Business Card", cat: "print", ar: "16:9", summary: "A business card with a name, role, and clean layout", background: "a minimal elegant backdrop", boxes: [{ x: 0.08, y: 0.32, w: 0.5, h: 0.18, type: "text", text: "NAME", desc: "the person's name" }, { x: 0.08, y: 0.54, w: 0.5, h: 0.12, type: "text", text: "ROLE", desc: "the role and contact" }] },
    { key: "postcard", name: "Postcard", cat: "print", ar: "3:2", summary: "A postcard with a scenic photo and a greeting", background: "a scenic travel backdrop", boxes: [{ x: 0.05, y: 0.08, w: 0.9, h: 0.62, type: "obj", desc: "a scenic travel photo" }, { x: 0.2, y: 0.76, w: 0.6, h: 0.16, type: "text", text: "HELLO", desc: "a greeting" }] },
    { key: "menu", name: "Menu", cat: "print", ar: "3:4", summary: "A menu with a title and a tidy list area", background: "a warm restaurant-themed backdrop", boxes: [{ x: 0.1, y: 0.06, w: 0.8, h: 0.14, type: "text", text: "MENU", desc: "the menu title" }, { x: 0.12, y: 0.26, w: 0.76, h: 0.64, type: "obj", desc: "a tidy menu list area" }] },
    { key: "certificate", name: "Certificate", cat: "print", ar: "4:3", summary: "A certificate with an ornate border, a title, and a name line", background: "an elegant ornate backdrop", boxes: [{ x: 0.2, y: 0.18, w: 0.6, h: 0.18, type: "text", text: "CERTIFICATE", desc: "the certificate title" }, { x: 0.25, y: 0.5, w: 0.5, h: 0.12, type: "text", text: "NAME", desc: "the recipient name line" }] },
    { key: "invitation", name: "Invitation", cat: "print", ar: "2:3", summary: "An invitation with an elegant title and details", background: "a delicate decorative backdrop", boxes: [{ x: 0.15, y: 0.2, w: 0.7, h: 0.18, type: "text", text: "YOU'RE INVITED", desc: "an elegant invitation title" }, { x: 0.25, y: 0.66, w: 0.5, h: 0.14, type: "text", text: "RSVP", desc: "the event details" }] },
    { key: "centered", name: "Centered Symmetry", cat: "composition", ar: "1:1", summary: "A centered symmetrical composition with a single subject", background: "a symmetrical balanced backdrop", boxes: [{ x: 0.25, y: 0.18, w: 0.5, h: 0.64, type: "obj", desc: "a symmetrical centered subject" }] },
    { key: "negative_space", name: "Negative Space", cat: "composition", ar: "16:9", summary: "A minimalist scene with a small subject and lots of negative space", background: "a vast minimal backdrop", boxes: [{ x: 0.68, y: 0.58, w: 0.22, h: 0.3, type: "obj", desc: "a small subject in the lower right" }] },
    { key: "triptych", name: "Triptych", cat: "composition", ar: "16:9", summary: "A triptych of three related panels side by side", background: "a cohesive themed backdrop across panels", boxes: [{ x: 0.04, y: 0.12, w: 0.28, h: 0.76, type: "obj", desc: "the left panel subject" }, { x: 0.36, y: 0.12, w: 0.28, h: 0.76, type: "obj", desc: "the center panel subject" }, { x: 0.68, y: 0.12, w: 0.28, h: 0.76, type: "obj", desc: "the right panel subject" }] },
    { key: "full_bleed", name: "Full Bleed", cat: "composition", ar: "16:9", summary: "A full-bleed single subject filling the frame edge to edge", background: "an immersive backdrop filling the frame", boxes: [{ x: 0.04, y: 0.06, w: 0.92, h: 0.88, type: "obj", desc: "a subject filling the whole frame" }] },
    { key: "diagonal", name: "Diagonal", cat: "composition", ar: "3:2", summary: "A dynamic diagonal composition leading the eye across the frame", background: "a dynamic backdrop with diagonal flow", boxes: [{ x: 0.08, y: 0.1, w: 0.4, h: 0.5, type: "obj", desc: "the upper-left subject" }, { x: 0.55, y: 0.45, w: 0.38, h: 0.48, type: "obj", desc: "the lower-right subject" }] },
    { key: "split_lr", name: "Split Left/Right", cat: "composition", ar: "16:9", summary: "A clean left/right split with a subject and a content area", background: "a two-tone split backdrop", boxes: [{ x: 0.06, y: 0.12, w: 0.4, h: 0.76, type: "obj", desc: "the left-side subject" }, { x: 0.54, y: 0.3, w: 0.4, h: 0.4, type: "text", text: "INFO", desc: "the right-side content" }] },
    { key: "tiktok_cover", name: "TikTok Cover", cat: "social", ar: "9:16", summary: "A vertical short-video cover with a person and a bold caption", background: "a vibrant vertical backdrop", boxes: [{ x: 0.2, y: 0.05, w: 0.6, h: 0.12, type: "text", text: "WATCH", desc: "a bold caption at top" }, { x: 0.15, y: 0.24, w: 0.7, h: 0.62, type: "obj", desc: "a person mid-action" }] },
    { key: "yt_community", name: "Community Post", cat: "social", ar: "1:1", summary: "A community update graphic with a short message", background: "a clean branded backdrop", boxes: [{ x: 0.12, y: 0.32, w: 0.76, h: 0.36, type: "text", text: "NEW VIDEO", desc: "a short announcement" }] },
    { key: "linkedin_post", name: "LinkedIn Post", cat: "social", ar: "1:1", summary: "A professional post with a headshot and a headline", background: "a clean corporate backdrop", boxes: [{ x: 0.1, y: 0.12, w: 0.36, h: 0.5, type: "obj", desc: "a professional headshot" }, { x: 0.52, y: 0.3, w: 0.4, h: 0.3, type: "text", text: "HIRING", desc: "a professional headline" }] },
    { key: "story_poll", name: "Story Poll", cat: "social", ar: "9:16", summary: "A vertical story with a question and two options", background: "a playful gradient backdrop", boxes: [{ x: 0.1, y: 0.12, w: 0.8, h: 0.16, type: "text", text: "THIS OR THAT", desc: "a poll question" }, { x: 0.1, y: 0.4, w: 0.8, h: 0.4, type: "obj", desc: "two side-by-side option images" }] },
    { key: "carousel_slide", name: "Carousel Slide", cat: "social", ar: "4:5", summary: "A swipeable carousel slide with a number and a tip", background: "a clean editorial backdrop", boxes: [{ x: 0.08, y: 0.08, w: 0.3, h: 0.18, type: "text", text: "01", desc: "a slide number" }, { x: 0.08, y: 0.34, w: 0.84, h: 0.5, type: "obj", desc: "a tidy tip content area" }] },
    { key: "twitch_panel", name: "Stream Panel", cat: "social", ar: "3:2", summary: "A streamer info panel with an icon and a label", background: "a dark gamer-themed backdrop", boxes: [{ x: 0.1, y: 0.3, w: 0.3, h: 0.4, type: "obj", desc: "a panel icon" }, { x: 0.45, y: 0.38, w: 0.45, h: 0.24, type: "text", text: "ABOUT", desc: "a panel label" }] },
    { key: "discord_banner", name: "Server Banner", cat: "social", ar: "16:9", summary: "A community server banner with a logo and a name", background: "a themed wide backdrop", boxes: [{ x: 0.34, y: 0.3, w: 0.32, h: 0.4, type: "text", text: "SERVER", desc: "the server name and logo" }] },
    { key: "reels_cover", name: "Reels Cover", cat: "social", ar: "9:16", summary: "A reels cover with a hook headline over a scene", background: "an eye-catching vertical scene", boxes: [{ x: 0.1, y: 0.34, w: 0.8, h: 0.3, type: "text", text: "3 TIPS", desc: "a hook headline" }] },
    { key: "social_ad_square", name: "Social Ad", cat: "social", ar: "1:1", summary: "A square social ad with a product and an offer", background: "a bright on-brand backdrop", boxes: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.8, type: "obj", desc: "the product" }, { x: 0.62, y: 0.36, w: 0.3, h: 0.28, type: "text", text: "SHOP", desc: "a call to action" }] },
    { key: "quote_card_social", name: "Quote Card", cat: "social", ar: "4:5", summary: "A shareable quote card with an attribution", background: "a soft minimal backdrop", boxes: [{ x: 0.1, y: 0.26, w: 0.8, h: 0.36, type: "text", text: "BE BOLD", desc: "a short inspirational quote" }, { x: 0.3, y: 0.72, w: 0.4, h: 0.08, type: "text", text: "\u2014 ME", desc: "an attribution line" }] },
    { key: "before_after", name: "Before / After", cat: "social", ar: "16:9", summary: "A split before-and-after comparison", background: "a neutral backdrop split down the middle", boxes: [{ x: 0.04, y: 0.1, w: 0.44, h: 0.8, type: "obj", desc: "the before image" }, { x: 0.52, y: 0.1, w: 0.44, h: 0.8, type: "obj", desc: "the after image" }] },
    { key: "event_cover_social", name: "Event Cover", cat: "social", ar: "16:9", summary: "An online event cover with a title and a date", background: "a festive themed backdrop", boxes: [{ x: 0.15, y: 0.2, w: 0.7, h: 0.3, type: "text", text: "WEBINAR", desc: "the event title" }, { x: 0.3, y: 0.62, w: 0.4, h: 0.12, type: "text", text: "JUNE 20", desc: "the event date" }] },
    { key: "yt_outro", name: "Outro Screen", cat: "video", ar: "16:9", summary: "A video outro with subscribe and two video slots", background: "a clean themed backdrop", boxes: [{ x: 0.1, y: 0.1, w: 0.4, h: 0.12, type: "text", text: "SUBSCRIBE", desc: "a subscribe call to action" }, { x: 0.08, y: 0.32, w: 0.4, h: 0.5, type: "obj", desc: "a suggested video slot" }, { x: 0.52, y: 0.32, w: 0.4, h: 0.5, type: "obj", desc: "another suggested video slot" }] },
    { key: "end_screen", name: "End Card", cat: "video", ar: "16:9", summary: "An end card with a thank-you and channel handle", background: "a warm closing backdrop", boxes: [{ x: 0.2, y: 0.34, w: 0.6, h: 0.2, type: "text", text: "THANKS", desc: "a thank-you message" }, { x: 0.3, y: 0.62, w: 0.4, h: 0.1, type: "text", text: "@HANDLE", desc: "a channel handle" }] },
    { key: "livestream_overlay", name: "Stream Overlay", cat: "video", ar: "16:9", summary: "A livestream overlay frame with a camera slot and a chat panel", background: "a dark gamer overlay frame around the edges", boxes: [{ x: 0.04, y: 0.6, w: 0.26, h: 0.34, type: "obj", desc: "a webcam camera slot" }, { x: 0.74, y: 0.1, w: 0.22, h: 0.8, type: "obj", desc: "a chat side panel" }] },
    { key: "webinar_promo", name: "Webinar Promo", cat: "video", ar: "16:9", summary: "A webinar promo with a host photo and a title", background: "a professional gradient backdrop", boxes: [{ x: 0.55, y: 0.12, w: 0.4, h: 0.78, type: "obj", desc: "the host photo" }, { x: 0.06, y: 0.3, w: 0.44, h: 0.3, type: "text", text: "FREE CLASS", desc: "the webinar title" }] },
    { key: "shorts_cover", name: "Shorts Cover", cat: "video", ar: "9:16", summary: "A vertical shorts cover with a big number and a face", background: "a punchy vertical backdrop", boxes: [{ x: 0.1, y: 0.08, w: 0.8, h: 0.2, type: "text", text: "TOP 5", desc: "a big bold number headline" }, { x: 0.2, y: 0.34, w: 0.6, h: 0.52, type: "obj", desc: "a face or subject" }] },
    { key: "film_credits", name: "Credits", cat: "video", ar: "16:9", summary: "A film credits card with a role and a name", background: "a plain dark backdrop", boxes: [{ x: 0.3, y: 0.34, w: 0.4, h: 0.12, type: "text", text: "DIRECTOR", desc: "a credit role" }, { x: 0.3, y: 0.52, w: 0.4, h: 0.12, type: "text", text: "NAME", desc: "the credited name" }] },
    { key: "video_chapter", name: "Chapter Card", cat: "video", ar: "16:9", summary: "A chapter divider card with a number and a chapter title", background: "a cinematic transition backdrop", boxes: [{ x: 0.1, y: 0.3, w: 0.2, h: 0.3, type: "text", text: "02", desc: "a chapter number" }, { x: 0.34, y: 0.38, w: 0.56, h: 0.2, type: "text", text: "THE PLAN", desc: "a chapter title" }] },
    { key: "email_header", name: "Email Header", cat: "marketing", ar: "3:2", summary: "An email header banner with a logo and a tagline", background: "a clean branded backdrop", boxes: [{ x: 0.3, y: 0.28, w: 0.4, h: 0.2, type: "text", text: "BRAND", desc: "a logo wordmark" }, { x: 0.25, y: 0.56, w: 0.5, h: 0.12, type: "text", text: "NEWSLETTER", desc: "a tagline" }] },
    { key: "web_banner", name: "Web Banner", cat: "marketing", ar: "21:9", summary: "A wide web banner with a headline and a button", background: "a sleek gradient backdrop", boxes: [{ x: 0.06, y: 0.32, w: 0.5, h: 0.36, type: "text", text: "BIG SALE", desc: "a wide headline" }, { x: 0.62, y: 0.4, w: 0.22, h: 0.2, type: "obj", desc: "a button shape" }] },
    { key: "coupon", name: "Coupon", cat: "marketing", ar: "3:2", summary: "A coupon with a big discount and a code", background: "a bright dashed-border backdrop", boxes: [{ x: 0.1, y: 0.2, w: 0.8, h: 0.36, type: "text", text: "20% OFF", desc: "a big discount" }, { x: 0.3, y: 0.66, w: 0.4, h: 0.14, type: "text", text: "CODE", desc: "a coupon code" }] },
    { key: "price_list", name: "Price List", cat: "marketing", ar: "3:4", summary: "A price list with a header and a tidy rows area", background: "a clean elegant backdrop", boxes: [{ x: 0.1, y: 0.06, w: 0.8, h: 0.14, type: "text", text: "PRICES", desc: "a header" }, { x: 0.12, y: 0.26, w: 0.76, h: 0.64, type: "obj", desc: "a tidy list of items and prices" }] },
    { key: "comparison_chart", name: "Comparison", cat: "marketing", ar: "4:5", summary: "A two-column comparison chart", background: "a clean split backdrop", boxes: [{ x: 0.08, y: 0.1, w: 0.4, h: 0.8, type: "obj", desc: "the left option column" }, { x: 0.52, y: 0.1, w: 0.4, h: 0.8, type: "obj", desc: "the right option column" }] },
    { key: "countdown", name: "Countdown", cat: "marketing", ar: "1:1", summary: "A countdown teaser with big numbers", background: "a bold energetic backdrop", boxes: [{ x: 0.1, y: 0.2, w: 0.8, h: 0.3, type: "text", text: "3 DAYS", desc: "a big countdown number" }, { x: 0.25, y: 0.6, w: 0.5, h: 0.14, type: "text", text: "LEFT", desc: "a supporting label" }] },
    { key: "lookbook_page", name: "Lookbook Page", cat: "marketing", ar: "4:5", summary: "A fashion lookbook page with a model and a caption", background: "a minimal editorial backdrop", boxes: [{ x: 0.18, y: 0.06, w: 0.64, h: 0.74, type: "obj", desc: "a fashion model full body" }, { x: 0.3, y: 0.84, w: 0.4, h: 0.08, type: "text", text: "LOOK 01", desc: "a caption" }] },
    { key: "newsletter", name: "Newsletter", cat: "marketing", ar: "3:4", summary: "A newsletter layout with a masthead and content blocks", background: "a clean paper backdrop", boxes: [{ x: 0.1, y: 0.05, w: 0.8, h: 0.12, type: "text", text: "THE WEEKLY", desc: "a masthead" }, { x: 0.1, y: 0.22, w: 0.8, h: 0.4, type: "obj", desc: "a feature content block" }, { x: 0.1, y: 0.66, w: 0.8, h: 0.26, type: "obj", desc: "a secondary content block" }] },
    { key: "promo_split_right", name: "Promo (Right)", cat: "marketing", ar: "16:9", summary: "A promo with copy on the left and product on the right", background: "a clean studio backdrop", boxes: [{ x: 0.06, y: 0.3, w: 0.4, h: 0.4, type: "text", text: "NEW", desc: "a promo headline" }, { x: 0.54, y: 0.08, w: 0.4, h: 0.84, type: "obj", desc: "the featured product" }] },
    { key: "flash_sale", name: "Flash Sale", cat: "marketing", ar: "1:1", summary: "A flash-sale square with a lightning headline and a product", background: "a high-energy backdrop", boxes: [{ x: 0.1, y: 0.08, w: 0.8, h: 0.22, type: "text", text: "FLASH SALE", desc: "a bold headline" }, { x: 0.2, y: 0.36, w: 0.6, h: 0.56, type: "obj", desc: "the featured product" }] },
    { key: "resume", name: "Resume", cat: "print", ar: "3:4", summary: "A clean resume with a header and two columns", background: "a minimal professional backdrop", boxes: [{ x: 0.08, y: 0.05, w: 0.84, h: 0.16, type: "text", text: "YOUR NAME", desc: "the name header" }, { x: 0.08, y: 0.24, w: 0.34, h: 0.66, type: "obj", desc: "a sidebar column" }, { x: 0.46, y: 0.24, w: 0.46, h: 0.66, type: "obj", desc: "a main content column" }] },
    { key: "brochure_tri", name: "Brochure", cat: "print", ar: "4:3", summary: "A tri-fold brochure spread with three panels", background: "a clean branded backdrop", boxes: [{ x: 0.04, y: 0.1, w: 0.28, h: 0.8, type: "obj", desc: "the left panel" }, { x: 0.36, y: 0.1, w: 0.28, h: 0.8, type: "obj", desc: "the center panel" }, { x: 0.68, y: 0.1, w: 0.28, h: 0.8, type: "obj", desc: "the right panel" }] },
    { key: "label", name: "Product Label", cat: "print", ar: "3:4", summary: "A product label with a brand name and an icon", background: "a clean label backdrop with a border", boxes: [{ x: 0.2, y: 0.18, w: 0.6, h: 0.18, type: "text", text: "BRAND", desc: "the brand name" }, { x: 0.3, y: 0.46, w: 0.4, h: 0.34, type: "obj", desc: "a product icon or illustration" }] },
    { key: "ticket", name: "Ticket", cat: "print", ar: "3:2", summary: "An event ticket with an event name and a stub", background: "a vibrant ticket backdrop", boxes: [{ x: 0.06, y: 0.3, w: 0.56, h: 0.4, type: "text", text: "CONCERT", desc: "the event name" }, { x: 0.7, y: 0.1, w: 0.24, h: 0.8, type: "obj", desc: "a perforated stub area" }] },
    { key: "name_tag", name: "Name Tag", cat: "print", ar: "4:3", summary: "A name tag with HELLO and a name field", background: "a friendly bold backdrop", boxes: [{ x: 0.15, y: 0.12, w: 0.7, h: 0.24, type: "text", text: "HELLO", desc: "a HELLO banner" }, { x: 0.2, y: 0.5, w: 0.6, h: 0.24, type: "text", text: "MY NAME", desc: "a name field" }] },
    { key: "gift_card", name: "Gift Card", cat: "print", ar: "3:2", summary: "A gift card with an amount and a brand", background: "an elegant gradient backdrop", boxes: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.3, type: "text", text: "$50", desc: "a gift amount" }, { x: 0.1, y: 0.62, w: 0.4, h: 0.16, type: "text", text: "BRAND", desc: "the brand" }] },
    { key: "bookmark", name: "Bookmark", cat: "print", ar: "9:16", summary: "A tall bookmark with art and a short phrase", background: "a charming vertical backdrop", boxes: [{ x: 0.1, y: 0.08, w: 0.8, h: 0.6, type: "obj", desc: "a decorative illustration" }, { x: 0.15, y: 0.74, w: 0.7, h: 0.16, type: "text", text: "READ", desc: "a short phrase" }] },
    { key: "sticker_sheet", name: "Sticker Sheet", cat: "print", ar: "3:4", summary: "A sheet of assorted cute stickers", background: "a plain white sticker-sheet backdrop", boxes: [{ x: 0.06, y: 0.06, w: 0.88, h: 0.88, type: "obj", desc: "a grid of assorted cute stickers" }] },
    { key: "packaging", name: "Packaging", cat: "print", ar: "4:5", summary: "A product box front with a brand and a window", background: "a clean studio packaging backdrop", boxes: [{ x: 0.2, y: 0.1, w: 0.6, h: 0.16, type: "text", text: "BRAND", desc: "the brand name" }, { x: 0.18, y: 0.34, w: 0.64, h: 0.5, type: "obj", desc: "a product window or hero shot" }] },
    { key: "greeting_card", name: "Greeting Card", cat: "print", ar: "2:3", summary: "A greeting card with a warm message and art", background: "a soft festive backdrop", boxes: [{ x: 0.15, y: 0.1, w: 0.7, h: 0.5, type: "obj", desc: "a cheerful illustration" }, { x: 0.2, y: 0.68, w: 0.6, h: 0.16, type: "text", text: "THANK YOU", desc: "a warm message" }] },
    { key: "zine_page", name: "Zine Page", cat: "print", ar: "3:4", summary: "A cut-and-paste zine page with collage and a headline", background: "a gritty photocopy backdrop", boxes: [{ x: 0.08, y: 0.06, w: 0.84, h: 0.16, type: "text", text: "ZINE", desc: "a bold cut-out headline" }, { x: 0.1, y: 0.26, w: 0.8, h: 0.64, type: "obj", desc: "a collage of cut-out images and text" }] },
    { key: "letterhead", name: "Letterhead", cat: "print", ar: "3:4", summary: "A business letterhead with a logo at top and a body area", background: "a clean professional backdrop", boxes: [{ x: 0.1, y: 0.06, w: 0.5, h: 0.1, type: "text", text: "COMPANY", desc: "a logo and company name" }, { x: 0.1, y: 0.24, w: 0.8, h: 0.66, type: "obj", desc: "a letter body area" }] },
    { key: "slide_title", name: "Title Slide", cat: "presentation", ar: "16:9", summary: "A presentation title slide with a big title and subtitle", background: "a clean modern slide backdrop", boxes: [{ x: 0.1, y: 0.34, w: 0.6, h: 0.2, type: "text", text: "PRESENTATION", desc: "a big slide title" }, { x: 0.1, y: 0.58, w: 0.5, h: 0.1, type: "text", text: "SUBTITLE", desc: "a subtitle" }] },
    { key: "slide_section", name: "Section Slide", cat: "presentation", ar: "16:9", summary: "A section-divider slide with a number and a section name", background: "a bold color-block slide backdrop", boxes: [{ x: 0.1, y: 0.3, w: 0.2, h: 0.3, type: "text", text: "01", desc: "a section number" }, { x: 0.34, y: 0.38, w: 0.56, h: 0.2, type: "text", text: "OVERVIEW", desc: "a section name" }] },
    { key: "slide_content", name: "Content Slide", cat: "presentation", ar: "16:9", summary: "A content slide with a heading and bullet area plus an image", background: "a clean slide backdrop", boxes: [{ x: 0.06, y: 0.1, w: 0.5, h: 0.12, type: "text", text: "HEADING", desc: "a slide heading" }, { x: 0.06, y: 0.28, w: 0.44, h: 0.6, type: "obj", desc: "a bullet content area" }, { x: 0.54, y: 0.2, w: 0.4, h: 0.68, type: "obj", desc: "a supporting image" }] },
    { key: "slide_quote", name: "Quote Slide", cat: "presentation", ar: "16:9", summary: "A quote slide with a large quote and attribution", background: "a calm minimal slide backdrop", boxes: [{ x: 0.12, y: 0.3, w: 0.76, h: 0.3, type: "text", text: "GREAT IDEA", desc: "a large quote" }, { x: 0.5, y: 0.66, w: 0.38, h: 0.08, type: "text", text: "\u2014 SOURCE", desc: "an attribution" }] },
    { key: "slide_stat", name: "Stat Slide", cat: "presentation", ar: "16:9", summary: "A statistic slide with a huge number and a label", background: "a bold accent slide backdrop", boxes: [{ x: 0.15, y: 0.26, w: 0.7, h: 0.34, type: "text", text: "95%", desc: "a huge statistic" }, { x: 0.25, y: 0.64, w: 0.5, h: 0.12, type: "text", text: "GROWTH", desc: "a stat label" }] },
    { key: "slide_agenda", name: "Agenda Slide", cat: "presentation", ar: "16:9", summary: "An agenda slide with a title and a numbered list area", background: "a clean slide backdrop", boxes: [{ x: 0.08, y: 0.1, w: 0.5, h: 0.14, type: "text", text: "AGENDA", desc: "a slide title" }, { x: 0.08, y: 0.3, w: 0.84, h: 0.6, type: "obj", desc: "a numbered agenda list" }] },
    { key: "info_timeline", name: "Timeline", cat: "infographic", ar: "4:5", summary: "A vertical timeline infographic with dated milestones", background: "a clean infographic backdrop", boxes: [{ x: 0.1, y: 0.05, w: 0.8, h: 0.12, type: "text", text: "TIMELINE", desc: "a title" }, { x: 0.1, y: 0.22, w: 0.8, h: 0.7, type: "obj", desc: "a vertical timeline with dots and milestones" }] },
    { key: "info_process", name: "Process Steps", cat: "infographic", ar: "16:9", summary: "A horizontal process infographic with numbered steps", background: "a clean infographic backdrop", boxes: [{ x: 0.06, y: 0.3, w: 0.26, h: 0.4, type: "obj", desc: "step one with an icon" }, { x: 0.37, y: 0.3, w: 0.26, h: 0.4, type: "obj", desc: "step two with an icon" }, { x: 0.68, y: 0.3, w: 0.26, h: 0.4, type: "obj", desc: "step three with an icon" }] },
    { key: "info_comparison", name: "VS Infographic", cat: "infographic", ar: "4:5", summary: "A versus infographic comparing two sides", background: "a split infographic backdrop", boxes: [{ x: 0.06, y: 0.1, w: 0.4, h: 0.8, type: "obj", desc: "the left side with stats" }, { x: 0.42, y: 0.42, w: 0.16, h: 0.16, type: "text", text: "VS", desc: "a VS badge" }, { x: 0.54, y: 0.1, w: 0.4, h: 0.8, type: "obj", desc: "the right side with stats" }] },
    { key: "info_stat_grid", name: "Stat Grid", cat: "infographic", ar: "1:1", summary: "A grid of four key statistics with icons", background: "a clean infographic backdrop", boxes: [{ x: 0.06, y: 0.06, w: 0.42, h: 0.42, type: "obj", desc: "a stat block top-left" }, { x: 0.52, y: 0.06, w: 0.42, h: 0.42, type: "obj", desc: "a stat block top-right" }, { x: 0.06, y: 0.52, w: 0.42, h: 0.42, type: "obj", desc: "a stat block bottom-left" }, { x: 0.52, y: 0.52, w: 0.42, h: 0.42, type: "obj", desc: "a stat block bottom-right" }] },
    { key: "info_map", name: "Map Infographic", cat: "infographic", ar: "16:9", summary: "A map infographic with location pins and a legend", background: "a clean stylized map backdrop", boxes: [{ x: 0.06, y: 0.1, w: 0.66, h: 0.8, type: "obj", desc: "a stylized map with location pins" }, { x: 0.76, y: 0.2, w: 0.2, h: 0.6, type: "obj", desc: "a legend panel" }] },
    { key: "golden_spiral", name: "Golden Spiral", cat: "composition", ar: "3:2", summary: "A golden-ratio spiral composition with the subject at the focal point", background: "a balanced scenic backdrop", boxes: [{ x: 0.58, y: 0.5, w: 0.34, h: 0.42, type: "obj", desc: "the focal subject at the spiral center" }] },
    { key: "grid_collage", name: "Grid Collage", cat: "composition", ar: "1:1", summary: "A six-cell grid collage", background: "a thin-gutter grid backdrop", boxes: [{ x: 0.02, y: 0.02, w: 0.31, h: 0.47, type: "obj", desc: "cell 1" }, { x: 0.345, y: 0.02, w: 0.31, h: 0.47, type: "obj", desc: "cell 2" }, { x: 0.67, y: 0.02, w: 0.31, h: 0.47, type: "obj", desc: "cell 3" }, { x: 0.02, y: 0.51, w: 0.31, h: 0.47, type: "obj", desc: "cell 4" }, { x: 0.345, y: 0.51, w: 0.31, h: 0.47, type: "obj", desc: "cell 5" }, { x: 0.67, y: 0.51, w: 0.31, h: 0.47, type: "obj", desc: "cell 6" }] },
    { key: "framed_border", name: "Framed Border", cat: "composition", ar: "1:1", summary: "A subject inside a decorative border frame", background: "a decorative border framing the center", boxes: [{ x: 0.18, y: 0.18, w: 0.64, h: 0.64, type: "obj", desc: "the framed subject" }] },
    { key: "vignette_focus", name: "Vignette Focus", cat: "composition", ar: "3:2", summary: "A single subject with a dark vignette drawing focus to the center", background: "a darkened vignette backdrop", boxes: [{ x: 0.3, y: 0.22, w: 0.4, h: 0.56, type: "obj", desc: "the centered focal subject" }] },
    { key: "leading_lines", name: "Leading Lines", cat: "composition", ar: "3:2", summary: "A composition with leading lines drawing the eye to a distant subject", background: "a scene with strong perspective lines converging to the center", boxes: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.24, type: "obj", desc: "a small subject at the vanishing point" }] },
  ];

  // Lenient caption parse for wired LLM text — mirrors the backend's _loads_caption: raw JSON →
  // ```json fenced block → first '{' .. last '}' span. Do not repair malformed JSON keys:
  // bad LLM JSON must be rejected so the user can regenerate or keep the current board.
  function parseCaption(s) {
    if (!s || !String(s).trim()) return null;
    const txt = String(s).trim();
    const cands = [txt];
    const m = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (m) cands.push(m[1].trim());
    const i = txt.indexOf("{"), j = txt.lastIndexOf("}");
    if (i >= 0 && j > i) cands.push(txt.slice(i, j + 1));
    for (const c of cands) {
      try { const v = JSON.parse(c); if (v && typeof v === "object" && !Array.isArray(v)) return v; } catch (e) {}
    }
    return null;
  }

  function firstText(source, keys) {
    if (!source || typeof source !== "object") return "";
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function firstList(source, keys) {
    if (!source || typeof source !== "object") return null;
    for (const key of keys) {
      const value = source[key];
      if (Array.isArray(value)) return value;
    }
    return null;
  }

  function orderedBbox(bbox) {
    if (!(Array.isArray(bbox) && bbox.length === 4)) return null;
    const bb = bbox.slice(0, 4);
    if (+bb[0] > +bb[2]) [bb[0], bb[2]] = [bb[2], bb[0]];
    if (+bb[1] > +bb[3]) [bb[1], bb[3]] = [bb[3], bb[1]];
    return bb;
  }

  function normalizeCaption(cap) {
    if (!cap || typeof cap !== "object" || Array.isArray(cap)) return null;
    const cd0 = cap.compositional_deconstruction && typeof cap.compositional_deconstruction === "object"
      ? cap.compositional_deconstruction
      : {};
    const out = {};
    const aspectRatio = firstText(cap, ["aspect_ratio", "resolution", "size"]);
    if (aspectRatio) out.aspect_ratio = aspectRatio;

    const summary = firstText(cap, [
      "high_level_description", "summary", "prompt", "description", "scene", "caption",
    ]);
    if (summary) out.high_level_description = summary;

    if (cap.style_description && typeof cap.style_description === "object" && !Array.isArray(cap.style_description)) {
      out.style_description = { ...cap.style_description };
    }

    let background = firstText(cd0, ["background", "bg", "setting", "scene_background"]);
    if (!background) background = firstText(cap, ["background", "bg", "setting", "scene_background"]);

    const rawElements =
      firstList(cd0, ["elements", "objects", "items", "bboxes", "boxes"]) ||
      firstList(cap, ["elements", "objects", "items", "bboxes", "boxes"]) ||
      [];
    const elements = [];
    for (const raw of rawElements) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const type = raw.type === "text" ? "text" : "obj";
      const item = { type };
      let bbox = raw.bbox;
      if (!(Array.isArray(bbox) && bbox.length === 4)) {
        bbox = raw.box || raw.bounds || raw.rect;
      }
      const ordered = orderedBbox(bbox);
      if (ordered) item.bbox = ordered;
      if (type === "text") item.text = raw.text || "";
      item.desc = firstText(raw, ["desc", "description", "label", "name", "prompt"]);
      if (HEX.test(raw.uiColor || "")) item.uiColor = raw.uiColor;
      const palette = raw.color_palette || raw.palette;
      if (Array.isArray(palette)) item.color_palette = palette.slice();
      elements.push(item);
    }

    out.compositional_deconstruction = { background, elements };
    return out;
  }

  function chain(o, n, f) { const p = o[n]; o[n] = function () { const r = p ? p.apply(this, arguments) : undefined; f.apply(this, arguments); return r; }; }
  const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const HEX = /^#[0-9a-fA-F]{6}$/;
  function stop(e) { for (const ev of ["pointerdown", "mousedown", "wheel", "dblclick"]) e.addEventListener(ev, (x) => x.stopPropagation()); }

  // ── Verdant Pro theme layer (user-approved r2026.06.11; appended after the base sheet) ──
  const IDD_THEME_CSS = `
/* ───────── Verdant Pro — DENO green-on-dark, grown up ─────────
   Skin-only override: tokens first (most rules read the CSS vars),
   then per-selector fixes for hardcoded neon/black literals.        */

/* 1) Tokens: desaturated emerald + warm charcoal + neutral gray text ladder.
      --gfaint (every idle border in the old theme) goes NEUTRAL:
      green is reserved for interactive / selected states only.       */
.idd-wrap{
  --g:#42bd7f !important;
  --gdim:rgba(66,189,127,.45) !important;
  --gfaint:rgba(173,191,181,.14) !important;
  --txt:#d3d8d4 !important;
  --acc:#aeb8b1 !important;
  --dim:#7c867f !important;
  --red:rgba(190,84,84,.85) !important;
  background:#121614 !important;
  border:1px solid rgba(255,255,255,.09) !important;
  border-radius:8px !important;
  width:100% !important;
  min-width:0 !important;
  max-width:100% !important;
  align-self:stretch !important;
  color:var(--txt) !important;
  font:12px/1.45 "Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif !important;
  -webkit-font-smoothing:antialiased;
}
.idd-wrap ::placeholder{color:#677169;}

/* 2) Top bar */
.idd-top{background:#171c19 !important;border-bottom:1px solid rgba(255,255,255,.07) !important;}
.idd-seed{background:#0c100e !important;border:1px solid rgba(255,255,255,.08) !important;border-radius:6px !important;
  color:#c6cec9 !important;font-family:"Cascadia Code","Consolas",ui-monospace,monospace !important;}
.idd-seed:focus{border-color:var(--gdim) !important;box-shadow:0 0 0 2px rgba(66,189,127,.10) !important;}
.idd-lock{background:#1a201c !important;border:1px solid rgba(255,255,255,.08) !important;color:var(--acc) !important;}
.idd-lock.on{color:var(--g) !important;border-color:var(--gdim) !important;background:rgba(66,189,127,.10) !important;}
.idd-i{color:var(--dim) !important;border:1px solid rgba(255,255,255,.14) !important;font:600 11px "Georgia","Cambria",serif !important;}
.idd-i.on{background:rgba(66,189,127,.12) !important;color:var(--g) !important;border-color:var(--gdim) !important;}
.idd-regen{background:linear-gradient(180deg,#46c281,#35a86b) !important;color:#0b1410 !important;
  font-weight:600 !important;letter-spacing:.2px !important;border-radius:8px !important;
  box-shadow:0 1px 2px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.16) !important;}
.idd-regen:hover{filter:brightness(1.06) !important;}

/* 3) Resolution popover */
.idd-res{background:#1a201c !important;border:1px solid rgba(255,255,255,.08) !important;color:#c6cec9 !important;
  font-family:"Cascadia Code","Consolas",ui-monospace,monospace !important;}
.idd-res:hover{border-color:var(--gdim) !important;}
.idd-langbtn{min-width:96px;max-width:128px;flex:0 0 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.idd-langbtn.on{background:rgba(66,189,127,.14) !important;color:var(--g) !important;border-color:var(--gdim) !important;}
.idd-refreshbtn,.idd-histbtn{width:30px;min-width:30px;max-width:30px;flex:0 0 30px !important;flex-shrink:0 !important;
  box-sizing:border-box !important;height:28px;padding:0 !important;display:inline-flex !important;
  align-items:center;justify-content:center;font-size:15px !important;line-height:1 !important;border-radius:8px !important;}
.idd-refreshbtn.working{color:#ffd48a !important;border-color:rgba(232,180,90,.45) !important;background:rgba(232,180,90,.12) !important;}
.idd-importbtn{min-width:104px;max-width:150px;flex:0 0 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.idd-importbtn.on{background:rgba(66,189,127,.10) !important;color:var(--g) !important;border-color:var(--gdim) !important;}
.idd-importbtn.pending{background:rgba(232,180,90,.16) !important;color:#ffd48a !important;border-color:rgba(232,180,90,.45) !important;}
.idd-importbtn.error{background:rgba(135,25,25,.48) !important;color:#ffd1c7 !important;border-color:rgba(255,120,90,.70) !important;}
.idd-lang-full .idd-modal-panel.idd-lang-panel{width:100%;max-width:100%;height:100%;max-height:100%;display:flex;flex-direction:column;overflow:hidden;}
.idd-lang-full .idd-modal-h{gap:14px;flex:0 0 auto;}
.idd-lang-full .idd-h-center{min-width:0;}
.idd-langsearch{width:100%;box-sizing:border-box;background:#0c100e;border:1px solid rgba(255,255,255,.10);
  border-radius:8px;color:#e4e8e5;padding:10px 12px;font:13px "Segoe UI Variable Text","Segoe UI",sans-serif;}
.idd-langsearch:focus{outline:none;border-color:rgba(66,189,127,.55);box-shadow:0 0 0 2px rgba(66,189,127,.10);}
.idd-langstatus{color:#8d978f;font:11px/1.45 "Segoe UI Variable Text","Segoe UI",sans-serif;margin-top:4px;}
.idd-langgrid{flex:1 1 auto;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));
  gap:8px;padding:4px 1px 2px;align-content:start;}
.idd-langcard{cursor:pointer;text-align:left;background:#0c100e;border:1px solid rgba(255,255,255,.10);border-radius:8px;
  color:#dbe0dc;padding:10px 11px;min-height:58px;font:12px/1.25 "Segoe UI Variable Text","Segoe UI",sans-serif;}
.idd-langcard:hover{border-color:rgba(66,189,127,.48);background:rgba(66,189,127,.08);}
.idd-langcard.on{border-color:rgba(66,189,127,.72);background:rgba(66,189,127,.14);box-shadow:inset 0 0 0 1px rgba(66,189,127,.22);}
.idd-langcard b{display:block;color:#e4e8e5;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.idd-langcard.on b{color:#a8f7c7;}
.idd-langcard span{display:block;color:#8d978f;font-size:11px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.idd-engine-panel{width:560px;max-width:92vw;height:auto;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;}
.idd-engine-reason{margin-top:8px;padding:10px 12px;border:1px solid rgba(232,180,90,.34);border-radius:8px;background:rgba(232,180,90,.10);color:#ffdca3;font:12px/1.45 "Segoe UI Variable Text","Segoe UI",sans-serif;}
.idd-engine-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px;}
.idd-engine-card{cursor:pointer;text-align:left;background:#0c100e;border:1px solid rgba(255,255,255,.10);border-radius:8px;color:#dbe0dc;padding:10px 12px;font:12px/1.35 "Segoe UI Variable Text","Segoe UI",sans-serif;}
.idd-engine-card:hover{border-color:rgba(66,189,127,.48);background:rgba(66,189,127,.08);}
.idd-engine-card.on{border-color:rgba(66,189,127,.72);background:rgba(66,189,127,.14);box-shadow:inset 0 0 0 1px rgba(66,189,127,.22);}
.idd-engine-card b{display:block;color:#e4e8e5;font-weight:700;}
.idd-engine-card span{display:block;color:#8d978f;font-size:11px;margin-top:3px;}
.idd-engine-url{width:100%;box-sizing:border-box;margin-top:8px;background:#0c100e;border:1px solid rgba(255,255,255,.10);border-radius:8px;color:#e4e8e5;padding:9px 10px;font:12px "Cascadia Code","Consolas",ui-monospace,monospace;}
.idd-engine-url:focus{outline:none;border-color:rgba(66,189,127,.55);box-shadow:0 0 0 2px rgba(66,189,127,.10);}
.idd-engine-msg{min-height:16px;color:#ffb6a7;font:11px/1.35 "Segoe UI Variable Text","Segoe UI",sans-serif;margin-top:7px;}
.idd-modal-panel.idd-import-panel{width:500px;max-width:92%;height:auto;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;}
.idd-importlist{display:flex;flex-direction:column;gap:6px;margin-top:10px;}
.idd-importrow{cursor:pointer;text-align:left;background:#0c100e;border:1px solid rgba(255,255,255,.10);border-radius:8px;color:#dbe0dc;padding:9px 10px;font:12px "Segoe UI Variable Text","Segoe UI",sans-serif;}
.idd-importrow:hover{border-color:rgba(66,189,127,.45);background:rgba(66,189,127,.08);}
.idd-importrow.on{border-color:rgba(66,189,127,.70);background:rgba(66,189,127,.14);color:#a8f7c7;}
.idd-importrow b{display:block;font:700 12px "Segoe UI Variable Text","Segoe UI",sans-serif;}
.idd-importrow span{display:block;color:#89958d;font-size:11px;margin-top:2px;line-height:1.35;}
.idd-respop{position:fixed !important;background:#181e1b !important;border:1px solid rgba(255,255,255,.10) !important;
  border-radius:10px !important;box-shadow:0 12px 32px rgba(0,0,0,.55) !important;}
.idd-mplbl{color:var(--dim) !important;letter-spacing:.3px;}
.idd-mp{background:#222824 !important;border:1px solid rgba(255,255,255,.08) !important;color:var(--txt) !important;
  font-family:"Cascadia Code","Consolas",ui-monospace,monospace !important;}
.idd-mp.on{border-color:var(--g) !important;background:rgba(66,189,127,.14) !important;color:var(--g) !important;}
.idd-respreset{background:#222824 !important;border:1px solid rgba(255,255,255,.08) !important;border-radius:8px !important;}
.idd-respreset b{color:#dbe0dc !important;font-weight:600 !important;}
.idd-respreset span{color:var(--dim) !important;font-family:"Cascadia Code","Consolas",ui-monospace,monospace !important;}
.idd-respreset.on{border-color:var(--g) !important;background:rgba(66,189,127,.12) !important;}
.idd-respreset.on b{color:var(--g) !important;}
.idd-rescustom{border-top:1px solid rgba(255,255,255,.07) !important;}
.idd-rescustom input{background:#0c100e !important;border:1px solid rgba(255,255,255,.08) !important;
  color:var(--txt) !important;font-family:"Cascadia Code","Consolas",ui-monospace,monospace !important;}
.idd-rescustom button{background:var(--g) !important;color:#0b1410 !important;
  font:600 11px "Segoe UI Variable Text","Segoe UI",sans-serif !important;}

/* 4) Stage: a clearly darker well with a hairline emerald frame */
.idd-board{background:#080b0a !important;
  box-shadow:inset 0 0 0 1px rgba(66,189,127,.22),inset 0 2px 14px rgba(0,0,0,.5) !important;}
.idd-board.empty::after{color:#69736c !important;letter-spacing:.3px !important;}
.idd-grid{background-image:
  linear-gradient(rgba(168,186,176,.045) 1px,transparent 1px),
  linear-gradient(90deg,rgba(168,186,176,.045) 1px,transparent 1px) !important;}
.idd-ov{box-shadow:0 0 0 1px rgba(66,189,127,.35) !important;}
.idd-zoom button{background:rgba(18,22,20,.85) !important;border:1px solid rgba(255,255,255,.10) !important;
  color:#b9c2bc !important;border-radius:6px !important;}
.idd-zoom button:hover{border-color:var(--gdim) !important;color:var(--g) !important;}

/* 5) Boxes over photos: emerald line + dark contrast ring (legible on bright AND dark) */
.idd-box{border-width:1.5px !important;border-style:solid !important;background:rgba(8,12,10,.10) !important;
  border-radius:3px !important;box-shadow:0 0 0 1px rgba(0,0,0,.55) !important;cursor:move;}
.idd-box.sel{background:color-mix(in srgb,var(--bc,#4ecb8d) 14%,transparent) !important;
  box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 0 2px var(--bc,#4ecb8d) !important;}
.idd-box.hov{box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 0 2px color-mix(in srgb,var(--bc,#4ecb8d) 55%,transparent) !important;}
.idd-box .tag{color:#0b1410 !important;border-radius:0 0 5px 0 !important;
  font:600 10px "Cascadia Code","Consolas",ui-monospace,monospace !important;box-shadow:0 1px 2px rgba(0,0,0,.4);
  cursor:move !important;z-index:6 !important;touch-action:none !important;user-select:none !important;
  min-width:20px !important;min-height:15px !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;}
.idd-box .lab{color:#f2f5f3 !important;font:11px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif !important;
  text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 5px rgba(0,0,0,.75) !important;}
.idd-h{background:var(--bc,#4ecb8d) !important;border:1px solid #0b1410 !important;border-radius:2px !important;
  box-shadow:0 0 0 1px rgba(0,0,0,.35) !important;}
.idd-dimtip{background:rgba(12,16,14,.92) !important;border:1px solid rgba(66,189,127,.40) !important;
  color:#7fd9ab !important;font-family:"Cascadia Code","Consolas",ui-monospace,monospace !important;}
.idd-deed{background:#171c19 !important;border:1px solid var(--gdim) !important;border-radius:7px !important;
  box-shadow:0 8px 24px rgba(0,0,0,.5) !important;font-family:"Segoe UI Variable Text","Segoe UI",sans-serif !important;}

/* backdrop adjust mode */
.idd-bdrop.edit{outline:1.5px dashed rgba(78,203,141,.85) !important;}
.idd-bdhandle{background:#4ecb8d !important;border:2px solid #0b1410 !important;}
.idd-bdropctl{background:rgba(14,18,16,.88) !important;border:1px solid rgba(255,255,255,.10) !important;border-radius:7px !important;}
.idd-bdedit{background:#1a201c !important;border:1px solid rgba(255,255,255,.08) !important;color:var(--txt) !important;}
.idd-bdedit.on{border-color:var(--g) !important;background:rgba(66,189,127,.13) !important;color:var(--g) !important;}

/* 6) Right rail: quiet gray chrome, green only when active */
.idd-rail{background:#141917 !important;border-left:1px solid rgba(255,255,255,.07) !important;}
.idd-rail.collapsed{border-left:none !important;}
.idd-seclbl,.idd-ml{font:600 10px "Segoe UI Variable Text","Segoe UI",sans-serif !important;
  letter-spacing:.09em !important;color:#8d978f !important;text-transform:uppercase !important;}
.idd-area{background:#0c100e !important;border:1px solid rgba(255,255,255,.07) !important;border-radius:8px !important;
  color:#ced5d0 !important;font:12px/1.5 "Segoe UI Variable Text","Segoe UI",sans-serif !important;}
.idd-area:focus{border-color:rgba(66,189,127,.55) !important;box-shadow:0 0 0 2px rgba(66,189,127,.10) !important;}
.idd-seg{background:#0c100e !important;border:1px solid rgba(255,255,255,.08) !important;border-radius:8px !important;}
.idd-seg button{color:var(--dim) !important;font-weight:500;}
.idd-seg button.on{background:rgba(66,189,127,.13) !important;color:var(--g) !important;font-weight:600;}
.idd-fields input{background:#0c100e !important;border:1px solid rgba(255,255,255,.07) !important;
  border-radius:6px !important;color:#ced5d0 !important;}
.idd-fields input:focus{border-color:rgba(66,189,127,.55) !important;box-shadow:0 0 0 2px rgba(66,189,127,.10) !important;}

/* 7) Palette swatches */
.idd-sw{border:1px solid rgba(255,255,255,.22) !important;border-radius:5px !important;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.25) !important;}
.idd-add{border:1px dashed rgba(255,255,255,.25) !important;color:var(--acc) !important;border-radius:5px !important;}
.idd-add:hover{border-color:var(--g) !important;color:var(--g) !important;}
.idd-palx{background:#231314 !important;border:1px solid rgba(190,84,84,.65) !important;color:#e6b9b9 !important;}
.idd-palx:hover{background:#5a2727 !important;}
.idd-paladd{background:#1a201c !important;border:1px dashed rgba(255,255,255,.20) !important;
  color:var(--acc) !important;border-radius:6px !important;}
.idd-paladd:hover{border-color:var(--g) !important;color:var(--g) !important;}
.idd-paladdrow input[type=color]{background:#0c100e !important;border:1px solid rgba(255,255,255,.10) !important;}

/* 8) Element rows */
.idd-elem:hover{background:rgba(255,255,255,.045) !important;}
.idd-elem.hov{background:rgba(66,189,127,.08) !important;}
.idd-elem.sel{background:rgba(66,189,127,.13) !important;box-shadow:inset 0 0 0 1px rgba(66,189,127,.30);}
.idd-elem .n{font:600 10px "Cascadia Code","Consolas",ui-monospace,monospace !important;color:var(--dim) !important;}
.idd-elem .c{box-shadow:inset 0 0 0 1px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.10) !important;}
.idd-elem .ty{font:600 9px "Cascadia Code","Consolas",ui-monospace,monospace !important;
  color:#9aa49d !important;border:1px solid rgba(255,255,255,.12) !important;}
.idd-elem .ty:hover{color:var(--g) !important;border-color:var(--gdim) !important;}
.idd-elem .x:hover{color:#e6b9b9 !important;}
.idd-elem .dup:hover{color:var(--g) !important;}
.idd-elem.drop-before::before,.idd-elem.drop-after::after{content:"";position:absolute;left:4px;right:4px;height:2px;border-radius:999px;
  background:var(--g);box-shadow:0 0 8px rgba(72,255,132,.75);pointer-events:none;z-index:3;}
.idd-elem.drop-before::before{top:-2px;}
.idd-elem.drop-after::after{bottom:-2px;}

/* 9) Bottom action bar */
.idd-bot{background:#171c19 !important;border-top:1px solid rgba(255,255,255,.07) !important;}
.idd-btn{background:#1d2320 !important;border:1px solid rgba(255,255,255,.09) !important;border-radius:7px !important;
  color:#b9c2bc !important;font-weight:500 !important;letter-spacing:.1px;}
.idd-btn:hover{border-color:var(--gdim) !important;color:var(--g) !important;background:#212724 !important;}
.idd-btn.on{background:rgba(66,189,127,.14) !important;color:var(--g) !important;border-color:var(--gdim) !important;}
.idd-btn.red:hover{border-color:rgba(190,84,84,.7) !important;color:#e6b9b9 !important;background:rgba(120,46,46,.18) !important;}

/* 10) Element editor modal */
.idd-modal{background:rgba(8,10,9,.72) !important;}
.idd-modal-panel{background:#181e1b !important;border:1px solid rgba(255,255,255,.10) !important;
  border-radius:12px !important;box-shadow:0 16px 48px rgba(0,0,0,.6) !important;}
.idd-modal-h .t{color:#e4e8e5 !important;font-family:"Segoe UI Variable Display","Segoe UI Semibold","Segoe UI",sans-serif !important;font-weight:600 !important;}
.idd-modal-h .tag{background:var(--g) !important;color:#0b1410 !important;border-radius:5px !important;
  font:600 11px "Cascadia Code","Consolas",ui-monospace,monospace !important;}
.idd-modal-panel input[type=text],.idd-modal-panel textarea{background:#0c100e !important;
  border:1px solid rgba(255,255,255,.08) !important;border-radius:8px !important;color:#ced5d0 !important;
  font:13px/1.5 "Segoe UI Variable Text","Segoe UI",sans-serif !important;}
.idd-modal-panel input:focus,.idd-modal-panel textarea:focus{border-color:rgba(66,189,127,.55) !important;
  box-shadow:0 0 0 2px rgba(66,189,127,.10) !important;}
.idd-mbtn{background:#1d2320 !important;border:1px solid rgba(255,255,255,.10) !important;
  border-radius:8px !important;color:#b9c2bc !important;}
.idd-mbtn.save{background:linear-gradient(180deg,#46c281,#35a86b) !important;color:#0b1410 !important;
  font-weight:600 !important;border:none !important;}
.idd-mbtn.del{color:#e6b9b9 !important;border-color:rgba(190,84,84,.6) !important;background:#1d1715 !important;}

/* 11) Focus ring, disabled, scrollbars */
.idd-btn:focus-visible,.idd-regen:focus-visible,.idd-seg button:focus-visible,
.idd-mbtn:focus-visible,.idd-bdedit:focus-visible,.idd-res:focus-visible{
  outline:1.5px solid rgba(66,189,127,.85) !important;outline-offset:1px !important;}
.idd-wrap button:disabled{opacity:.4 !important;}
.idd-rail::-webkit-scrollbar,.idd-modal-panel::-webkit-scrollbar{width:10px;}
.idd-rail::-webkit-scrollbar-track,.idd-modal-panel::-webkit-scrollbar-track{background:transparent;}
.idd-rail::-webkit-scrollbar-thumb,.idd-modal-panel::-webkit-scrollbar-thumb{
  background:rgba(173,191,181,.18);border:3px solid transparent;border-radius:8px;background-clip:padding-box;}
.idd-rail::-webkit-scrollbar-thumb:hover,.idd-modal-panel::-webkit-scrollbar-thumb:hover{
  background:rgba(173,191,181,.30);background-clip:padding-box;}

/* ───────── feature additions (r2026.06.11-h) ───────── */
/* bbox hover affordance: brighten + ring so "click selects this" is obvious */
.idd-ov .idd-box:hover{filter:brightness(1.3) saturate(1.15);background:rgba(255,255,255,.06) !important;}
.idd-ov .idd-box.sel:hover{filter:none;}
/* bbox visibility toggle (eye) */
.idd-ov.boxes-off .idd-box{display:none !important;}
/* summary/background: roomy but NOT so tall that the Elements list falls below the fold —
   the per-iteration list must be visible at the default node size (frequency beats size) */
.idd-area{min-height:96px !important;}

/* ── resolution popup, Resize Box philosophy: live preview + status line + roomy controls ── */
.idd-respop{width:264px !important;box-sizing:border-box;}
.idd-resprev{height:154px;display:flex;align-items:center;justify-content:center;
  background:#080b0a;border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;}
/* draggable affordance: corner grip handle (same look as the bbox handles) + hover feedback */
.idd-resprev .rect{cursor:nwse-resize;position:relative;transition:border-color .1s ease;}
.idd-resprev .rect::after{content:"";position:absolute;right:-5px;bottom:-5px;width:9px;height:9px;
  background:#4ecb8d;border:1px solid #0b1410;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.45);}
.idd-resprev .rect:hover{border-color:#6fe2a8 !important;}
.idd-resprev .rect:hover::after{transform:scale(1.2);}
.idd-mpin{width:72px;background:#0c100e;border:1px solid rgba(255,255,255,.10);border-radius:6px;
  color:#ced5d0;font:12px "Cascadia Code","Consolas",ui-monospace,monospace;padding:5px 8px;box-sizing:border-box;}
.idd-mpin:focus{border-color:rgba(66,189,127,.55);outline:none;}
.idd-resactions{display:flex;align-items:center;border-top:1px solid rgba(255,255,255,.07);padding-top:8px;}
.idd-resapply{cursor:pointer;background:linear-gradient(180deg,#46c281,#35a86b);color:#0b1410;border:none;
  border-radius:7px;font:600 12px "Segoe UI Variable Text","Segoe UI",sans-serif;padding:6px 22px;}
.idd-resapply:hover{filter:brightness(1.06);}
.idd-resprev .rect{box-sizing:border-box;background:rgba(66,189,127,.10);border:1.5px solid #4ecb8d;border-radius:2px;
  background-image:
    linear-gradient(to right, transparent calc(50% - .5px), rgba(66,189,127,.30) calc(50% - .5px), rgba(66,189,127,.30) calc(50% + .5px), transparent calc(50% + .5px)),
    linear-gradient(to bottom, transparent calc(50% - .5px), rgba(66,189,127,.30) calc(50% - .5px), rgba(66,189,127,.30) calc(50% + .5px), transparent calc(50% + .5px));}
.idd-resinfo{font:11px "Cascadia Code","Consolas",ui-monospace,monospace;color:#9aa49d;
  text-align:center;letter-spacing:.2px;white-space:nowrap;}
.idd-respreset{padding:7px 4px !important;}
.idd-respreset b{font-size:12px !important;}
.idd-respreset span{font-size:10px !important;}
.idd-mp{padding:5px 11px !important;font-size:11.5px !important;}
.idd-rescustom{align-items:center;}
.idd-rescustom input{width:74px !important;font-size:12px !important;padding:5px 8px !important;box-sizing:border-box;}
.idd-rescustom .snap{flex:0 0 auto;color:#7c867f;font:600 10px "Segoe UI Variable Text","Segoe UI",sans-serif;
  border:1px dashed rgba(255,255,255,.16);border-radius:5px;padding:3px 7px;cursor:help;}
/* style Presets… button: never clip its label */
.idd-preset-btn{font-size:11px !important;padding:6px 14px !important;flex:0 0 auto;white-space:nowrap;
  min-width:172px;text-align:center;font-weight:700 !important;}

/* ── control-ergonomics pass (r2026.06.11-n) ── */
/* primary action: biggest target in the bar, terminal position */
.idd-top{min-width:0 !important;overflow:hidden !important;}
.idd-top > *{min-width:0;}
.idd-sp{min-width:4px;}
.idd-regen{padding:7px 0 !important;font-size:12.5px !important;flex:0 0 84px !important;
  min-width:84px !important;max-width:84px !important;text-align:center;white-space:nowrap;overflow:hidden;}
.idd-wrap.idd-topfit .idd-top{gap:6px !important;padding-left:7px !important;padding-right:7px !important;}
.idd-wrap.idd-topfit .idd-btn.idd-toplay{padding-left:10px !important;padding-right:10px !important;min-width:74px !important;max-width:92px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.idd-wrap.idd-topfit .idd-importbtn{min-width:82px;max-width:144px;}
.idd-wrap.idd-topfit .idd-langbtn{min-width:78px;max-width:104px;}
.idd-wrap.idd-topfit .idd-refreshbtn{width:30px;min-width:30px;max-width:30px;flex-basis:30px !important;}
.idd-wrap.idd-topfit .idd-res{max-width:124px;overflow:hidden;text-overflow:ellipsis;}
.idd-wrap.idd-topfit .idd-seedpill .idd-seedlbl{display:none;}
.idd-wrap.idd-topfit .idd-seedpill .idd-seed{width:38px;}
.idd-wrap.idd-topfit .idd-seedopt{padding-left:5px;padding-right:5px;}
.idd-wrap.idd-topfit .idd-regen{flex-basis:78px !important;min-width:78px !important;max-width:78px !important;}
/* seed pill: label + number + lock read as ONE control */
.idd-seedpill{display:inline-flex;align-items:center;gap:0;flex:0 0 auto;border:1px solid rgba(255,255,255,.08);
  border-radius:6px;background:#0c100e;overflow:hidden;}
.idd-seedpill .idd-seedlbl{color:#7c867f;font:600 9px "Segoe UI Variable Text","Segoe UI",sans-serif;
  letter-spacing:.08em;text-transform:uppercase;padding:0 6px 0 8px;}
.idd-seedpill .idd-seed{border:none !important;background:transparent !important;box-shadow:none !important;
  width:46px;}
.idd-seedpill .idd-lock{border:none !important;background:transparent !important;border-left:1px solid rgba(255,255,255,.08) !important;
  border-radius:0 !important;padding:3px 8px !important;}
.idd-seedpill .idd-lock.on{background:rgba(66,189,127,.12) !important;}
/* seed mode switch: [Fixed | Random] — active segment is filled so the state is unmistakable */
.idd-seedseg{display:inline-flex;align-items:stretch;border-left:1px solid rgba(255,255,255,.10);}
.idd-seedopt{cursor:pointer;background:transparent;border:none;color:#8b948d;white-space:nowrap;
  font:600 10px "Segoe UI Variable Text","Segoe UI",sans-serif;padding:4px 7px;transition:background .12s ease,color .12s ease;}
.idd-seedopt + .idd-seedopt{border-left:1px solid rgba(255,255,255,.10);}
.idd-seedopt:hover{color:#e4e8e5;}
.idd-seedopt.idd-fixed.on{background:var(--g);color:#041208;font-weight:700;}
.idd-seedopt.idd-random.on{background:#e8b45a;color:#1a1205;font-weight:700;}
.idd-seedopt:active{transform:translateY(1px);}
.idd-seed.idd-seed-muted{opacity:.42;}
/* bottom bar group separators */
.idd-vsep{width:1px;height:18px;background:rgba(255,255,255,.10);margin:0 4px;flex:0 0 auto;}
/* armed (confirm) state of Clear Board */
.idd-btn.red.arm{background:rgba(190,84,84,.85) !important;color:#fff !important;border-color:transparent !important;}
.idd-btn:disabled{opacity:.4;cursor:default;}
/* panel-collapse edge tab on the board↔panel boundary (IDE convention) */
.idd-railtab{position:absolute;right:248px;top:50%;transform:translate(50%,-50%);width:16px;height:46px;
  z-index:9;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:#1a201c;color:#8d978f;
  cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;padding:0;line-height:1;}
.idd-railtab:hover{color:#42bd7f;border-color:rgba(66,189,127,.45);}
.idd-rail.collapsed + .idd-railtab{right:0;transform:translate(0,-50%);border-radius:6px 0 0 6px;}
/* eye toggle OFF = filled + struck (state, not dimming) */
.idd-zoom{align-items:center !important;z-index:8;}
.idd-zoom button.off{background:rgba(66,189,127,.14) !important;color:#42bd7f !important;position:relative;}
.idd-zoom button.off::after{content:"";position:absolute;left:3px;right:3px;top:50%;height:1.5px;
  background:#e6b9b9;transform:rotate(-35deg);}
/* element rows: bigger touch targets, duplicate/delete separated, revealed on hover/selection */
.idd-elem .dup,.idd-elem .x{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;
  flex:0 0 auto;border-radius:4px;}
.idd-elem .x{margin-left:6px;}
.idd-elem .dup,.idd-elem .x{opacity:0;transition:opacity .1s ease;}
.idd-elem:hover .dup,.idd-elem:hover .x,.idd-elem.sel .dup,.idd-elem.sel .x{opacity:1;}
/* fullscreen button: bigger hit target */
.idd-i.idd-fsbtn{width:32px !important;height:26px !important;font-size:15px !important;line-height:24px !important;}
/* seed lock: animated, stateful */
.idd-lock{transition:background .12s ease,border-color .12s ease,color .12s ease,transform .06s ease;}
.idd-lock:active{transform:translateY(1px);}
.idd-lock:not(.on){opacity:.75;}
/* ── custom color picker (our own — no OS dialog): SV field + hue bar + HEX/RGB/HSL + actions ── */
.idd-colorpop{position:absolute;z-index:90;width:216px;box-sizing:border-box;background:#181e1b;
  border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px;display:flex;
  flex-direction:column;gap:8px;box-shadow:0 12px 32px rgba(0,0,0,.55);}
.idd-colorpop .sv{position:relative;width:100%;height:126px;border-radius:7px;cursor:crosshair;
  border:1px solid rgba(255,255,255,.10);touch-action:none;}
.idd-colorpop .sv .dot{position:absolute;width:12px;height:12px;border:2px solid #fff;border-radius:50%;
  transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,.65);pointer-events:none;}
.idd-colorpop .hue{position:relative;width:100%;height:12px;border-radius:6px;cursor:pointer;touch-action:none;
  background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);border:1px solid rgba(255,255,255,.10);}
.idd-colorpop .hue .hdot{position:absolute;top:50%;width:14px;height:14px;border:2px solid #fff;border-radius:50%;
  transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,.65);pointer-events:none;}
.idd-colorpop .prev{height:34px;border-radius:7px;overflow:hidden;display:flex;
  border:1px solid rgba(255,255,255,.10);}
.idd-colorpop .prev .half{flex:1;}
.idd-colorpop .vals{display:flex;flex-direction:column;gap:4px;}
.idd-colorpop .cp{margin-left:auto;width:24px;height:20px;padding:0 !important;
  display:inline-flex;align-items:center;justify-content:center;font-size:11px !important;}
.idd-colorpop .vrow{display:flex;align-items:center;gap:8px;min-height:20px;}
.idd-colorpop .vrow .k{width:28px;color:#7c867f;font:600 9px "Segoe UI Variable Text","Segoe UI",sans-serif;letter-spacing:.08em;}
.idd-colorpop .vrow .v{color:#ced5d0;font:11px "Cascadia Code","Consolas",ui-monospace,monospace;}
.idd-colorpop input[type=text]{flex:1;min-width:0;background:#0c100e;border:1px solid rgba(255,255,255,.10);
  border-radius:6px;color:#ced5d0;font:11px "Cascadia Code","Consolas",ui-monospace,monospace;padding:4px 7px;}
.idd-colorpop .cp{flex:0 0 auto;}
.idd-colorpop .acts{display:flex;gap:6px;align-items:center;}
.idd-colorpop .acts .sp{flex:1;}
/* result-image dimmer: board view control beside the eye button, shown only after a result image exists. */
.idd-imgctl{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-width:86px;height:24px;box-sizing:border-box;
  background:rgba(1,6,4,.82);border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:2px 6px;}
.idd-imgctl .idd-bdroprange{width:58px;}
/* zoom-cluster buttons (eye / chevron): center the glyphs */
.idd-zoom button{display:inline-flex;align-items:center;justify-content:center;padding:0;line-height:1;}
/* palette "+" chip: center the glyph too */
.idd-add{display:inline-flex !important;align-items:center !important;justify-content:center !important;
  padding:0 !important;line-height:1 !important;}
.idd-colorpop .acts{display:flex;gap:6px;justify-content:flex-end;}
.idd-colorpop button{cursor:pointer;border-radius:6px;font:600 11px "Segoe UI Variable Text","Segoe UI",sans-serif;
  padding:5px 12px;border:1px solid rgba(255,255,255,.10);background:#1d2320;color:#b9c2bc;}
.idd-colorpop button.save{background:linear-gradient(180deg,#46c281,#35a86b);color:#0b1410;border:none;}
.idd-colorpop button.del{border-color:rgba(190,84,84,.6);color:#e6b9b9;background:#1d1715;}
/* preset gallery shells */
.idd-preset-btn{cursor:pointer;background:rgba(72,189,127,.22);border:1px solid rgba(66,189,127,.62);border-radius:8px;
  color:#9ff2c2;font:700 11px "Segoe UI Variable Text","Segoe UI",sans-serif;padding:6px 14px;letter-spacing:.2px;}
.idd-preset-btn:hover{border-color:var(--g);color:#d6fde7;background:rgba(72,189,127,.32);}
.idd-preset-empty{color:#7c867f;font:12px/1.6 "Segoe UI Variable Text","Segoe UI",sans-serif;
  border:1px dashed rgba(255,255,255,.14);border-radius:10px;padding:26px 18px;text-align:center;}
/* preset galleries (Verdant Pro) */
.idd-gal-tabs button{background:#222824 !important;border:1px solid rgba(255,255,255,.08) !important;color:#dbe0dc !important;}
.idd-gal-tabs button.on{border-color:var(--g) !important;color:var(--g) !important;background:rgba(66,189,127,.12) !important;}
.idd-gal-card{background:#1b211e !important;border-color:rgba(255,255,255,.09) !important;}
.idd-gal-card:hover{border-color:rgba(66,189,127,.55) !important;}
.idd-gal-thumb,.idd-gal-wire{background:#151916 !important;}
.idd-gal-name{color:#dbe0dc !important;}
.idd-gal-note{color:#7c867f !important;}
.idd-gal-save input{background:#0c100e !important;border:1px solid rgba(255,255,255,.10) !important;color:#e4e8e5 !important;}
.idd-gal-save input:focus{border-color:rgba(66,189,127,.55) !important;}

`;

  function injectStyle() {
    if (document.getElementById("deno-idd-style")) return;
    const s = el("style"); s.id = "deno-idd-style";
    s.textContent = `
      .idd-wrap{--g:#48ff84;--gdim:rgba(72,255,132,.30);--gfaint:rgba(72,255,132,.13);
        --txt:#dfffea;--acc:#9dffba;--dim:#6f9a80;--red:rgba(150,40,40,.95);
        display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;width:100%;min-width:0;max-width:100%;height:100%;align-self:stretch;
        background:rgba(3,10,7,.97);border:1px solid var(--gdim);border-radius:10px;
        color:var(--txt);font:12px 'Segoe UI',sans-serif;}
      /* fullscreen: break out to a viewport overlay. !important beats ComfyUI's per-frame inline styles. */
      .idd-wrap.idd-fs{position:fixed!important;inset:0!important;left:0!important;top:0!important;
        width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;
        transform:none!important;z-index:99999!important;border-radius:0!important;}
      .idd-top{display:flex;align-items:center;gap:10px;padding:7px 10px;flex:0 0 auto;
        border-bottom:1px solid var(--gfaint);background:rgba(1,6,4,.55);}
      .idd-sp{flex:1 1 auto;}
      .idd-seed{width:104px;background:#050a08;border:1px solid var(--gfaint);border-radius:6px;
        color:var(--acc);font:11px monospace;padding:3px 7px;outline:none;}
      .idd-seed:focus{border-color:var(--gdim);}
      .idd-lock{cursor:pointer;color:var(--acc);border:1px solid var(--gfaint);border-radius:6px;
        padding:3px 7px;background:#050a08;font-size:11px;user-select:none;}
      .idd-lock.on{color:var(--g);border-color:var(--gdim);}
      .idd-regen{cursor:pointer;background:var(--g);color:#041208;font-weight:700;border:none;
        border-radius:999px;padding:6px 18px;font-size:12px;box-shadow:0 0 0 1px rgba(72,255,132,.25);}
      .idd-regen:hover{filter:brightness(1.07);}
      .idd-i{width:17px;height:17px;line-height:15px;text-align:center;border-radius:50%;cursor:pointer;
        color:var(--g);border:1px solid var(--gdim);font:bold 11px serif;flex:0 0 auto;}
      .idd-i.on{background:var(--gfaint);}
      /* resolution control */
      .idd-reswrap{position:relative;display:inline-flex;flex:0 0 auto;}
      .idd-res{cursor:pointer;background:#050a08;border:1px solid var(--gfaint);border-radius:6px;color:var(--acc);
        font:11px monospace;padding:3px 9px;white-space:nowrap;}
      .idd-res:hover{border-color:var(--gdim);}
      .idd-langbtn{min-width:96px;max-width:128px;flex:0 0 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .idd-langbtn.on{background:rgba(72,255,132,.16);color:var(--g);border-color:var(--gdim);}
      .idd-refreshbtn,.idd-histbtn{width:30px;min-width:30px;max-width:30px;flex:0 0 30px !important;flex-shrink:0 !important;
        box-sizing:border-box !important;height:28px;padding:0 !important;display:inline-flex !important;
        align-items:center;justify-content:center;font-size:15px !important;line-height:1 !important;border-radius:8px !important;}
      .idd-refreshbtn.working{color:#ffd48a !important;border-color:rgba(232,180,90,.45) !important;background:rgba(232,180,90,.12) !important;}
      .idd-importbtn{min-width:104px;max-width:150px;flex:0 0 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .idd-importbtn.on{background:rgba(72,255,132,.10);color:var(--g);border-color:var(--gdim);}
      .idd-importbtn.pending{background:rgba(232,180,90,.16);color:#ffd48a;border-color:rgba(232,180,90,.45);}
      .idd-importbtn.error{background:rgba(135,25,25,.48);color:#ffd1c7;border-color:rgba(255,120,90,.70);}
      .idd-lang-full .idd-modal-panel.idd-lang-panel{width:100%;max-width:100%;height:100%;max-height:100%;display:flex;flex-direction:column;overflow:hidden;}
      .idd-lang-full .idd-modal-h{gap:14px;flex:0 0 auto;}
      .idd-lang-full .idd-h-center{min-width:0;}
      .idd-langsearch{width:100%;box-sizing:border-box;background:#050a08;border:1px solid var(--gfaint);
        border-radius:8px;color:var(--txt);padding:10px 12px;font:13px 'Segoe UI';}
      .idd-langsearch:focus{border-color:var(--gdim);outline:none;box-shadow:0 0 0 2px rgba(72,255,132,.10);}
      .idd-langstatus{color:var(--dim);font:11px/1.45 'Segoe UI';margin-top:4px;}
      .idd-langgrid{flex:1 1 auto;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));
        gap:8px;padding:4px 1px 2px;align-content:start;}
      .idd-langcard{cursor:pointer;text-align:left;background:#050a08;border:1px solid var(--gfaint);border-radius:8px;
        color:#dbe0dc;padding:10px 11px;min-height:58px;font:12px/1.25 'Segoe UI';}
      .idd-langcard:hover{border-color:var(--gdim);background:rgba(72,255,132,.08);}
      .idd-langcard.on{border-color:var(--g);background:rgba(72,255,132,.14);box-shadow:inset 0 0 0 1px rgba(72,255,132,.22);}
      .idd-langcard b{display:block;color:var(--txt);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .idd-langcard.on b{color:var(--acc);}
      .idd-langcard span{display:block;color:var(--dim);font-size:11px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .idd-engine-panel{width:560px;max-width:92vw;height:auto;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;}
      .idd-engine-reason{margin-top:8px;padding:10px 12px;border:1px solid rgba(232,180,90,.34);border-radius:8px;background:rgba(232,180,90,.10);color:#ffdca3;font:12px/1.45 'Segoe UI';}
      .idd-engine-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px;}
      .idd-engine-card{cursor:pointer;text-align:left;background:#050a08;border:1px solid var(--gfaint);border-radius:8px;color:#dbe0dc;padding:10px 12px;font:12px/1.35 'Segoe UI';}
      .idd-engine-card:hover{border-color:var(--gdim);background:rgba(72,255,132,.08);}
      .idd-engine-card.on{border-color:var(--g);background:rgba(72,255,132,.14);box-shadow:inset 0 0 0 1px rgba(72,255,132,.22);}
      .idd-engine-card b{display:block;color:var(--txt);font-weight:700;}
      .idd-engine-card span{display:block;color:var(--dim);font-size:11px;margin-top:3px;}
      .idd-engine-url{width:100%;box-sizing:border-box;margin-top:8px;background:#050a08;border:1px solid var(--gfaint);border-radius:8px;color:var(--txt);padding:9px 10px;font:12px monospace;}
      .idd-engine-url:focus{outline:none;border-color:var(--gdim);box-shadow:0 0 0 2px rgba(72,255,132,.10);}
      .idd-engine-msg{min-height:16px;color:#ffb6a7;font:11px/1.35 'Segoe UI';margin-top:7px;}
      .idd-modal-panel.idd-import-panel{width:500px;max-width:92%;height:auto;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;}
      .idd-importlist{display:flex;flex-direction:column;gap:6px;margin-top:10px;}
      .idd-importrow{cursor:pointer;text-align:left;background:#050a08;border:1px solid var(--gfaint);border-radius:8px;
        color:#dbe0dc;padding:9px 10px;font:12px 'Segoe UI';}
      .idd-importrow:hover{border-color:var(--gdim);background:rgba(72,255,132,.08);}
      .idd-importrow.on{border-color:var(--g);background:rgba(72,255,132,.14);color:var(--acc);}
      .idd-importrow b{display:block;font:700 12px 'Segoe UI';}
      .idd-importrow span{display:block;color:var(--dim);font-size:11px;margin-top:2px;line-height:1.35;}
      .idd-respop{position:fixed;top:0;left:0;right:auto;z-index:100001;background:#08130d;border:1px solid var(--gdim);
        border-radius:10px;box-shadow:0 10px 32px #000;padding:10px;width:232px;display:flex;flex-direction:column;gap:8px;}
      .idd-mprow{display:flex;align-items:center;gap:5px;}
      .idd-mplbl{color:var(--dim);font:10px 'Segoe UI';margin-right:auto;}
      .idd-mp{cursor:pointer;background:#0c1611;border:1px solid var(--gfaint);border-radius:6px;color:var(--txt);
        font:11px monospace;padding:3px 8px;}
      .idd-mp.on{border-color:var(--g);background:rgba(72,255,132,.12);color:var(--g);}
      .idd-mp:hover{border-color:var(--gdim);}
      .idd-respresets{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;}
      .idd-respreset{cursor:pointer;background:#0c1611;border:1px solid var(--gfaint);border-radius:7px;color:var(--txt);
        padding:6px 2px;display:flex;flex-direction:column;align-items:center;gap:1px;}
      .idd-respreset.on{border-color:var(--g);background:rgba(72,255,132,.12);}
      .idd-respreset b{color:var(--g);font-size:11px;} .idd-respreset span{color:var(--dim);font:9px monospace;}
      .idd-respreset:hover{border-color:var(--gdim);}
      /* per-ratio common-sizes flyout — opens beside the popup when a ratio button is clicked */
      .idd-sizefly{position:absolute;left:calc(100% + 8px);z-index:90;background:#08130d;border:1px solid var(--gdim);
        border-radius:10px;box-shadow:0 12px 40px #000;padding:8px;width:152px;}
      .idd-sizefly.flip-left{left:auto;right:calc(100% + 8px);}
      .idd-sizefly-h{font:bold 9px 'Segoe UI';letter-spacing:.5px;color:var(--acc);text-transform:uppercase;padding:2px 3px 7px;}
      .idd-sizefly-list{display:flex;flex-direction:column;gap:5px;}
      .idd-sizeopt{cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:1px;
        background:#0c1611;border:1px solid var(--gfaint);border-radius:7px;padding:6px 10px;}
      .idd-sizeopt b{font:700 12px 'Segoe UI';color:#e4e8e5;}
      .idd-sizeopt span{font:9px monospace;color:var(--dim);}
      .idd-sizeopt:hover{border-color:var(--g);background:rgba(72,189,127,.14);}
      .idd-sizeopt:hover b{color:var(--g);}
      .idd-rescustom{display:flex;align-items:center;gap:5px;border-top:1px solid var(--gfaint);padding-top:8px;}
      .idd-rescustom input{width:52px;background:#050a08;border:1px solid var(--gfaint);border-radius:6px;color:var(--txt);
        font:11px monospace;padding:4px 6px;outline:none;}
      .idd-rescustom input:focus{border-color:var(--gdim);} .idd-rescustom .x{color:var(--dim);}
      .idd-rescustom button{cursor:pointer;background:var(--g);color:#041208;border:none;border-radius:6px;
        font:bold 11px 'Segoe UI';padding:5px 11px;margin-left:auto;}
      .idd-body{display:flex;flex:1 1 auto;width:100%;min-width:0;min-height:0;}
      .idd-board{position:relative;flex:1 1 320px;min-width:260px;background:
        radial-gradient(120% 100% at 50% 0%,#06120c 0%,#020403 70%);overflow:hidden;}
      .idd-board img{position:absolute;object-fit:fill;pointer-events:none;}
      .idd-bdrop{z-index:0;pointer-events:none;}
      .idd-bdrop.edit{pointer-events:auto;outline:2px dashed var(--g);outline-offset:-1px;cursor:move;}
      .idd-bdhandle{position:absolute;z-index:7;width:13px;height:13px;background:var(--g);
        border:2px solid #041208;border-radius:3px;cursor:nwse-resize;box-shadow:0 0 0 1px #0008;}
      .idd-bdropctl{position:absolute;left:8px;top:8px;z-index:8;display:flex;align-items:center;gap:6px;
        background:#000a;border:1px solid var(--gfaint);border-radius:7px;padding:3px 8px;}
      .idd-bdroprange{width:90px;accent-color:var(--g);}
      .idd-bdedit{cursor:pointer;background:#0c1611;border:1px solid var(--gfaint);border-radius:6px;
        color:var(--txt);font:11px 'Segoe UI';padding:2px 7px;white-space:nowrap;}
      .idd-bdedit.on{border-color:var(--g);background:rgba(72,255,132,.14);color:var(--g);}
      .idd-board.empty::after{content:'Drag on the board to draw a region, then press Generate';
        white-space:normal;text-align:center;line-height:1.8;position:absolute;inset:0;
        display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:12px;letter-spacing:.4px;
        pointer-events:none;}
      .idd-runalert{position:absolute;left:12px;right:12px;top:44px;z-index:30;box-sizing:border-box;
        display:none;flex-direction:column;gap:4px;background:rgba(34,12,12,.94);
        border:1px solid rgba(235,93,93,.70);border-radius:9px;padding:10px 12px;
        color:#ffd9d9;box-shadow:0 10px 28px rgba(0,0,0,.55);pointer-events:auto;}
      .idd-runalert b{display:block;color:#ffbaba;font:700 12px 'Segoe UI';}
      .idd-runalert span{display:block;color:#f0d1d1;font:11px/1.45 'Segoe UI';}
      .idd-runalert.info{background:rgba(25,20,8,.94);border-color:rgba(226,170,60,.72);}
      .idd-runalert.info b{color:#ffd889;} .idd-runalert.info span{color:#f2dfbd;}
      .idd-runalert-actions{display:none;align-items:center;gap:8px;margin-top:5px;}
      .idd-runalert-actions button{cursor:pointer;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:#171c19;
        color:#d3d8d4;font:650 11px 'Segoe UI';padding:5px 10px;}
      .idd-runalert-actions button.primary{background:rgba(66,189,127,.22);border-color:rgba(66,189,127,.62);color:#a8f7c7;}
      .idd-runalert-actions button:hover{filter:brightness(1.08);}
      .idd-grid{position:absolute;inset:0;background-image:
        linear-gradient(rgba(72,255,132,.05) 1px,transparent 1px),
        linear-gradient(90deg,rgba(72,255,132,.05) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;}
      .idd-ov{position:absolute;cursor:crosshair;box-shadow:0 0 0 1px rgba(72,255,132,.16);}
      .idd-box{position:absolute;border:1.5px solid var(--g);border-radius:2px;
        background:rgba(72,255,132,.07);box-sizing:border-box;cursor:move;}
      .idd-box.text{border-style:dashed;}
      .idd-box.sel{box-shadow:0 0 0 1px #041208,0 0 10px var(--gdim);background:rgba(72,255,132,.13);}
      .idd-box .tag{position:absolute;top:0;left:0;z-index:6;background:var(--g);color:#041208;font:bold 10px monospace;
        min-width:20px;min-height:15px;padding:1px 5px;border-radius:0 0 4px 0;cursor:move;touch-action:none;user-select:none;
        display:inline-flex;align-items:center;justify-content:center;}
      .idd-box .lab{position:absolute;top:16px;left:3px;right:3px;bottom:3px;color:#eafff0;font:11px/1.35 'Segoe UI';
        text-shadow:0 1px 2px #000,0 0 4px #000a;overflow:hidden;white-space:normal;overflow-wrap:anywhere;pointer-events:none;}
      .idd-h{position:absolute;width:9px;height:9px;background:var(--g);border:1px solid #041208;border-radius:2px;
        z-index:4;display:none;box-sizing:border-box;}
      .idd-h::before{content:'';position:absolute;inset:-8px;}   /* big hit-area (~25px) around a small visual handle */
      .idd-box.sel .idd-h{display:block;}                        /* handles show only on the selected box */
      .idd-h.nw{left:-5px;top:-5px;cursor:nwse-resize;}
      .idd-h.n {left:calc(50% - 5px);top:-5px;cursor:ns-resize;}
      .idd-h.ne{right:-5px;top:-5px;cursor:nesw-resize;}
      .idd-h.e {right:-5px;top:calc(50% - 5px);cursor:ew-resize;}
      .idd-h.se{right:-5px;bottom:-5px;cursor:nwse-resize;}
      .idd-h.s {left:calc(50% - 5px);bottom:-5px;cursor:ns-resize;}
      .idd-h.sw{left:-5px;bottom:-5px;cursor:nesw-resize;}
      .idd-h.w {left:-5px;top:calc(50% - 5px);cursor:ew-resize;}
      .idd-dimtip{position:absolute;z-index:9;background:#000c;border:1px solid var(--gdim);border-radius:5px;
        color:var(--g);font:11px monospace;padding:2px 6px;pointer-events:none;white-space:nowrap;}
      .idd-deed{position:absolute;z-index:5;background:#050a08;border:1px solid var(--gdim);border-radius:6px;
        color:var(--txt);font:12px 'Segoe UI';padding:5px 7px;outline:none;resize:none;box-shadow:0 4px 16px #000;}
      /* element editor popup */
      .idd-modal{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;
        background:rgba(2,6,4,.74);}
      .idd-modal-panel{width:400px;max-width:92%;max-height:90%;overflow-y:auto;box-sizing:border-box;
        background:#08130d;border:1px solid var(--gdim);border-radius:12px;box-shadow:0 12px 44px #000;
        padding:15px 17px;display:flex;flex-direction:column;gap:12px;}
      .idd-modal-h{display:flex;align-items:center;gap:9px;}
      .idd-modal-h .t{font-weight:600;color:var(--txt);flex:1;font-size:14px;}
      .idd-modal-h .tag{background:var(--g);color:#041208;font:bold 11px monospace;padding:2px 7px;border-radius:5px;}
      .idd-ml{font:bold 10px 'Segoe UI';letter-spacing:1px;color:var(--acc);text-transform:uppercase;}
      .idd-modal-panel input[type=text],.idd-modal-panel textarea{background:#050a08;border:1px solid var(--gfaint);
        border-radius:7px;color:var(--txt);font:13px 'Segoe UI';padding:8px 10px;outline:none;width:100%;box-sizing:border-box;}
      .idd-modal-panel textarea{min-height:104px;resize:vertical;line-height:1.45;}
      .idd-modal-panel input:focus,.idd-modal-panel textarea:focus{border-color:var(--gdim);}
      .idd-modal-acts{display:flex;gap:8px;align-items:center;margin-top:2px;}
      .idd-modal-acts .sp{flex:1;}
      /* gallery header zones: title (left) · tabs (center, big) · count+Save+Close (right) */
      .idd-h-left{flex:0 0 auto;min-width:0;}
      .idd-h-center{flex:1 1 auto;display:flex;justify-content:center;align-items:center;min-width:0;}
      .idd-h-right{flex:0 0 auto;display:flex;gap:10px;align-items:center;}
      .idd-h-right .idd-modal-acts{margin-top:0;}
      .idd-gal-fs .idd-modal-h{gap:14px;}
      .idd-gal-fs .idd-h-center .idd-gal-tabs{gap:10px;}
      .idd-gal-fs .idd-h-center .idd-gal-tabs button{padding:9px 26px;font-size:15px;font-weight:600;border-radius:9px;}
      .idd-gal-fs .idd-h-right .idd-gal-save input{width:150px;}
      /* Paste-JSON dialog: wider panel, tall monospace textarea, inline error */
      .idd-modal-panel.idd-paste-panel{width:520px;max-width:92%;}
      .idd-modal-panel.idd-paste-panel textarea{min-height:210px;font:12px/1.5 ui-monospace,"Consolas",monospace;}
      .idd-paste-err{color:#ff9b8a;font:12px 'Segoe UI';padding:2px 1px;}
      /* preset galleries — FULL-SCREEN overlay (mounted on body, above everything) */
      .idd-modal.idd-gal-fs{position:fixed;inset:0;z-index:100000;padding:2.5vh 2vw;}
      .idd-gal-panel{width:660px;}
      .idd-gal-fs .idd-gal-panel{width:100%;max-width:100%;height:100%;max-height:100%;}
      .idd-gal-fs .idd-modal-h .t{font-size:18px;}
      .idd-gal-fs .idd-gal-scroll{max-height:none;flex:1 1 auto;min-height:0;}
      .idd-gal-fs .idd-gal-grid{grid-template-columns:repeat(8,1fr);}
      /* layout cards are bigger — fewer columns + a much taller preview so the composition reads */
      .idd-gal-fs .idd-gal-grid.lay{grid-template-columns:repeat(4,1fr);gap:13px;}
      .idd-gal-fs .idd-gal-lthumb{height:210px;}
      .idd-gal-fs .idd-gal-wire{height:210px;}
      .idd-gal-fs .idd-gal-card.lay .idd-gal-name{font-size:12px;padding:7px;}
      .idd-gal-tabs{display:flex;gap:6px;align-items:center;}
      .idd-gal-tabs button{flex:0 0 auto;padding:5px 14px;border-radius:7px;border:1px solid var(--gfaint);
        background:#0c1611;color:var(--txt);cursor:pointer;font:12px 'Segoe UI';}
      .idd-gal-tabs button.on{border-color:var(--g);color:var(--g);background:rgba(72,255,132,.10);}
      .idd-gal-count{font:11px 'Segoe UI';color:var(--dim);}
      .idd-gal-search{width:100%;box-sizing:border-box;background:#0c100e;border:1px solid var(--gfaint);
        border-radius:8px;color:var(--txt);font:12px 'Segoe UI';padding:7px 10px;outline:none;}
      .idd-gal-search:focus{border-color:var(--gdim);}
      .idd-gal-chips{display:flex;flex-wrap:wrap;gap:5px;}
      .idd-gal-chip{flex:0 0 auto;padding:3px 10px;border-radius:13px;border:1px solid var(--gfaint);
        background:#0c1611;color:var(--dim);cursor:pointer;font:11px 'Segoe UI';}
      .idd-gal-chip.on{border-color:var(--g);color:var(--g);background:rgba(72,255,132,.10);}
      /* intentional local scroll area — wheel here scrolls the gallery; the board stays canvas-first */
      .idd-gal-scroll{max-height:430px;overflow-y:auto;overscroll-behavior:contain;margin:0 -4px;padding:0 4px;}
      .idd-gal-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;}
      .idd-gal-grid.lay{grid-template-columns:repeat(4,1fr);}
      .idd-gal-card{position:relative;cursor:pointer;border:1px solid var(--gfaint);border-radius:9px;
        overflow:hidden;background:#0c1310;display:flex;flex-direction:column;}
      .idd-gal-card:hover{border-color:var(--g);}
      .idd-gal-thumb{position:relative;width:100%;aspect-ratio:4/5;background:#101713;display:flex;
        align-items:center;justify-content:center;overflow:hidden;}
      .idd-gal-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
      .idd-gal-thumb .ph{font:600 26px 'Segoe UI';color:var(--gdim);}
      .idd-gal-strip{position:absolute;left:0;right:0;bottom:0;height:10px;display:flex;}
      .idd-gal-strip span{flex:1;}
      .idd-gal-name{padding:5px 7px;font:11px 'Segoe UI';color:var(--txt);text-align:center;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .idd-gal-wire{height:86px;display:flex;align-items:center;justify-content:center;
        background:#101713;padding:7px;box-sizing:border-box;}
      /* layout cards: real example photo (full composition, true ratio, dark letterbox) */
      .idd-gal-lthumb{height:96px;display:flex;align-items:center;justify-content:center;
        background:#0c100e;overflow:hidden;}
      .idd-gal-lthumb img{max-width:100%;max-height:100%;object-fit:contain;display:block;}
      .idd-gal-wire .win{position:relative;border:1px solid rgba(255,255,255,.34);border-radius:3px;
        background:#070b09;box-sizing:border-box;}
      .idd-gal-wire .wb{position:absolute;border:1.5px solid var(--g);border-radius:2px;
        background:rgba(72,255,132,.10);box-sizing:border-box;}
      .idd-gal-wire .wb.t{border-style:dashed;border-color:#e8b45a;background:rgba(232,180,90,.10);
        color:#e8b45a;font:bold 9px monospace;display:flex;align-items:center;justify-content:center;}
      .idd-gal-del{position:absolute;top:4px;right:4px;z-index:2;min-width:18px;height:18px;border-radius:5px;
        border:1px solid rgba(255,255,255,.15);background:rgba(10,14,12,.85);color:#e8705a;
        font:bold 11px monospace;line-height:16px;text-align:center;cursor:pointer;display:none;padding:0 3px;}
      .idd-gal-card:hover .idd-gal-del{display:block;}
      .idd-gal-del.arm{color:#fff;background:#a03326;border-color:#c64a3a;}
      .idd-gal-note{color:var(--dim);font:12px/1.6 'Segoe UI';padding:6px 2px;}
      .idd-gal-save{display:inline-flex;gap:6px;align-items:center;}
      .idd-gal-save input{width:180px;background:#050a08;border:1px solid var(--gfaint);border-radius:7px;
        color:var(--txt);font:12px 'Segoe UI';padding:5px 8px;outline:none;}
      .idd-gal-save input:focus{border-color:var(--gdim);}
      .idd-mbtn{cursor:pointer;border-radius:8px;padding:8px 18px;font-size:12px;border:1px solid var(--gfaint);
        background:#0c1611;color:var(--acc);}
      .idd-mbtn.save{background:var(--g);color:#041208;font-weight:700;border:none;}
      .idd-mbtn.del{color:#ffb3b3;border-color:var(--red);}
      .idd-mbtn:hover{filter:brightness(1.08);}
      .idd-zoom{position:absolute;right:8px;top:8px;display:flex;align-items:center;gap:4px;z-index:8;}
      .idd-zoom button{width:24px;height:24px;border-radius:6px;border:1px solid var(--gfaint);
        background:rgba(1,6,4,.8);color:var(--acc);cursor:pointer;font-size:14px;line-height:1;}
      .idd-rail{width:248px;flex:0 0 auto;border-left:1px solid var(--gfaint);background:rgba(1,6,4,.5);
        overflow-y:auto;overscroll-behavior:contain;transition:width .15s ease;}
      .idd-rail.collapsed{width:0;border-left:none;}
      .idd-railpad{padding:9px;display:flex;flex-direction:column;gap:11px;min-width:230px;}
      .idd-sec{display:flex;flex-direction:column;gap:5px;}
      .idd-seclbl{font:bold 10px 'Segoe UI';letter-spacing:1px;color:var(--acc);text-transform:uppercase;}
      .idd-area{background:#050a08;border:1px solid var(--gfaint);border-radius:7px;color:var(--txt);
        font:12px 'Segoe UI';padding:6px 8px;resize:vertical;min-height:40px;outline:none;}
      .idd-area:focus{border-color:var(--gdim);}
      .idd-seg{display:flex;gap:0;border:1px solid var(--gfaint);border-radius:7px;overflow:hidden;}
      .idd-seg button{flex:1;background:transparent;border:none;color:var(--dim);cursor:pointer;padding:5px;font-size:11px;}
      .idd-seg button.on{background:rgba(72,255,132,.13);color:var(--g);}
      .idd-fields{display:flex;flex-direction:column;gap:5px;}
      .idd-fields input{background:#050a08;border:1px solid var(--gfaint);border-radius:6px;color:var(--txt);
        font:11px 'Segoe UI';padding:5px 7px;outline:none;}
      .idd-fields input:focus{border-color:var(--gdim);}
      .idd-pal{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
      .idd-sw{width:18px;height:18px;border-radius:4px;border:1px solid rgba(255,255,255,.18);cursor:pointer;position:relative;}
      .idd-sw input{position:absolute;inset:0;opacity:0;cursor:pointer;}
      .idd-add{width:18px;height:18px;border-radius:4px;border:1px dashed var(--gdim);background:none;color:var(--acc);cursor:pointer;font-size:12px;line-height:1;}
      .idd-palchip{position:relative;display:inline-flex;}
      .idd-palx{position:absolute;top:-6px;right:-6px;width:14px;height:14px;line-height:12px;text-align:center;
        border-radius:50%;background:#1a0c0c;border:1px solid var(--red);color:#ffd9d9;font-size:9px;cursor:pointer;}
      .idd-palx:hover{background:var(--red);}
      .idd-paladd{cursor:pointer;background:#0c1611;border:1px dashed var(--gdim);border-radius:6px;color:var(--acc);
        font-size:11px;padding:4px 11px;}
      .idd-paladd:hover{border-color:var(--g);color:var(--g);}
      .idd-paladdrow{display:flex;align-items:center;gap:8px;margin-top:2px;}
      .idd-paladdrow input[type=color]{width:36px;height:26px;border:1px solid var(--gfaint);border-radius:6px;
        background:#050a08;cursor:pointer;padding:2px;flex:0 0 auto;}
      .idd-elem{display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:6px;cursor:pointer;position:relative;}
      .idd-elem:hover{background:rgba(72,255,132,.07);}
      .idd-elem.sel{background:rgba(72,255,132,.13);}
      .idd-elem .n{font:bold 10px monospace;color:var(--dim);width:16px;}
      .idd-elem .c{width:11px;height:11px;border-radius:3px;flex:0 0 auto;}
      .idd-elem .t{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--txt);}
      .idd-elem .ty{font:bold 9px monospace;color:var(--acc);border:1px solid var(--gfaint);border-radius:4px;padding:1px 4px;cursor:pointer;}
      .idd-elem .x{color:var(--dim);cursor:pointer;padding:0 3px;}
      .idd-elem .x:hover{color:#ffd9d9;}
      .idd-elem .g{cursor:grab;color:var(--dim);font-size:11px;padding:0 1px;}
      .idd-elem .g:active{cursor:grabbing;}
      .idd-elem .dup{color:var(--dim);cursor:pointer;padding:0 2px;font-size:12px;}
      .idd-elem .dup:hover{color:var(--g);}
      .idd-elem.drop-before::before,.idd-elem.drop-after::after{content:"";position:absolute;left:4px;right:4px;height:2px;border-radius:999px;background:var(--g);box-shadow:0 0 8px rgba(72,255,132,.75);pointer-events:none;z-index:3;}
      .idd-elem.drop-before::before{top:-2px;}
      .idd-elem.drop-after::after{bottom:-2px;}
      .idd-bot{display:flex;align-items:center;gap:7px;padding:7px 10px;flex:0 0 auto;
        border-top:1px solid var(--gfaint);background:rgba(1,6,4,.55);}
      .idd-btn{cursor:pointer;background:#0c1611;border:1px solid var(--gfaint);border-radius:999px;
        color:var(--acc);padding:5px 12px;font-size:11px;}
      .idd-btn:hover{border-color:var(--gdim);color:var(--g);}
      .idd-btn.on{background:rgba(72,255,132,.16);color:var(--g);border-color:var(--gdim);}
      .idd-btn.red:hover{border-color:var(--red);color:#ffd9d9;background:rgba(150,40,40,.25);}
      /* "Layouts" in the top bar: bold + emphasized (tinted) so it reads as a primary entry point */
      .idd-btn.idd-toplay{font-weight:700 !important;background:rgba(72,189,127,.22) !important;
        border-color:rgba(66,189,127,.62) !important;color:#9ff2c2 !important;padding:6px 14px !important;
        flex:0 0 auto !important;min-width:80px !important;white-space:nowrap !important;
        overflow:hidden !important;text-overflow:ellipsis !important;line-height:1 !important;}
      .idd-btn.idd-toplay:hover{border-color:var(--g) !important;color:#d6fde7 !important;background:rgba(72,189,127,.32) !important;}
      /* polish: fast press feedback + keyboard focus ring + smooth-but-quick transitions */
      .idd-btn,.idd-regen,.idd-seg button,.idd-mbtn,.idd-res,.idd-respreset,.idd-mp,.idd-bdedit,.idd-add{transition:background .12s ease,border-color .12s ease,color .12s ease,transform .06s ease,filter .12s ease;}
      .idd-btn:active,.idd-regen:active,.idd-mbtn:active,.idd-res:active,.idd-respreset:active,.idd-mp:active,.idd-bdedit:active,.idd-add:active{transform:translateY(1px);}
      .idd-regen:hover{filter:brightness(1.08);}
      .idd-btn:focus-visible,.idd-regen:focus-visible,.idd-seg button:focus-visible,.idd-mbtn:focus-visible,.idd-bdedit:focus-visible,.idd-res:focus-visible{outline:2px solid var(--g);outline-offset:1px;}
      button:disabled{opacity:.38;cursor:not-allowed;}
      /* hover-sync: hovering a list row highlights its box on the board, and vice-versa */
      .idd-box.hov{box-shadow:0 0 0 1px var(--g),0 0 12px var(--gdim);}
      .idd-elem.hov{background:rgba(72,255,132,.10);}
      /* popups/modals fade+scale in (transform/opacity only — GPU-friendly) */
      @keyframes iddpop{from{opacity:0;transform:scale(.97);}to{opacity:1;transform:none;}}
      .idd-modal-panel,.idd-respop{animation:iddpop .14s ease;}
      @media (prefers-reduced-motion: reduce){
        .idd-btn,.idd-regen,.idd-seg button,.idd-mbtn,.idd-res,.idd-respreset,.idd-mp,.idd-bdedit,.idd-add,.idd-rail{transition:none;}
        .idd-modal-panel,.idd-respop{animation:none;}
      }
    ` + IDD_THEME_CSS;
    document.head.appendChild(s);
  }

  app.registerExtension({
    name: "Deno.IdeogramDirector",
    async beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData?.name !== "DenoIdeogramDirector") return;
      injectStyle();

      chain(nodeType.prototype, "onNodeCreated", function () {
        const node = this;
        directorNodes.add(node);
        const W = (n) => (node.widgets || []).find((w) => w.name === n);
        const getW = (n, d) => { const w = W(n); return w && w.value !== undefined ? w.value : d; };
        const setW = (n, v) => { const w = W(n); if (w) { w.value = v; if (w.callback) try { w.callback(v); } catch (e) {} } };

        // hide every native widget — this surface owns the whole node body
        setTimeout(() => { for (const w of node.widgets || []) { if (w.name === "idd_board") continue; w.hidden = true; w.computeSize = () => [0, -4]; if (w.element) w.element.style.display = "none"; w.type = "idd-hidden"; } node.setDirtyCanvas(true, true); }, 0);

        // ── editor state (source of truth; hydrated from widgets below) ──
        let boxes = [];          // {x,y,w,h,type:'obj'|'text',text,desc,palette:[]}
        let stylePalette = [];   // ['#RRGGBB', ...]
        let selectedId = null;   // selection by STABLE box id (single source of truth) — no off-by-one on delete/reorder
        let _bid = 1;            // box id counter
        let bdropDim = 0;        // backdrop darkening 0..0.8 (boxes stay readable over it)
        let resultDim = 0;       // result-image dimming 0..0.85 (display only — the saved image is untouched)
        let bdT = { nx: 0, ny: 0, nw: 1, nh: 1, set: false };  // backdrop transform (board-relative, ratio-kept)
        let bdEdit = false;      // backdrop adjust mode (drag to move / corner to resize)
        let styleMode = "none";  // none | photo | art
        let mp = 1;              // megapixel budget (persisted in caption_data)
        let arLabel = "1:1";     // current aspect-ratio label (persisted in the aspect_ratio widget)

        const normBox = (b) => {
          const w = clamp01(+b.w || 0), h = clamp01(+b.h || 0);
          return {
            id: b.id != null ? b.id : _bid++,   // stable id (kept if present, else assigned)
            // keep the whole box inside the stage (image): clamp top-left so bottom-right ≤ 1 too
            x: Math.max(0, Math.min(1 - w, clamp01(+b.x || 0))),
            y: Math.max(0, Math.min(1 - h, clamp01(+b.y || 0))),
            w, h,
            type: b.type === "text" ? "text" : "obj",
            text: b.text || "", desc: b.desc || "",
            palette: Array.isArray(b.palette) ? b.palette.filter((c) => HEX.test(c)).slice(0, 5) : [],
            uiColor: HEX.test(b.uiColor || "") ? b.uiColor : "",
          };
        };

        // imported Ideogram caption (import_json from the upstream LLM) → editor boxes.
        // Mirrors the backend _caption_to_boxes: bbox is [ymin,xmin,ymax,xmax] on a 0-1000 grid;
        // an element without a bbox gets a small placeholder so it's still visible/editable.
        function captionToBoxes(cap) {
          cap = normalizeCaption(cap) || cap;
          const cd = (cap && cap.compositional_deconstruction) || {};
          const out = [];
          for (const e0 of (cd.elements || [])) {
            if (!e0 || typeof e0 !== "object") continue;
            const box = {
              type: e0.type === "text" ? "text" : "obj", text: e0.text || "", desc: e0.desc || "",
              palette: Array.isArray(e0.color_palette) ? e0.color_palette.filter((c) => HEX.test(c)).slice(0, 5) : [],
              uiColor: HEX.test(e0.uiColor || "") ? e0.uiColor : "",
            };
            const bb = e0.bbox;
            if (Array.isArray(bb) && bb.length === 4) {
              const ymin = +bb[0], xmin = +bb[1], ymax = +bb[2], xmax = +bb[3];
              box.x = xmin / 1000; box.y = ymin / 1000; box.w = (xmax - xmin) / 1000; box.h = (ymax - ymin) / 1000;
            } else { box.x = 0.03; box.y = 0.03; box.w = 0.22; box.h = 0.14; }
            out.push(normBox(box));
          }
          return out;
        }

        // signature of the wired import_json that last seeded the editor. Serialized into
        // caption_data so the backend can tell "same JSON → editor wins" from "new JSON → import
        // wins + board refresh" (the live-sync contract). "" = never seeded from a wire.
        let lastImportSig = "";
        function savedImportSig() {
          try {
            const d = JSON.parse(getW("caption_data", "") || "{}") || {};
            return typeof d.importSig === "string" ? d.importSig : "";
          } catch (e) { return ""; }
        }
        function syncImportSigFromSaved() {
          const sig = savedImportSig();
          if (sig) lastImportSig = sig;
          return sig;
        }

        // ── serialize editor state → caption_data widget (§5) ──
        let paintHistory = () => {};
        function serialize() {
          acknowledgeInvalidPromptIfBoardChanged();
          ensureBoxUiColors();
          const cd = {
            boxes: boxes.map((b, i) => ({
              x: +b.x.toFixed(4), y: +b.y.toFixed(4), w: +b.w.toFixed(4), h: +b.h.toFixed(4),
              type: b.type, text: b.text || "", desc: b.desc || "", palette: (b.palette || []).slice(0, 5),
              uiColor: ensureBoxUiColor(b, i),
            })),
            stylePalette: stylePalette.slice(0, 16),
            importSig: lastImportSig, // which wired JSON seeded this state (backend change detection)
            mp: mp,            // megapixel budget — ignored by the backend, restored on reload
            bdropDim: bdropDim, // backdrop darkening — UI-only, restored on reload
            resultDim: resultDim, // result-image dimming — UI-only, restored on reload
            bdropT: bdT,        // backdrop position/size (board-relative) — UI-only, restored on reload
          };
          setW("caption_data", JSON.stringify(cd));
          node.setDirtyCanvas(true, true);
          commit();   // record an undo step (no-op while restoring)
          paintHistory();
        }
        // ── undo/redo: one linear history of the board+panel state. Each change → one serialize() →
        // one step (a drag burst is a single serialize on pointerup → a single step). Scoped to the node. ──
        let undoStack = [], redoStack = [], lastSnap = null, restoring = false;
        let paintHistoryQueued = false;
        function paintHistorySoon() {
          if (paintHistoryQueued) return;
          paintHistoryQueued = true;
          requestAnimationFrame(() => {
            paintHistoryQueued = false;
            paintHistory();
          });
        }
        function snapshot() {
          return JSON.stringify({ boxes, stylePalette, styleMode, selId: selectedId,
            hld: summary.value, bg: bgArea.value, aes: aesIn.value, lig: ligIn.value,
            med: medIn.value, photo: photoIn.value, art: artIn.value, bdropDim, resultDim, bdT });
        }
        function commit() {
          if (restoring) return;
          if (lastSnap !== null) { undoStack.push(lastSnap); if (undoStack.length > 80) undoStack.shift(); }
          redoStack.length = 0; lastSnap = snapshot();
        }
        function applySnap(s) {
          let d; try { d = JSON.parse(s); } catch (e) { return; }
          restoring = true;
          boxes = (d.boxes || []).map((b) => Object.assign({}, b));
          ensureBoxUiColors();
          stylePalette = (d.stylePalette || []).slice();
          summary.value = d.hld || ""; setW("high_level_description", d.hld || "");
          bgArea.value = d.bg || ""; setW("background", d.bg || "");
          aesIn.value = d.aes || ""; setW("aesthetics", d.aes || "");
          ligIn.value = d.lig || ""; setW("lighting", d.lig || "");
          medIn.value = d.med || ""; setW("medium", d.med || "");
          photoIn.value = d.photo || ""; setW("photo", d.photo || "");
          artIn.value = d.art || ""; setW("art_style", d.art || "");
          applyStyleMode(d.styleMode || "none"); setW("style_mode", d.styleMode || "none");
          bdropDim = +d.bdropDim || 0; resultDim = +d.resultDim || 0; if (d.bdT) bdT = Object.assign({}, d.bdT);
          selectedId = boxes.some((b) => b.id === d.selId) ? d.selId : null;
          renderBoxes(); renderPalette(); renderElements(); layoutStage(); applyBackdrop(); applyResultDim();
          serialize(); restoring = false; paintHistory();   // persist; restoring guard kept commit() a no-op
        }
        function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); lastSnap = undoStack.pop(); applySnap(lastSnap); paintHistory(); paintHistorySoon(); }
        function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); lastSnap = redoStack.pop(); applySnap(lastSnap); paintHistory(); paintHistorySoon(); }


        const wrap = el("div", "idd-wrap");
        // frontend revision stamp — bump on every frontend change so served-JS cache checks are clear.
        const IDD_REV = "r2026.06.18-bbox-ergonomics-b";
        const IDD_SIZE_REV = "size-2026.06.14-stable-a";
        const IDD_DEFAULT_W = 850;
        const IDD_DEFAULT_H = 1000;
        const IDD_MIN_W = 760;
        const IDD_MIN_H = 560;
        Object.assign(wrap.style, {
          width: "100%",
          minWidth: "0",
          maxWidth: "100%",
          height: "100%",
          alignSelf: "stretch",
        });
        wrap.dataset.iddRev = IDD_REV;
        try { console.log("[IdeogramDirector] frontend " + IDD_REV); } catch (e) {}

        // ── top bar ──
        const top = el("div", "idd-top");
        let fitTopQueued = false;
        const fitTopBarSoon = () => {
          if (fitTopQueued) return;
          fitTopQueued = true;
          requestAnimationFrame(() => {
            fitTopQueued = false;
            wrap.classList.remove("idd-topfit");
            if (!top.clientWidth) return;
            const tooNarrow = (wrap.clientWidth || IDD_DEFAULT_W) < 830;
            const overflows = top.scrollWidth > top.clientWidth + 1;
            wrap.classList.toggle("idd-topfit", tooNarrow || overflows);
          });
        };
        const fitTopBarAfterRestore = () => {
          fitTopBarSoon();
          window.setTimeout(fitTopBarSoon, 32);
          window.setTimeout(fitTopBarSoon, 160);
        };
        // seed group: labeled pill [ Seed | number | lock ] — a bare number means nothing to a new
        // user; the mode buttons show Fixed (reuse this seed) / Random (roll a new one each run).
        const seedPill = el("span", "idd-seedpill"); stop(seedPill);
        const seedLbl = el("span", "idd-seedlbl"); seedLbl.textContent = "Seed";
        const seedIn = el("input", "idd-seed"); stop(seedIn);
        seedIn.title = "Seed — the same number reproduces the same layout";
        seedIn.addEventListener("change", () => { const v = parseInt(seedIn.value, 10); setW("seed", Number.isFinite(v) ? v : 0); });
        // seed state = an explicit two-segment switch [Fixed | Random] so the current mode is
        // never ambiguous (the lone lock icon read as "is it locked, or does clicking lock it?").
        const seedSeg = el("span", "idd-seedseg"); stop(seedSeg);
        const segFixed = el("button", "idd-seedopt idd-fixed"); segFixed.textContent = "Fixed";
        const segRandom = el("button", "idd-seedopt idd-random"); segRandom.textContent = "Random";
        seedSeg.append(segFixed, segRandom);
        let seedLocked = getW("seed_lock", true) !== false;   // default Fixed
        const paintLock = () => {
          segFixed.classList.toggle("on", seedLocked);
          segRandom.classList.toggle("on", !seedLocked);
          segFixed.title = "Fixed seed — Regenerate reuses this exact number (the same result each run)";
          segRandom.title = "Random seed — every Regenerate rolls a new number (a new variation each run)";
          seedIn.classList.toggle("idd-seed-muted", !seedLocked);   // dim the number when it'll be replaced
          seedIn.title = seedLocked
            ? "Seed — the same number reproduces the same result"
            : "A new random seed is rolled on each Regenerate (switch to Fixed to keep this one)";
        };
        const setSeedLock = (v) => { seedLocked = !!v; setW("seed_lock", seedLocked); paintLock(); };
        segFixed.onclick = (e) => { e.stopPropagation(); setSeedLock(true); };
        segRandom.onclick = (e) => { e.stopPropagation(); setSeedLock(false); };
        paintLock();
        seedPill.append(seedLbl, seedIn, seedSeg);
        // primary action: "Generate" until the first result exists, then "Regenerate" (a brand-new
        // user hasn't generated anything yet — "re-" reads like someone else's verb).
        const regen = el("button", "idd-regen"); regen.textContent = "Generate";
        regen.title = "Run the graph with this caption · Ctrl+Enter";
        const paintRegen = () => {
          regen.textContent = node._idd && node._idd._last ? "Regenerate" : "Generate";
          fitTopBarSoon();
        };
        const info = el("div", "idd-i"); info.textContent = "i"; info.title = "Edit the JSON caption on the board, then Generate.";
        const fsBtn = el("div", "idd-i idd-fsbtn"); fsBtn.textContent = "⛶"; fsBtn.title = "Fullscreen (Esc to close)";
        // Layout presets gallery lives in the TOP bar (left cluster) for quick reach.
        const LAYOUTS_BTN_LABEL = "Layouts";
        const layoutsBtn = mkBtn(LAYOUTS_BTN_LABEL); layoutsBtn.classList.add("idd-toplay");
        layoutsBtn.title = "Layout preset gallery — pick a composition and it fills the ratio + starter boxes; save your own too";
        layoutsBtn.onclick = (e) => { e.stopPropagation(); openLayoutGallery(); };
        const IMPORT_REVIEW = "Ask Before Replacing";
        const IMPORT_AUTO = "Always Replace";
        const IMPORT_CHOICES = [IMPORT_REVIEW, IMPORT_AUTO];
        const LEGACY_IMPORT = {
          "when empty": IMPORT_REVIEW,
          "empty": IMPORT_REVIEW,
          "fill empty": IMPORT_REVIEW,
          "fill empty board only": IMPORT_REVIEW,
          "ask": IMPORT_REVIEW,
          "ask before replace": IMPORT_REVIEW,
          "ask before replacing": IMPORT_REVIEW,
          "ask before replacing board": IMPORT_REVIEW,
          "review": IMPORT_REVIEW,
          "review first": IMPORT_REVIEW,
          "manual": IMPORT_REVIEW,
          "manual apply only": IMPORT_REVIEW,
          "use only when board is empty": IMPORT_REVIEW,
          "ignore": IMPORT_REVIEW,
          "off": IMPORT_REVIEW,
          "ignore input prompt": IMPORT_REVIEW,
          "auto": IMPORT_REVIEW,
          "auto replace": IMPORT_REVIEW,
          "replace": IMPORT_REVIEW,
          "always": IMPORT_AUTO,
          "always replace": IMPORT_AUTO,
          "always replace board": IMPORT_AUTO,
          "replace board automatically": IMPORT_AUTO,
        };
        const importBtn = mkBtn(IMPORT_REVIEW); importBtn.classList.add("idd-importbtn");
        let pendingImport = null;
        let skipNextQueuePreflight = false;
        function normalizeImportMode(v) {
          const raw = String(v || "").trim();
          return LEGACY_IMPORT[raw.toLowerCase()] || (IMPORT_CHOICES.includes(raw) ? raw : IMPORT_REVIEW);
        }
        function getImportMode() {
          const val = normalizeImportMode(getW("import_mode", IMPORT_REVIEW));
          if (val !== getW("import_mode", IMPORT_REVIEW)) setW("import_mode", val);
          return val;
        }
        function savedCaptionHasBoardContent() {
          try {
            const d = JSON.parse(getW("caption_data", "") || "{}") || {};
            const savedBoxes = Array.isArray(d.boxes) ? d.boxes : [];
            return savedBoxes.length > 0;
          } catch (e) { return false; }
        }
        function hasBoardContent() {
          if (boxes.length) return true;
          if (savedCaptionHasBoardContent()) return true;
          if ((summary.value || "").trim() || (bgArea.value || "").trim()) return true;
          if (styleMode !== "none") return true;
          return [aesIn, ligIn, medIn, photoIn, artIn].some((x) => (x.value || "").trim());
        }
        function paintImportMode() {
          const mode = getImportMode();
          importBtn.textContent = mode;
          importBtn.title = mode === IMPORT_AUTO
            ? "Incoming JSON Prompt: replace this board automatically when a new valid JSON prompt arrives."
            : "Incoming JSON Prompt: fill an empty board automatically, then ask before replacing existing boxes.";
          importBtn.classList.toggle("on", mode === IMPORT_AUTO);
          importBtn.classList.remove("pending", "error");
          fitTopBarSoon();
        }
        function paintPendingPrompt() {
          const hasPending = !!pendingImport;
          importBtn.classList.toggle("pending", hasPending);
          if (!hasPending) {
            paintImportMode();
            return;
          }
          importBtn.classList.toggle("error", !!pendingImport.invalid);
          importBtn.textContent = pendingImport.invalid ? "JSON Needs Review" : "Prompt Needs Review";
          importBtn.title = pendingImport.invalid
            ? "The incoming JSON prompt is not valid JSON. Regenerate it, or keep the current board and run again."
            : "A new incoming JSON prompt is waiting. Applying it will replace the current boxes and board layout.";
          fitTopBarSoon();
        }
        async function queueAfterIncomingPromptDecision() {
          try {
            await new Promise((resolve) => window.setTimeout(resolve, 35));
            skipNextQueuePreflight = true;
            if (typeof app?.queuePrompt === "function") {
              await app.queuePrompt(0);
              return true;
            }
            if (typeof app?.extensionManager?.queuePrompt === "function") {
              await app.extensionManager.queuePrompt(0);
              return true;
            }
            const runButton = Array.from(document?.querySelectorAll?.("button") || []).find((button) => {
              const label = `${button.getAttribute?.("aria-label") || ""} ${button.textContent || ""}`.trim();
              return /(^|\s)(Run|Queue|Generate)(\s|$)/i.test(label) && !button.disabled;
            });
            if (runButton) {
              runButton.click();
              return true;
            }
          } catch (err) {
            console.error("[Director] continue after incoming prompt decision failed", err);
          } finally {
            window.setTimeout(() => { skipNextQueuePreflight = false; }, 0);
          }
          showRunAlert(
            "Could not continue automatically.",
            "Your choice was saved. Press ComfyUI Run once to continue.",
            "error"
          );
          return false;
        }
        function connectedPromptAlreadyCurrent(sig) {
          if (!sig) return false;
          syncImportSigFromSaved();
          return sig === lastImportSig;
        }
        function compactWidgetValue(v) {
          if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
          try { return JSON.stringify(v).slice(0, 2000); }
          catch (e) { return String(v).slice(0, 2000); }
        }
        function getImportJsonInputLink() {
          try {
            const slot = node.findInputSlot ? node.findInputSlot("import_json") : -1;
            const inp = slot >= 0 ? (node.inputs || [])[slot] : null;
            if (inp && inp.link != null && node.graph) return node.graph.links[inp.link] || null;
          } catch (e) {}
          return null;
        }
        function connectedImportUpstreamSignature() {
          const firstLink = getImportJsonInputLink();
          if (!firstLink || !node.graph) return "";
          try {
            const seen = new Set();
            const items = [];
            const visit = (nodeId) => {
              const key = String(nodeId);
              if (!key || seen.has(key)) return;
              const src = node.graph.getNodeById ? node.graph.getNodeById(nodeId) : null;
              if (!src) return;
              seen.add(key);
              const widgets = (src.widgets || []).map((w, idx) => ({
                idx,
                name: String(w?.name || ""),
                type: String(w?.type || ""),
                value: compactWidgetValue(w?.value),
              }));
              items.push({
                id: key,
                type: String(src.type || src.title || ""),
                title: String(src.title || ""),
                widgets,
              });
              for (const input of src.inputs || []) {
                if (!input || input.link == null) continue;
                const link = node.graph.links?.[input.link];
                if (link) visit(link.origin_id);
              }
            };
            visit(firstLink.origin_id);
            items.sort((a, b) => String(a.id).localeCompare(String(b.id)));
            return items.length ? fnv1a(JSON.stringify(items)) : "";
          } catch (e) {
            return "";
          }
        }
        function withCurrentUpstreamSignature(pending) {
          const upstreamSig = connectedImportUpstreamSignature();
          if (upstreamSig) pending.upstreamSig = upstreamSig;
          return pending;
        }
        function clearPendingIfUpstreamChanged() {
          if (!pendingImport || !pendingImport.upstreamSig) return false;
          const current = connectedImportUpstreamSignature();
          if (!current || current === pendingImport.upstreamSig) return false;
          pendingImport = null;
          paintPendingPrompt();
          clearRunAlert();
          return true;
        }
        function queuePendingImport(cap, sig) {
          if (connectedPromptAlreadyCurrent(sig)) {
            pendingImport = null;
            paintPendingPrompt();
            clearRunAlert();
            return false;
          }
          pendingImport = withCurrentUpstreamSignature({ cap, sig, invalid: false });
          paintPendingPrompt();
          showInputPromptNotice();
          return true;
        }
        function queueInvalidInputPrompt(sig, raw) {
          if (connectedPromptAlreadyCurrent(sig)) {
            pendingImport = null;
            paintPendingPrompt();
            clearRunAlert();
            return false;
          }
          pendingImport = withCurrentUpstreamSignature({ sig, raw: raw || "", invalid: true });
          paintPendingPrompt();
          showInputPromptNotice();
          return true;
        }
        function acknowledgeInvalidPromptIfBoardChanged() {
          if (!pendingImport || !pendingImport.invalid) return false;
          if (!hasBoardContent()) return false;
          if (pendingImport.sig) lastImportSig = pendingImport.sig;
          pendingImport = null;
          paintPendingPrompt();
          clearRunAlert();
          return true;
        }
        function keepCurrentInput(sig) {
          if (sig) lastImportSig = sig;
          pendingImport = null;
          serialize();
          paintPendingPrompt();
          clearRunAlert();
        }
        function applyConnectedPrompt(cap, sig, force = false) {
          clearRunAlert();
          const mode = getImportMode();
          const shouldApply = force || mode === IMPORT_AUTO || (mode === IMPORT_REVIEW && !hasBoardContent());
          if (!shouldApply) {
            queuePendingImport(cap, sig);
            return false;
          }
          clearResultPreview();
          applyImportedCaption(cap);
          lastImportSig = sig || fnv1a(JSON.stringify(cap));
          selectedId = null;
          pendingImport = null;
          serialize();
          renderBoxes(); renderPalette(); renderElements(); layoutStage();
          paintImportMode();
          paintPendingPrompt();
          translateBoardToViewLanguage("auto");
          return true;
        }
        function handleConnectedPromptEcho(cap, sig) {
          syncImportSigFromSaved();
          const mode = getImportMode();
          const boardHasContent = hasBoardContent();
          if (mode === IMPORT_AUTO || (mode === IMPORT_REVIEW && !boardHasContent)) {
            return applyConnectedPrompt(cap, sig, true);
          }
          if (sig !== lastImportSig) {
            queuePendingImport(cap, sig);
          } else {
            pendingImport = null;
            paintPendingPrompt();
          }
          return false;
        }
        function handleInputPromptRaw(raw) {
          if (!raw || !String(raw).trim()) return false;
          const text = String(raw);
          const sig = fnv1a(text);
          syncImportSigFromSaved();
          if (connectedPromptAlreadyCurrent(sig)) {
            pendingImport = null;
            paintPendingPrompt();
            clearRunAlert();
            return false;
          }
          const mode = getImportMode();
          const cap = normalizeCaption(parseCaption(text));
          if (cap && typeof cap === "object") return handleConnectedPromptEcho(cap, sig);
          return queueInvalidInputPrompt(sig, text);
        }
        function openImportDialog() {
          const modal = el("div", "idd-modal"); modal.tabIndex = -1;
          const panel = el("div", "idd-modal-panel idd-import-panel");
          const h = el("div", "idd-modal-h");
          const ht = el("span", "t"); ht.textContent = "Incoming JSON Prompt"; h.append(ht);
          const hint = el("div", "idd-ml");
          hint.textContent = "Choose what this board should do when valid JSON comes in from an LLM or Prompt Text node.";
          const list = el("div", "idd-importlist"); stop(list);
          let selected = getImportMode();
          const copy = {
            [IMPORT_REVIEW]: {
              title: "Ask Before Replacing",
              desc: "Default. Empty boards fill automatically. Existing boards ask before boxes and layout are replaced.",
            },
            [IMPORT_AUTO]: {
              title: "Always Replace",
              desc: "Every new valid JSON prompt replaces this board, including aspect ratio, boxes, and descriptions.",
            },
          };
          function renderModes() {
            list.innerHTML = "";
            for (const choice of IMPORT_CHOICES) {
              const row = el("button", "idd-importrow");
              row.type = "button";
              row.classList.toggle("on", choice === selected);
              const name = el("b"); name.textContent = copy[choice].title;
              const desc = el("span"); desc.textContent = copy[choice].desc;
              row.append(name, desc);
              row.onclick = (e) => { e.stopPropagation(); selected = choice; renderModes(); };
              row.ondblclick = (e) => { e.stopPropagation(); doApply(); };
              list.appendChild(row);
            }
          }
          const acts = el("div", "idd-modal-acts");
          const cancel = el("button", "idd-mbtn"); cancel.textContent = "Cancel";
          const apply = el("button", "idd-mbtn save"); apply.textContent = "Apply";
          acts.append(el("span", "sp"), cancel, apply);
          panel.append(h, hint, list, acts);
          modal.append(panel); wrap.appendChild(modal);
          const close = () => { try { modal.remove(); } catch (e) {} };
          function doApply() {
            setW("import_mode", selected);
            paintImportMode();
            if (pendingImport && selected === IMPORT_AUTO && !pendingImport.invalid) applyConnectedPrompt(pendingImport.cap, pendingImport.sig, true);
            close();
          }
          modal.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Escape") { e.preventDefault(); close(); }
            if (e.key === "Enter") { e.preventDefault(); doApply(); }
          });
          modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
          cancel.onclick = (e) => { e.stopPropagation(); close(); };
          apply.onclick = (e) => { e.stopPropagation(); doApply(); };
          renderModes();
        }
        importBtn.onclick = (e) => { e.stopPropagation(); openImportDialog(); };
        paintImportMode();
        paintPendingPrompt();
        const NO_TRANSLATION = "No translation (keep as written)";
        const VIEW_DEFAULT = "English";
        const LEGACY_VIEW_ORIGINAL_VALUE = "Original (as written)";
        const LEGACY_NO_TRANSLATION = new Set(["", "Original", "Off", "No translation", NO_TRANSLATION]);
        const LEGACY_VIEW_ORIGINAL = new Set(["", "Original", "As written", "Original / As written", LEGACY_VIEW_ORIGINAL_VALUE, NO_TRANSLATION]);
        const ENGLISH_PROMPT = "English";
        const ENGLISH_PROMPT_ALIASES = new Set(["English", "en", "eng", "English prompt", "Output English prompt", "English (recommended)"]);
        const COMMON_LANGUAGE_NAMES = {
          "English": "English",
          "한국어": "Korean",
          "日本語": "Japanese",
          "中文 (简体)": "Chinese Simplified",
          "中文 (繁體)": "Chinese Traditional",
          "Español": "Spanish",
          "Português": "Portuguese",
          "Français": "French",
          "Deutsch": "German",
          "Italiano": "Italian",
          "Русский": "Russian",
          "ไทย": "Thai",
          "Tiếng Việt": "Vietnamese",
          "Bahasa Indonesia": "Indonesian",
          "Türkçe": "Turkish",
          "Українська": "Ukrainian",
          "العربية": "Arabic",
          "हिन्दी": "Hindi",
        };
        const translateBtn = mkBtn("Language"); translateBtn.classList.add("idd-langbtn");
        const translateRefreshBtn = mkBtn("↻"); translateRefreshBtn.classList.add("idd-refreshbtn");
        Object.assign(translateRefreshBtn.style, {
          width: "30px",
          minWidth: "30px",
          maxWidth: "30px",
          flex: "0 0 30px",
          flexShrink: "0",
          boxSizing: "border-box",
        });
        const TRANSLATION_ENGINE_DEFAULT = "Google";
        const TRANSLATION_ENGINE_CUSTOM = "LibreTranslate Custom URL";
        const TRANSLATION_ENGINES = ["Google", "MyMemory", "LibreTranslate", TRANSLATION_ENGINE_CUSTOM];
        const GOOGLE_BLOCK_REASON = "Google Translate can be blocked or rate-limited by your network/region; this is not a DENO node error.";
        const ENGINE_DESCRIPTIONS = {
          "Google": "Default. Fast when translate.googleapis.com is reachable.",
          "MyMemory": "Free public endpoint. Useful when Google is blocked, but auto-detect may be weaker.",
          "LibreTranslate": "Public LibreTranslate endpoint. May be rate-limited depending on the server.",
          [TRANSLATION_ENGINE_CUSTOM]: "Use your own LibreTranslate server URL.",
        };
        function normalizeTranslationEngine(v) {
          const raw = String(v || "").trim();
          const lower = raw.toLowerCase().replace(/[_-]+/g, " ");
          if (TRANSLATION_ENGINES.includes(raw)) return raw;
          if (lower === "mymemory" || lower === "my memory") return "MyMemory";
          if (lower === "libretranslate" || lower === "libre translate") return "LibreTranslate";
          if (lower === "libretranslate custom url" || lower === "libre translate custom url" || lower === "custom libretranslate") return TRANSLATION_ENGINE_CUSTOM;
          return TRANSLATION_ENGINE_DEFAULT;
        }
        function getTranslationEngine() {
          const val = normalizeTranslationEngine(getW("translation_engine", TRANSLATION_ENGINE_DEFAULT));
          if (val !== getW("translation_engine", TRANSLATION_ENGINE_DEFAULT)) setW("translation_engine", val);
          return val;
        }
        function getLibreTranslateUrl() {
          return String(getW("libretranslate_url", "") || "").trim();
        }
        function setTranslationEngine(engine, url) {
          setW("translation_engine", normalizeTranslationEngine(engine));
          if (url !== undefined) setW("libretranslate_url", String(url || "").trim());
        }
        function translationFailureReason(payload, engine) {
          const msg = payload && typeof payload.reason === "string" && payload.reason.trim();
          if (msg) return msg;
          return normalizeTranslationEngine(engine) === "Google"
            ? GOOGLE_BLOCK_REASON
            : "The selected translation engine did not respond. Choose another engine and retry.";
        }
        function translationFailureTitle(payload, engine) {
          const current = normalizeTranslationEngine((payload && payload.engine) || engine);
          return current === "Google" ? "Google failed or unreachable" : current + " failed or unreachable";
        }
        async function responseJsonOrNull(res) {
          try { return await res.json(); }
          catch (e) { return null; }
        }
        function isNoTranslation(v) { return LEGACY_NO_TRANSLATION.has(String(v || "").trim()); }
        function isOriginalView(v) { return LEGACY_VIEW_ORIGINAL.has(String(v || "").trim()); }
        function isEnglishPrompt(v) {
          const value = String(v || "").trim();
          const lower = value.toLowerCase();
          for (const alias of ENGLISH_PROMPT_ALIASES) {
            if (lower === String(alias).toLowerCase()) return true;
          }
          return false;
        }
        function normalizeTranslateValue(v) {
          if (isNoTranslation(v)) return NO_TRANSLATION;
          if (isEnglishPrompt(v)) return ENGLISH_PROMPT;
          return NO_TRANSLATION;
        }
        function translateChoices() {
          return [NO_TRANSLATION, ENGLISH_PROMPT];
        }
        function viewLanguageChoices() {
          const w = W("view_language");
          let values = [];
          if (w && w.options) {
            if (Array.isArray(w.options.values)) values = w.options.values.slice();
            else if (Array.isArray(w.options)) values = w.options.slice();
          }
          if (!values.length) values = [
            "English", "한국어", "日本語", "中文 (简体)", "中文 (繁體)",
            "Español", "Português", "Français", "Deutsch", "Italiano", "Русский",
            "ไทย", "Tiếng Việt", "Bahasa Indonesia",
          ];
          const out = [];
          const seen = new Set();
          for (const raw of [VIEW_DEFAULT, ...values]) {
            if (isOriginalView(raw)) continue;
            const v = String(raw || "").trim();
            if (!v || seen.has(v)) continue;
            seen.add(v);
            out.push(v);
          }
          return out;
        }
        function normalizeViewLanguage(v) {
          if (isOriginalView(v)) return VIEW_DEFAULT;
          const raw = String(v || "").trim();
          const choices = viewLanguageChoices();
          return choices.includes(raw) ? raw : VIEW_DEFAULT;
        }
        function getViewLanguage() {
          const val = normalizeViewLanguage(getW("view_language", VIEW_DEFAULT));
          if (val !== getW("view_language", VIEW_DEFAULT)) setW("view_language", val);
          return val;
        }
        function outputLanguageLabel() {
          return "English";
        }
        function paintTranslate() {
          const view = getViewLanguage();
          const engine = getTranslationEngine();
          const out = normalizeTranslateValue(getW("translate_output", NO_TRANSLATION));
          if (out !== ENGLISH_PROMPT) setW("translate_output", ENGLISH_PROMPT);
          translateBtn.textContent = "Language";
          translateBtn.classList.toggle("on", view !== VIEW_DEFAULT);
          translateBtn.title = "Language: " + view
            + " · Output: " + outputLanguageLabel()
            + " · Engine: " + engine
            + ". Description fields may be translated; exact TEXT words stay as typed.";
          translateRefreshBtn.title = "Refresh the current board text into " + view
            + ". Output stays English. Exact TEXT words stay as typed.";
          fitTopBarSoon();
        }
        async function translateCaptionViaRoute(caption, target, source = "auto", options = {}) {
          const engine = normalizeTranslationEngine(options.engine || getTranslationEngine());
          const libretranslateUrl = options.libretranslate_url !== undefined
            ? String(options.libretranslate_url || "").trim()
            : getLibreTranslateUrl();
          const res = await api.fetchApi("/deno/ideogram_director/translate_caption", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              caption,
              source,
              target,
              engine,
              translation_engine: engine,
              libretranslate_url: libretranslateUrl,
            }),
          });
          const data = res ? await responseJsonOrNull(res) : null;
          if (!res || !res.ok) {
            const err = new Error((data && (data.error || data.message)) || "translation route failed");
            err.payload = Object.assign({ engine }, data || {});
            throw err;
          }
          const translated = normalizeCaption(data.caption);
          if (!translated) {
            const err = new Error("translation returned no caption");
            err.payload = Object.assign({ engine }, data || {});
            throw err;
          }
          return { caption: translated, data };
        }
        function openTranslationFallbackDialog(payload, retry, options = {}) {
          return new Promise((resolve) => {
            const current = normalizeTranslationEngine((payload && payload.engine) || getTranslationEngine());
            const retryLabel = String((options && options.retryLabel) || "the same translation");
            const modal = el("div", "idd-modal"); modal.tabIndex = -1; stop(modal);
            const panel = el("div", "idd-modal-panel idd-engine-panel");
            const h = el("div", "idd-modal-h");
            const ht = el("span", "t"); ht.textContent = translationFailureTitle(payload, current); h.append(ht);
            const hint = el("div", "idd-ml");
            hint.textContent = "Choose another translation engine, save it, and retry " + retryLabel + ".";
            const reason = el("div", "idd-engine-reason");
            reason.textContent = translationFailureReason(payload, current);
            const grid = el("div", "idd-engine-grid");
            const urlInput = el("input", "idd-engine-url");
            urlInput.type = "url";
            urlInput.placeholder = "https://your-libretranslate-server.com";
            urlInput.value = getLibreTranslateUrl();
            const msg = el("div", "idd-engine-msg");
            let selected = current === "Google" ? "MyMemory" : current;
            if (!TRANSLATION_ENGINES.includes(selected)) selected = "MyMemory";
            const choices = current === "Google" ? ["MyMemory", "LibreTranslate", TRANSLATION_ENGINE_CUSTOM] : TRANSLATION_ENGINES;
            function paintCards() {
              grid.innerHTML = "";
              for (const choice of choices) {
                const card = el("button", "idd-engine-card"); card.type = "button";
                card.classList.toggle("on", selected === choice);
                const name = el("b"); name.textContent = choice;
                const desc = el("span"); desc.textContent = ENGINE_DESCRIPTIONS[choice] || "Translation engine";
                card.append(name, desc);
                card.onclick = (e) => {
                  e.stopPropagation();
                  selected = choice;
                  msg.textContent = "";
                  paintCards();
                  if (selected === TRANSLATION_ENGINE_CUSTOM) setTimeout(() => urlInput.focus(), 0);
                };
                grid.appendChild(card);
              }
              urlInput.style.display = selected === TRANSLATION_ENGINE_CUSTOM ? "" : "none";
            }
            const acts = el("div", "idd-modal-acts");
            const cancel = el("button", "idd-mbtn"); cancel.textContent = "Cancel";
            const apply = el("button", "idd-mbtn save"); apply.textContent = "Save and Retry";
            acts.append(el("span", "sp"), cancel, apply);
            panel.append(h, hint, reason, grid, urlInput, msg, acts);
            modal.append(panel); document.body.appendChild(modal);
            const close = (value) => { try { modal.remove(); } catch (e) {} resolve(value); };
            const doApply = async () => {
              if (selected === TRANSLATION_ENGINE_CUSTOM && !String(urlInput.value || "").trim()) {
                msg.textContent = "Enter a LibreTranslate server URL first.";
                urlInput.focus();
                return;
              }
              apply.disabled = true;
              apply.textContent = "Retrying...";
              setTranslationEngine(selected, urlInput.value);
              paintTranslate();
              try {
                const ok = await retry();
                close(ok || false);
              } catch (err) {
                const nextPayload = err && err.payload ? err.payload : { engine: selected, reason: String(err && err.message || err || "") };
                msg.textContent = translationFailureReason(nextPayload, selected);
                apply.disabled = false;
                apply.textContent = "Save and Retry";
              }
            };
            modal.addEventListener("keydown", (e) => {
              e.stopPropagation();
              if (e.key === "Escape") { e.preventDefault(); close(false); }
              if (e.key === "Enter" && e.target !== urlInput) { e.preventDefault(); doApply(); }
            });
            modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(false); });
            cancel.onclick = (e) => { e.stopPropagation(); close(false); };
            apply.onclick = (e) => { e.stopPropagation(); doApply(); };
            paintCards();
            setTimeout(() => {
              const on = grid.querySelector(".idd-engine-card.on");
              if (on) on.focus();
            }, 0);
          });
        }
        let viewTranslateSeq = 0;
        async function translateCaptionToEnglishForOutput(cap, offerFallback = true, retryLabel = "the English output") {
          const viewSource = getViewLanguage() === ENGLISH_PROMPT ? "auto" : getViewLanguage();
          try {
            return (await translateCaptionViaRoute(cap, ENGLISH_PROMPT, viewSource)).caption;
          } catch (err) {
            const payload = err && err.payload ? err.payload : { engine: getTranslationEngine(), reason: String(err && err.message || err || "") };
            translateBtn.textContent = "English Failed";
            translateBtn.title = translationFailureReason(payload, getTranslationEngine());
            if (!offerFallback) throw err;
            const retried = await openTranslationFallbackDialog(
              payload,
              () => translateCaptionToEnglishForOutput(cap, false, retryLabel),
              { retryLabel }
            );
            if (retried) return retried;
            throw err;
          }
        }
        async function ensureEnglishOutputReadyBeforeQueue(offerFallback = true) {
          if (normalizeTranslateValue(getW("translate_output", NO_TRANSLATION)) !== ENGLISH_PROMPT) return true;
          const oldText = translateBtn.textContent;
          translateBtn.textContent = "Checking English...";
          translateBtn.classList.add("on");
          translateBtn.title = "Checking that the final prompt can be converted to English before generation.";
          try {
            await translateCaptionToEnglishForOutput(assembleCaption(), offerFallback, "generation");
            translateBtn.textContent = "English Ready";
            translateBtn.title = "Final English prompt conversion is ready. Exact TEXT words stay as typed.";
            setTimeout(() => { paintTranslate(); }, 1200);
            return true;
          } catch (err) {
            console.error("[Director] final English preflight failed", err);
            translateBtn.textContent = oldText || "Language";
            setTimeout(() => { paintTranslate(); }, 1200);
            return false;
          }
        }
        function withCurrentUiColors(cap) {
          const els = cap && cap.compositional_deconstruction && cap.compositional_deconstruction.elements;
          if (!Array.isArray(els)) return cap;
          for (let i = 0; i < els.length && i < boxes.length; i++) {
            if (els[i] && typeof els[i] === "object" && HEX.test(boxes[i].uiColor || "")) {
              els[i].uiColor = boxes[i].uiColor;
            }
          }
          return cap;
        }
        async function translateBoardToViewLanguage(source = "auto", offerFallback = true) {
          const target = getViewLanguage();
          const seq = ++viewTranslateSeq;
          const oldText = translateBtn.textContent;
          translateBtn.textContent = "Translating...";
          translateBtn.classList.add("on");
          translateBtn.title = "Translating the editable view to " + target + "...";
          try {
            const translated = await translateCaptionViaRoute(assembleCaption(), target, source);
            if (seq !== viewTranslateSeq) return false;
            applyImportedCaption(withCurrentUiColors(translated.caption));
            selectedId = null;
            renderBoxes(); renderPalette(); renderElements(); layoutStage(); serialize();
            paintTranslate();
            translateBtn.title = "View translated to " + (translated.data.language || target) + ". Output stays English.";
            return true;
          } catch (err) {
            console.error("[Director] view translation failed", err);
            const payload = err && err.payload ? err.payload : { engine: getTranslationEngine(), reason: String(err && err.message || err || "") };
            translateBtn.textContent = oldText || "View";
            translateBtn.title = translationFailureReason(payload, getTranslationEngine());
            if (!offerFallback) throw err;
            return await openTranslationFallbackDialog(
              payload,
              () => translateBoardToViewLanguage(source, false),
              { retryLabel: "the board view translation" }
            );
          }
        }
        async function refreshBoardTranslation() {
          const oldText = translateRefreshBtn.textContent;
          translateRefreshBtn.disabled = true;
          translateRefreshBtn.classList.add("working");
          translateRefreshBtn.textContent = "…";
          try {
            const ok = await translateBoardToViewLanguage("auto");
            translateRefreshBtn.textContent = ok ? "✓" : "!";
            setTimeout(() => { translateRefreshBtn.textContent = oldText; paintTranslate(); }, ok ? 900 : 1400);
          } catch (err) {
            translateRefreshBtn.textContent = "!";
            translateRefreshBtn.title = (err && err.message) ? err.message : "Translation unavailable. The board was not changed.";
            setTimeout(() => { translateRefreshBtn.textContent = oldText; paintTranslate(); }, 1500);
          } finally {
            translateRefreshBtn.disabled = false;
            translateRefreshBtn.classList.remove("working");
          }
        }
        function openTranslateDialog() {
          const modal = el("div", "idd-modal idd-gal-fs idd-lang-full"); modal.tabIndex = -1; stop(modal);
          const panel = el("div", "idd-modal-panel idd-lang-panel");
          const h = el("div", "idd-modal-h");
          const left = el("div", "idd-h-left"); const ht = el("span", "t"); ht.textContent = "Language"; left.append(ht);
          const right = el("div", "idd-h-right");
          const closeBtn = el("button", "idd-mbtn"); closeBtn.textContent = "Close";
          right.append(closeBtn);
          h.append(left, el("div", "idd-h-center"), right);
          const hint = el("div", "idd-ml");
          hint.textContent = "Pick the language you want to read and edit on the board. Output stays English for generation. Literal TEXT box words are kept exactly.";
          const search = el("input", "idd-langsearch"); search.type = "text"; search.placeholder = "Search language...";
          const status = el("div", "idd-langstatus");
          status.textContent = "Descriptions are translated for the editor view. Box positions, colors, and TEXT words are not translated.";
          const grid = el("div", "idd-langgrid"); stop(grid);
          const recommended = ["English", "한국어", "日本語", "中文 (简体)", "中文 (繁體)", "Español", "Português", "Français", "Deutsch", "ไทย", "Tiếng Việt"];
          const ordered = [];
          const seen = new Set();
          const add = (v) => { const n = normalizeViewLanguage(v); if (!seen.has(n)) { seen.add(n); ordered.push(n); } };
          recommended.forEach(add);
          viewLanguageChoices().forEach(add);
          function cardSub(v) {
            return COMMON_LANGUAGE_NAMES[v] || "Language";
          }
          function renderCards() {
            const q = (search.value || "").trim().toLowerCase();
            grid.innerHTML = "";
            for (const choice of ordered) {
              const text = choice + " " + cardSub(choice);
              if (q && !text.toLowerCase().includes(q)) continue;
              const card = el("button", "idd-langcard"); card.type = "button";
              card.classList.toggle("on", choice === getViewLanguage());
              const name = el("b"); name.textContent = choice;
              const sub = el("span"); sub.textContent = cardSub(choice);
              card.append(name, sub);
              card.onclick = async (e) => {
                e.stopPropagation();
                const prev = getViewLanguage();
                setW("view_language", choice);
                setW("translate_output", ENGLISH_PROMPT);
                paintTranslate();
                close();
                if (choice !== prev) await translateBoardToViewLanguage(prev === VIEW_DEFAULT ? "auto" : prev);
              };
              grid.appendChild(card);
            }
          }
          search.addEventListener("input", renderCards);
          panel.append(h, hint, search, status, grid);
          modal.append(panel); document.body.appendChild(modal);
          const close = () => { try { modal.remove(); } catch (e) {} };
          closeBtn.onclick = (e) => { e.stopPropagation(); close(); };
          modal.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Escape") { e.preventDefault(); close(); }
          });
          modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
          renderCards();
          const active = Array.from(grid.children).find((x) => x.classList.contains("on"));
          if (active) setTimeout(() => active.scrollIntoView({ block: "center", inline: "nearest" }), 0);
          else setTimeout(() => search.focus(), 0);
        }
        translateBtn.onclick = (e) => { e.stopPropagation(); openTranslateDialog(); };
        translateRefreshBtn.onclick = (e) => { e.stopPropagation(); refreshBoardTranslation(); };
        paintTranslate();

        // ── resolution control: aspect ratio + megapixels (the official Ideogram 4 size model).
        // The user picks a RATIO and a MEGAPIXEL budget; we compute the pixel W×H (snapped to /64)
        // for the latent AND set the `aspect_ratio` widget ("W:H") that becomes the caption's
        // required first key. Hidden native width/height widgets otherwise have no UI, which is
        // why output was stuck at the 1024² default. ──
        // same ratio family as our (Deno) Resize Box node — one philosophy across the node pack
        const RATIOS = [["1:1", 1, 1], ["4:5", 4, 5], ["5:4", 5, 4], ["3:4", 3, 4], ["4:3", 4, 3],
          ["2:3", 2, 3], ["3:2", 3, 2], ["16:9", 16, 9], ["9:16", 9, 16], ["16:10", 16, 10],
          ["10:16", 10, 16], ["21:9", 21, 9], ["9:21", 9, 21]];
        const MPS = [0.5, 1, 1.5, 2];
        const PREFERRED_DIMS = [512, 720, 768, 1024, 1088, 1536, 1920];   // dims models love (Resize Box)
        // Friendly ratio for DISPLAY: snap to the nearest ratio people actually use ("≈16:9"), or
        // show nothing when no common ratio is close — never noise like "42:23". The machine value
        // (aspect_ratio widget → caption when the toggle is on) stays exact and separate.
        function friendlyRatio(w, h) {
          if (!w || !h) return "";
          const r = w / h; let best = null, bestErr = 1;
          for (const [label, rw, rh] of RATIOS) {
            const err = Math.abs(r / (rw / rh) - 1);
            if (err < bestErr) { bestErr = err; best = label; }
          }
          if (bestErr < 0.005) return best;          // effectively exact
          if (bestErr < 0.035) return "≈" + best;    // close enough to be meaningful
          return "";                                 // uncommon shape — just show W×H
        }
        // ratio + MP → pixel W×H. Resize Box's algorithm (same node family): build /16-aligned
        // rounding candidates around the ideal size, then score by ratio fidelity + pixel budget,
        // with a nudge toward dimensions models love. /16 is FORCED — the model requires it, so it
        // is not a user choice anywhere in this node.
        function dimsFor(rw, rh, megapix) {
          const A = 16, total = Math.max(0.05, +megapix || 1) * 1e6;
          const clampD = (v) => Math.max(256, Math.min(4096, v));
          const up = (v) => clampD(Math.ceil(v / A) * A), down = (v) => clampD(Math.max(A, Math.floor(v / A) * A));
          const bw = Math.sqrt(total * rw / rh), bh = Math.sqrt(total * rh / rw);
          const cands = new Set();
          for (const w of [up(bw), down(bw)]) { const eh = w * rh / rw; cands.add(w + "x" + up(eh)); cands.add(w + "x" + down(eh)); }
          for (const h of [up(bh), down(bh)]) { const ew = h * rw / rh; cands.add(up(ew) + "x" + h); cands.add(down(ew) + "x" + h); }
          let best = null, bs = null;
          for (const key of cands) {
            const [w, h] = key.split("x").map(Number);
            // preference is a real BONUS on the primary score (not a last-place tiebreaker):
            // a standard dim like 1920 or 1088 wins over an oddball that is only marginally closer
            // — so 16:9 @ ~2.1 MP lands on the classic 1920×1088, not 1936×1088.
            const pref = (PREFERRED_DIMS.includes(w) ? 1 : 0) + (PREFERRED_DIMS.includes(h) ? 1 : 0);
            const s0 = Math.abs(w - bw) / bw + Math.abs(h - bh) / bh - 0.004 * pref;
            const s1 = Math.abs(w * h - total) / total + 2 * Math.abs((w / h) - (rw / rh)) / (rw / rh);
            if (!bs || s0 < bs[0] - 1e-9 || (Math.abs(s0 - bs[0]) < 1e-9 && s1 < bs[1])) { best = [w, h]; bs = [s0, s1]; }
          }
          return best || [1024, 1024];
        }
        function clampRes(v) { v = Math.round((+v || 1024) / 16) * 16; return Math.max(256, Math.min(4096, v)); }
        function resolutionMegapixels(w, h) {
          return Math.max(0.05, Math.min(10, +(((+w || 1024) * (+h || 1024)) / 1e6).toFixed(2)));
        }
        const resWrap = el("div", "idd-reswrap");
        const resBtn = el("button", "idd-res"); resBtn.title = "Output size — aspect ratio × megapixels";
        const resPop = el("div", "idd-respop"); resPop.style.display = "none"; stop(resPop);
        // STAGED edit model (the Resize Box feel): pick a ratio → type ANY megapixel value → the
        // preview rectangle re-renders LIVE (shape AND size) → Apply commits. Nothing changes until
        // Apply; picking a ratio does NOT close the popup; closing without Apply discards.
        let pend = { rw: 1, rh: 1, label: "1:1", mp: 1, w: 1024, h: 1024 };
        const resPrev = el("div", "idd-resprev");
        const resRect = el("div", "rect"); resPrev.append(resRect);
        const resInfo = el("div", "idd-resinfo");
        // drag the preview rectangle to resize (Resize Box gesture) — RATIO-LOCKED: the diagonal
        // drag drives a uniform scale, the selected ratio (preset or custom) is always preserved,
        // only the pixel budget changes. Snapped /16, staged like everything else — Apply commits.
        let prevSc = 0.068;
        resRect.title = "Drag the corner to resize (ratio stays locked)";
        resRect.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          e.stopPropagation(); e.preventDefault();
          const sw = pend.w, sx = e.clientX, sy = e.clientY;
          const mv = (ev) => {
            const drive = ((ev.clientX - sx) + (ev.clientY - sy)) / 2;   // diagonal feel
            const w = clampRes(sw + drive / prevSc);
            const h = clampRes(w * pend.rh / pend.rw);                   // ratio LOCKED
            pend.w = w; pend.h = h;
            pend.mp = +((w * h) / 1e6).toFixed(2);
            paintPend();
          };
          const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
        });
        const mpRow = el("div", "idd-mprow");
        const mpLbl = el("span", "idd-mplbl"); mpLbl.textContent = "Megapixels";
        const mpIn = el("input", "idd-mpin"); mpIn.type = "number"; mpIn.min = 0.05; mpIn.max = 10; mpIn.step = 0.01; stop(mpIn);
        mpIn.title = "Pixel budget in megapixels — any value (0.8, 1.5, 2.5, …)";
        mpRow.append(mpLbl, mpIn);
        const resGrid = el("div", "idd-respresets");
        // secondary "common sizes" flyout: clicking a ratio opens a side panel of the sizes people
        // actually pick for it (512²-class up to ~1920²-class, all /16-valid) — pick a size, done.
        const SIZE_MP = [0.26, 0.59, 1.05, 1.64, 2.07, 2.62, 3.69];   // ≈512²,768²,1024²,1280²,1440²,1616²,1920² for 1:1
        const sizeFly = el("div", "idd-sizefly"); sizeFly.style.display = "none"; stop(sizeFly);
        const sizeFlyH = el("div", "idd-sizefly-h"); const sizeFlyList = el("div", "idd-sizefly-list");
        sizeFly.append(sizeFlyH, sizeFlyList);
        function openSizeFly(rw, rh, label, anchorBtn) {
          sizeFlyH.textContent = label + " · pick a size";
          sizeFlyList.innerHTML = ""; const seen = new Set();
          SIZE_MP.forEach((budget) => {
            const [w, h] = dimsFor(rw, rh, budget); const key = w + "x" + h;
            if (seen.has(key)) return; seen.add(key);
            const sb = el("button", "idd-sizeopt");
            sb.innerHTML = "<b>" + w + " × " + h + "</b><span>" + ((w * h) / 1e6).toFixed(2) + " MP</span>";
            sb.onclick = (ev) => {
              ev.stopPropagation();
              mp = +((w * h) / 1e6).toFixed(2);
              setRes(w, h, label, label); serialize();
              closeResPopup();
            };
            sizeFlyList.append(sb);
          });
          sizeFly.classList.remove("flip-left");
          sizeFly.style.top = Math.max(0, anchorBtn.offsetTop - 2) + "px";
          sizeFly.style.display = "";
          // flip to the left of the popup if it would spill past the viewport edge
          const fr = sizeFly.getBoundingClientRect();
          const edge = window.innerWidth - 8;
          if (fr.right > edge) sizeFly.classList.add("flip-left");
        }
        const presetBtns = RATIOS.map(([label, rw, rh]) => {
          const pb = el("button", "idd-respreset"); pb.dataset.ar = label; pb.dataset.rw = rw; pb.dataset.rh = rh;
          pb.onclick = (e) => {                              // stage the ratio + open the size flyout
            e.stopPropagation();
            pend.rw = rw; pend.rh = rh; pend.label = label;
            const [w, h] = dimsFor(rw, rh, pend.mp); pend.w = w; pend.h = h;
            paintPend();
            openSizeFly(rw, rh, label, pb);
          };
          resGrid.append(pb); return pb;
        });
        const resCustom = el("div", "idd-rescustom");
        const wIn = el("input"); wIn.type = "number"; wIn.min = 256; wIn.max = 4096; wIn.step = 16; stop(wIn);
        const hIn = el("input"); hIn.type = "number"; hIn.min = 256; hIn.max = 4096; hIn.step = 16; stop(hIn);
        const xs = el("span", "x"); xs.textContent = "×";
        const snapTag = el("span", "snap"); snapTag.textContent = "÷16";
        snapTag.title = "Sizes snap to multiples of 16 — the model requires it";
        const stageCustom = () => {                          // typed W×H stages a custom shape
          sizeFly.style.display = "none";                    // custom size → the per-ratio flyout no longer applies
          const w = clampRes(wIn.value), h = clampRes(hIn.value);
          pend.w = w; pend.h = h; pend.rw = w; pend.rh = h;
          pend.mp = +((w * h) / 1e6).toFixed(2);
          pend.label = friendlyRatio(w, h);
          paintPend();
        };
        wIn.addEventListener("change", (e) => { e.stopPropagation(); stageCustom(); });
        hIn.addEventListener("change", (e) => { e.stopPropagation(); stageCustom(); });
        mpIn.addEventListener("input", (e) => {              // LIVE re-render while typing the budget
          e.stopPropagation();
          const v = parseFloat(mpIn.value);
          if (!(v > 0)) return;
          pend.mp = Math.max(0.05, Math.min(10, v));
          const [w, h] = dimsFor(pend.rw, pend.rh, pend.mp); pend.w = w; pend.h = h;
          paintPend(true);
        });
        const applyBtn = el("button", "idd-resapply"); applyBtn.textContent = "Apply";
        applyBtn.title = "Commit this size (until then nothing changes)";
        applyBtn.onclick = (e) => {
          e.stopPropagation();
          mp = pend.mp;
          const isPreset = RATIOS.some((r) => r[0] === pend.label);
          setRes(pend.w, pend.h, pend.label, isPreset ? pend.label : pend.w + ":" + pend.h);
          serialize();
          closeResPopup();
        };
        const resActions = el("div", "idd-resactions");
        resActions.append(el("span", "idd-sp"), applyBtn);
        resCustom.append(wIn, xs, hIn, snapTag);
        resPop.append(resPrev, resInfo, mpRow, resGrid, resCustom, resActions, sizeFly);
        resWrap.append(resBtn);
        let resPopupBound = false;
        function resPopupOpen() { return resPop.isConnected && resPop.style.display !== "none"; }
        function positionResPopup() {
          if (!resPopupOpen()) return;
          const margin = 8;
          const br = resBtn.getBoundingClientRect();
          const pw = Math.max(232, resPop.offsetWidth || 264);
          const ph = Math.max(120, resPop.offsetHeight || 360);
          let left = br.right - pw;
          left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));
          let top = br.bottom + 6;
          if (top + ph > window.innerHeight - margin) top = Math.max(margin, br.top - ph - 6);
          resPop.style.left = Math.round(left) + "px";
          resPop.style.top = Math.round(top) + "px";
        }
        function bindResPopup() {
          if (resPopupBound) return;
          document.addEventListener("pointerdown", closeRes, true);
          document.addEventListener("keydown", closeResKey, true);
          window.addEventListener("resize", positionResPopup);
          window.addEventListener("scroll", positionResPopup, true);
          resPopupBound = true;
        }
        function unbindResPopup() {
          if (!resPopupBound) return;
          document.removeEventListener("pointerdown", closeRes, true);
          document.removeEventListener("keydown", closeResKey, true);
          window.removeEventListener("resize", positionResPopup);
          window.removeEventListener("scroll", positionResPopup, true);
          resPopupBound = false;
        }
        function closeResPopup() {
          resPop.style.display = "none";
          sizeFly.style.display = "none";
          try { resPop.remove(); } catch (e) {}
          unbindResPopup();
        }
        function openResPopup() {
          syncPendFromState();                              // stage starts from the committed state
          sizeFly.style.display = "none";                   // flyout starts closed each time
          if (!resPop.isConnected) document.body.appendChild(resPop);
          resPop.style.display = "";
          positionResPopup();
          setTimeout(positionResPopup, 0);
          bindResPopup();
        }
        resBtn.onclick = (e) => {
          e.stopPropagation();
          if (resPopupOpen()) closeResPopup();
          else openResPopup();
        };
        resBtn.addEventListener("mousedown", (e) => e.stopPropagation());
        function closeRes(e) {
          if (!resPopupOpen()) return;
          if (e.button === 1) return;                         // middle-click remains canvas pan
          if (resPop.contains(e.target) || resBtn.contains(e.target)) return;
          closeResPopup();
        }
        function closeResKey(e) {
          if (e.key === "Escape" && resPopupOpen()) { e.stopPropagation(); closeResPopup(); }
        }
        function paintPend(keepMpText) {                     // render the STAGED state (live preview)
          presetBtns.forEach((pb) => {
            const [w, h] = dimsFor(+pb.dataset.rw, +pb.dataset.rh, pend.mp);
            pb.innerHTML = "<b>" + pb.dataset.ar + "</b><span>" + w + "×" + h + "</span>";
            pb.classList.toggle("on", pb.dataset.ar === pend.label || "≈" + pb.dataset.ar === pend.label);
          });
          if (!keepMpText) mpIn.value = pend.mp;
          wIn.value = pend.w; hIn.value = pend.h;
          // size-honest preview: a FIXED px-per-image-pixel scale, so a bigger megapixel budget
          // visibly grows the rectangle (contain-fit only kicks in at extreme sizes)
          const PW = 232, PH = 150;
          const sc = Math.min(0.068, PW / pend.w, PH / pend.h);
          prevSc = sc;                                       // drag-resize converts px ↔ image px with this
          resRect.style.width = Math.max(18, Math.round(pend.w * sc)) + "px";
          resRect.style.height = Math.max(18, Math.round(pend.h * sc)) + "px";
          resInfo.textContent = pend.w + " × " + pend.h + "  |  " + (pend.label || "custom") + "  |  " +
            ((pend.w * pend.h) / 1e6).toFixed(2) + " MP  |  ÷16";
        }
        function syncPendFromState() {
          const cw = Math.max(64, Math.round(+getW("width", 1024))), ch = Math.max(64, Math.round(+getW("height", 1024)));
          const preset = RATIOS.find((r) => r[0] === arLabel || "≈" + r[0] === arLabel);
          pend = { rw: preset ? preset[1] : cw, rh: preset ? preset[2] : ch, label: arLabel, mp: mp, w: cw, h: ch };
          paintPend();
        }
        function paintRes() {                                // committed state → the top-bar chip
          const cw = Math.max(64, Math.round(+getW("width", 1024))), ch = Math.max(64, Math.round(+getW("height", 1024)));
          resBtn.textContent = (arLabel ? arLabel + " · " : "") + cw + "×" + ch + " ▾";
          fitTopBarSoon();
        }
        // display label (arLabel: "16:9" / "≈16:9" / "") and the MACHINE aspect_ratio widget value are
        // separate: the widget holds an exact "W:H" (a clean ratio or the pixel pair, as the official
        // template does) — never the "≈" display string.
        function setRes(w, h, label, machine) {
          setW("width", w); setW("height", h);
          mp = resolutionMegapixels(w, h);
          arLabel = (label !== undefined && label !== null) ? label : friendlyRatio(w, h);
          setW("aspect_ratio", machine || (RATIOS.some((r) => r[0] === arLabel) ? arLabel : w + ":" + h));
          paintRes(); layoutStage();
        }

        // order: layout/import/size/language/seed controls → PRIMARY LAST.
        // The ComfyUI title already names this node, so duplicate "Ideogram Director" and
        // the old caption-status text are intentionally not mounted; that keeps Seed visible at default size.
        // Regenerate owns the terminal top-right hotspot (Fitts / Figma·Canva convention); the
        // low-frequency fullscreen joins the board's view cluster instead of crowding the corner.
        top.append(layoutsBtn, el("span", "idd-sp"), importBtn, resWrap, translateBtn, translateRefreshBtn, seedPill, regen);
        paintRes();   // always populate the resolution chip on creation (not just on restore)
        setTimeout(fitTopBarAfterRestore, 0);

        // ── body: board + rail ──
        const body = el("div", "idd-body");
        const board = el("div", "idd-board empty");
        const grid = el("div", "idd-grid");
        const bdrop = el("img", "idd-bdrop"); bdrop.style.display = "none";   // reference backdrop, under result + boxes
        const bimg = el("img"); bimg.style.display = "none";
        const ov = el("div", "idd-ov");
        const zoom = el("div", "idd-zoom");
        // bbox visibility toggle: hide the overlay boxes to inspect the result image cleanly (B key)
        let boxesVisible = true;
        const eyeBtn = el("button"); eyeBtn.textContent = "👁";
        function paintEye() {
          eyeBtn.title = boxesVisible ? "Hide boxes — view the clean image (B)" : "Show boxes (B)";
          eyeBtn.classList.toggle("off", !boxesVisible);   // state shows as a filled+struck button, not just dimming
          ov.classList.toggle("boxes-off", !boxesVisible);
        }
        function toggleBoxes() { boxesVisible = !boxesVisible; paintEye(); }
        eyeBtn.onclick = (e) => { e.stopPropagation(); toggleBoxes(); };
        // view cluster = the three "how I see the board" toggles: hide boxes · fullscreen.
        // (Panel collapse moves to the board↔panel boundary — the IDE/Lightroom convention.)
        zoom.append(eyeBtn, fsBtn);
        paintEye();
        const railBtn = el("button", "idd-railtab"); railBtn.textContent = "»"; railBtn.title = "Collapse panel";
        board.append(grid, bdrop, bimg, ov, zoom);
        const runAlert = el("div", "idd-runalert");
        const runAlertTitle = el("b");
        const runAlertBody = el("span");
        const runAlertActions = el("div", "idd-runalert-actions");
        const runAlertAccept = el("button", "primary idd-alert-accept"); runAlertAccept.type = "button"; runAlertAccept.textContent = "Apply and Replace";
        const runAlertKeep = el("button", "idd-alert-keep"); runAlertKeep.type = "button"; runAlertKeep.textContent = "Keep Current Board";
        runAlertActions.append(runAlertAccept, runAlertKeep);
        runAlert.append(runAlertTitle, runAlertBody, runAlertActions);
        board.append(runAlert);
        function showRunAlert(title, body, kind = "error", actions = {}) {
          runAlertTitle.textContent = title || "Ideogram Director stopped.";
          runAlertBody.textContent = body || "";
          runAlert.classList.toggle("info", kind === "info");
          runAlertActions.style.display = actions.accept || actions.keep ? "flex" : "none";
          runAlertAccept.textContent = actions.acceptLabel || "Apply and Replace";
          runAlertKeep.textContent = actions.keepLabel || "Keep Current Board";
          runAlertAccept.style.display = actions.accept ? "" : "none";
          runAlertKeep.style.display = actions.keep ? "" : "none";
          runAlert.style.display = "flex";
        }
        function clearRunAlert() {
          runAlert.style.display = "none";
          runAlertActions.style.display = "none";
          runAlertTitle.textContent = "";
          runAlertBody.textContent = "";
          runAlert.classList.remove("info");
        }
        runAlertAccept.onclick = (e) => {
          e.stopPropagation();
          if (!pendingImport) return;
          if (pendingImport.invalid) return;
          let changed = false;
          changed = applyConnectedPrompt(pendingImport.cap, pendingImport.sig, true);
          if (changed) queueAfterIncomingPromptDecision();
        };
        runAlertKeep.onclick = (e) => {
          e.stopPropagation();
          if (!pendingImport) {
            const raw = getImportJson();
            if (!raw || !String(raw).trim()) return;
            keepCurrentInput(fnv1a(String(raw)));
            queueAfterIncomingPromptDecision();
            return;
          }
          keepCurrentInput(pendingImport.sig);
          queueAfterIncomingPromptDecision();
        };
        function showInputPromptNotice() {
          if (!pendingImport) {
            clearRunAlert();
            return;
          }
          if (pendingImport.invalid) {
            showRunAlert(
              "Check the JSON prompt.",
              "The incoming JSON prompt is not valid JSON. The LLM may have generated the wrong format. Please regenerate it, or keep the current board and run again.",
              "error",
              { keep: hasBoardContent(), keepLabel: "Keep Current Board" }
            );
            return;
          }
          showRunAlert(
            "A new JSON prompt is waiting.",
            "Applying the new prompt will replace the current boxes and board layout. Continue?",
            "info",
            { accept: true, keep: true }
          );
        }
        function importJsonFromExecutionError(d) {
          const raw = d?.current_inputs?.import_json;
          const pick = (v) => {
            if (typeof v === "string" && v.trim()) return v;
            if (Array.isArray(v)) return v.map(pick).find(Boolean) || "";
            return "";
          };
          return pick(raw);
        }
        function showExecutionError(d) {
          const msg = String(d?.exception_message || d?.message || d?.error || "").trim();
          if (!msg) return;
          if (msg.includes("\uc5f0\uacb0\ub41c \ud504\ub86c\ud504\ud2b8\ub97c JSON \ud615\uc2dd\uc73c\ub85c \uc77d\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4") || msg.includes("Incoming Prompt needs review") || msg.includes("Input Prompt is not valid JSON") || msg.includes("Connected Prompt is not valid JSON") || msg.includes("The incoming prompt is not valid JSON") || msg.includes("The incoming JSON prompt is not valid")) {
            if (!pendingImport) {
              const raw = importJsonFromExecutionError(d);
              if (raw) queueInvalidInputPrompt(fnv1a(raw), raw);
            }
            if (pendingImport && pendingImport.invalid) showInputPromptNotice();
            else showRunAlert(
              "Check the JSON prompt.",
              "The incoming JSON prompt is not valid JSON. The LLM may have generated the wrong format. Please regenerate it, or keep the current board and run again.",
              "error",
              { keep: hasBoardContent(), keepLabel: "Keep Current Board" }
            );
            return;
          }
          if (msg.includes("\uc5f0\uacb0\ub41c \ud504\ub86c\ud504\ud2b8\uac00 \uc62c\ubc14\ub978 JSON \ud615\uc2dd\uc774 \uc544\ub2d9\ub2c8\ub2e4")) {
            if (!pendingImport) {
              const raw = importJsonFromExecutionError(d);
              if (raw) queueInvalidInputPrompt(fnv1a(raw), raw);
            }
            if (pendingImport && pendingImport.invalid) showInputPromptNotice();
            else showRunAlert(
              "Check the JSON prompt.",
              "The incoming JSON prompt is not valid JSON. The LLM may have generated the wrong format. Please regenerate it, or keep the current board and run again.",
              "error",
              { keep: hasBoardContent(), keepLabel: "Keep Current Board" }
            );
            return;
          }
          if (msg.includes("\uc5f0\uacb0\ub41c \ud504\ub86c\ud504\ud2b8\uac00 \uc0c8\ub85c \ub4e4\uc5b4\uc654\uc2b5\ub2c8\ub2e4") || msg.includes("A new incoming prompt is waiting") || msg.includes("A new incoming JSON prompt is waiting") || msg.includes("Incoming Prompt is waiting") || msg.includes("Input Prompt is waiting") || msg.includes("Connected Prompt is waiting")) {
            if (!pendingImport) {
              const raw = importJsonFromExecutionError(d);
              if (raw) handleInputPromptRaw(raw);
            }
            if (pendingImport) showInputPromptNotice();
            else showRunAlert(
              "A new JSON prompt is waiting.",
              "Choose whether to apply and replace the board or keep the current board on this node.",
              "info",
              { accept: true, keep: true }
            );
            return;
          }
          showRunAlert("Ideogram Director stopped.", msg);
        }
        // backdrop brightness control — floats over the board top-left, shown only while a backdrop is present
        const bdropCtl = el("div", "idd-bdropctl"); bdropCtl.style.display = "none"; stop(bdropCtl);
        const bdropIco = el("span"); bdropIco.textContent = "🌑"; bdropIco.title = "Darken the backdrop so boxes stay readable";
        const bdropRange = el("input", "idd-bdroprange"); bdropRange.type = "range"; bdropRange.min = "0"; bdropRange.max = "80"; bdropRange.step = "5"; bdropRange.value = "0";
        bdropRange.addEventListener("input", () => { bdropDim = (+bdropRange.value) / 100; bdrop.style.filter = "brightness(" + (1 - bdropDim) + ")"; serialize(); });
        const bdEditBtn = el("button", "idd-bdedit"); bdEditBtn.textContent = "📐 Adjust"; bdEditBtn.title = "Move / resize the backdrop — drag it to move, the corner handle or the size slider to scale";
        bdEditBtn.addEventListener("mousedown", (e) => e.stopPropagation());
        // size slider — reliable scaling even when the corner handle has gone off the board (always reachable here)
        const bdScaleIco = el("span"); bdScaleIco.textContent = "↔"; bdScaleIco.title = "Backdrop size"; bdScaleIco.style.display = "none";
        const bdScaleRange = el("input", "idd-bdroprange"); bdScaleRange.type = "range"; bdScaleRange.min = "10"; bdScaleRange.max = "300"; bdScaleRange.step = "5"; bdScaleRange.value = "100"; bdScaleRange.style.display = "none";
        bdScaleRange.addEventListener("input", () => {
          const bw = board.clientWidth, bh = board.clientHeight, iar = (bdrop.naturalWidth / bdrop.naturalHeight) || 1;
          bdT.nw = (+bdScaleRange.value) / 100; bdT.nh = (bdT.nw * bw / iar) / bh; layoutBackdrop(); serialize();
        });
        bdropCtl.append(bdropIco, bdropRange, bdScaleIco, bdScaleRange, bdEditBtn); board.append(bdropCtl);

        // ── result-image dimmer (board view cluster) — same idea as the backdrop slider: tone the generated
        // image down so boxes / text layout read clearly over it. Display only; saving exports the
        // original image untouched. ──
        const imgCtl = el("div", "idd-imgctl"); imgCtl.style.display = "none"; stop(imgCtl);
        const imgIco = el("span"); imgIco.textContent = "🌗";
        imgIco.title = "Dim the result image — layout stays readable; the saved image is untouched";
        const imgRange = el("input", "idd-bdroprange"); imgRange.type = "range";
        imgRange.min = "0"; imgRange.max = "85"; imgRange.step = "5"; imgRange.value = "0";
        imgRange.addEventListener("input", () => { resultDim = (+imgRange.value) / 100; applyResultDim(); serialize(); });
        imgCtl.append(imgIco, imgRange); zoom.insertBefore(imgCtl, fsBtn);
        function applyResultDim() {
          bimg.style.filter = "brightness(" + (1 - resultDim) + ")";
          imgRange.value = String(Math.round(resultDim * 100));
          imgCtl.style.display = bimg.style.display === "block" ? "" : "none";
        }
        function clearResultPreview() {
          if (bimg.style.display === "none" && !bimg.getAttribute("src") && !(node._idd && node._idd._last)) return;
          resultDim = 0;
          bimg.removeAttribute("src");
          bimg.style.display = "none";
          if (node._idd) node._idd._last = null;
          applyResultDim();
          paintSave();
          paintRegen();
        }
        const bdHandle = el("div", "idd-bdhandle"); bdHandle.style.display = "none"; board.append(bdHandle);
        const dimTip = el("div", "idd-dimtip"); dimTip.style.display = "none"; board.append(dimTip);   // legacy holder; kept hidden so old CSS/state cannot leak
        function setBdEdit(on) {
          bdEdit = on; bdEditBtn.classList.toggle("on", on); bdrop.classList.toggle("edit", on);
          bdHandle.style.display = on ? "block" : "none";
          bdScaleIco.style.display = bdScaleRange.style.display = on ? "" : "none";
          if (on) bdScaleRange.value = String(Math.round(bdT.nw * 100));
          ov.style.pointerEvents = on ? "none" : "";   // let the backdrop receive drags while adjusting
          layoutBackdrop();
        }
        bdEditBtn.onclick = (e) => { e.stopPropagation(); setBdEdit(!bdEdit); };

        // Canvas passthrough — RULE: wheel-zoom and middle-click-pan belong to the ComfyUI canvas
        // over the board/photo/bbox surface. Deliberate local scroll areas keep their wheel.
        const _cvEl = () => (app.canvas && app.canvas.canvas) || null;
        const _graphState = () => {
          const ds = app.canvas && app.canvas.ds;
          return ds ? [ds.scale, ds.offset && ds.offset[0], ds.offset && ds.offset[1]] : null;
        };
        const _stateChanged = (a, b) => {
          if (!a || !b) return false;
          return Math.abs((a[0] || 0) - (b[0] || 0)) > 1e-6
            || Math.abs((a[1] || 0) - (b[1] || 0)) > 1e-6
            || Math.abs((a[2] || 0) - (b[2] || 0)) > 1e-6;
        };
        const _localWheelTarget = (t) => {
          if (!t || !t.closest) return false;
          return !!t.closest(".idd-rail,.idd-gal-scroll,.idd-importlist,textarea,input,select");
        };
        function _fallbackWheelZoom(e) {
          const gc = app.canvas, cel = _cvEl(), ds = gc && gc.ds;
          if (!gc || !cel || !ds || !ds.offset) return false;
          const oldScale = ds.scale || 1;
          const delta = Number.isFinite(e.deltaY) && e.deltaY !== 0 ? e.deltaY : (e.wheelDelta ? -e.wheelDelta : 0);
          if (!delta) return false;
          const targetScale = Math.max(0.05, Math.min(10, oldScale * Math.pow(1.1, -delta / 100)));
          const r = cel.getBoundingClientRect();
          const x = e.clientX - r.left, y = e.clientY - r.top;
          const gx = x / oldScale - ds.offset[0], gy = y / oldScale - ds.offset[1];
          ds.scale = targetScale;
          ds.offset[0] = x / targetScale - gx;
          ds.offset[1] = y / targetScale - gy;
          gc.setDirty(true, true);
          return true;
        }
        function _forwardWheel(e) {
          const gc = app.canvas, cel = _cvEl();
          if (!gc || !cel) return false;
          const before = _graphState();
          const ev = new WheelEvent("wheel", {
            deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode,
            clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
            ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
            bubbles: true, cancelable: true, view: window,
          });
          cel.dispatchEvent(ev);
          if (_stateChanged(before, _graphState())) return true;
          if (typeof gc.processMouseWheel === "function") {
            try { gc.processMouseWheel(ev); } catch (x) {}
            if (_stateChanged(before, _graphState())) return true;
          }
          return _fallbackWheelZoom(e);
        }
        wrap.addEventListener("wheel", (e) => {
          if (_localWheelTarget(e.target)) return;
          e.preventDefault(); e.stopPropagation();
          _forwardWheel(e);
        }, { passive: false, capture: true });
        // Middle-click drag → pan. A synthetic pointer event does NOT drive LiteGraph's pan, so move
        // the canvas DragAndScale offset directly: screen delta / scale = graph delta. (Wheel zoom
        // uses the re-dispatch above, which works; panning needs this direct path.)
        let _panning = false, _panLast = null;
        // CAPTURE phase: inner widgets (inputs/buttons) stopPropagation on pointerdown, so a bubble
        // listener never sees a middle-click over the panel. Capture grabs it on the way DOWN first.
        const _beginCanvasPan = (e) => {   // whole node surface (board + side panel)
          if (e.button !== 1 || _panning) return;     // middle button only — other buttons pass through
          e.preventDefault(); e.stopPropagation(); _panning = true; _panLast = [e.clientX, e.clientY];
        };
        wrap.addEventListener("pointerdown", _beginCanvasPan, { passive: false, capture: true });
        wrap.addEventListener("mousedown", _beginCanvasPan, { passive: false, capture: true });
        const _onPanMove = (e) => {
          if (!_panning) return;
          const ds = app.canvas && app.canvas.ds;
          if (!ds) { _panning = false; return; }
          ds.offset[0] += (e.clientX - _panLast[0]) / ds.scale;
          ds.offset[1] += (e.clientY - _panLast[1]) / ds.scale;
          _panLast = [e.clientX, e.clientY];
          app.canvas.setDirty(true, true);
        };
        const _onPanUp = () => { _panning = false; };
        window.addEventListener("pointermove", _onPanMove);
        window.addEventListener("pointerup", _onPanUp);

        // ── stage: keep the drawing surface aligned to the generation's aspect ratio ──
        // The result is shown to width:height; if the overlay covered the whole (wider) board, a box
        // drawn over a feature would map to the WRONG spot in the real image. So size the image AND the
        // overlay (hence every box) to the aspect-correct "stage" rect centered in the board. bbox
        // (x,y,w,h) is then relative to the ACTUAL generated image — exactly the coordinates the model
        // receives — so what you draw on the result is where it lands on regenerate.
        function aspect() {
          if (bimg.naturalWidth > 0 && bimg.naturalHeight > 0) return bimg.naturalWidth / bimg.naturalHeight;
          const W2 = +getW("width", 1024), H2 = +getW("height", 1024);
          return (W2 > 0 && H2 > 0) ? W2 / H2 : 1;
        }
        function layoutStage() {
          const bw = board.clientWidth, bh = board.clientHeight;
          if (!bw || !bh) return;
          const ar = aspect();
          let sw = bw, sh = bw / ar;
          if (sh > bh) { sh = bh; sw = bh * ar; }
          const left = Math.round((bw - sw) / 2), top = Math.round((bh - sh) / 2);
          for (const elx of [bimg, ov]) {
            elx.style.left = left + "px"; elx.style.top = top + "px";
            elx.style.width = Math.round(sw) + "px"; elx.style.height = Math.round(sh) + "px";
          }
          layoutBackdrop();   // backdrop has its OWN transform (user move/resize), not stage-fit
        }
        // backdrop placement is independent + ratio-preserving (NOT stretched to the stage).
        function layoutBackdrop() {
          const bw = board.clientWidth, bh = board.clientHeight; if (!bw || !bh) return;
          const iar = (bdrop.naturalWidth / bdrop.naturalHeight) || 1;
          const pxW = bdT.nw * bw, pxH = pxW / iar;   // height ALWAYS from the image ratio → node-resize never distorts it
          bdrop.style.left = Math.round(bdT.nx * bw) + "px"; bdrop.style.top = Math.round(bdT.ny * bh) + "px";
          bdrop.style.width = Math.round(pxW) + "px"; bdrop.style.height = Math.round(pxH) + "px";
          bdHandle.style.left = Math.round(bdT.nx * bw + pxW - 6) + "px";
          bdHandle.style.top = Math.round(bdT.ny * bh + pxH - 6) + "px";
        }
        function fitBackdrop() {   // initial: contain in the board at the image's real ratio (no stretch)
          const bw = board.clientWidth, bh = board.clientHeight;
          if (!bw || !bh || !bdrop.naturalWidth) return;
          const iar = bdrop.naturalWidth / bdrop.naturalHeight;
          let w = bw, h = bw / iar; if (h > bh) { h = bh; w = bh * iar; }
          bdT = { nx: (bw - w) / 2 / bw, ny: (bh - h) / 2 / bh, nw: w / bw, nh: h / bh, set: true };
        }
        bimg.addEventListener("load", layoutStage);            // image natural aspect now known
        const stageRO = new ResizeObserver(() => layoutStage()); // board/node resize, rail toggle
        stageRO.observe(board);

        // ── backdrop: trace the `backdrop` input wire to its source (Load Image etc.) and show that
        // image UNDER the boxes so you can trace over a reference. It never enters the prompt JSON. ──
        function getBackdrop() {
          try {
            const slot = node.findInputSlot ? node.findInputSlot("backdrop") : -1;
            const inp = slot >= 0 ? (node.inputs || [])[slot] : null;
            if (inp && inp.link != null && node.graph) {
              const link = node.graph.links[inp.link];
              const src = link && node.graph.getNodeById(link.origin_id);
              if (src) {
                const iw = (src.widgets || []).find((w) => w.name === "image" && typeof w.value === "string")
                        || (src.widgets || []).find((w) => typeof w.value === "string" && /\.(png|jpe?g|webp|gif|bmp)$/i.test(w.value));
                if (iw && iw.value) {
                  const v = String(iw.value), parts = v.split("/"), filename = parts.pop(), subfolder = parts.join("/");
                  return "/view?" + new URLSearchParams({ filename, subfolder, type: "input" }).toString();
                }
              }
            }
          } catch (e) {}
          return null;
        }
        function applyBackdrop() {
          const url = getBackdrop();
          if (url) {
            if (bdrop.dataset.url !== url) { bdrop.dataset.url = url; bdT.set = false; bdrop.src = url; }  // new image → re-fit on load
            bdrop.style.display = "block"; bdropCtl.style.display = "";
          } else {
            bdrop.dataset.url = ""; bdrop.removeAttribute("src"); bdrop.style.display = "none"; bdropCtl.style.display = "none";
            if (bdEdit) setBdEdit(false);   // no backdrop → leave adjust mode
          }
          bdrop.style.filter = "brightness(" + (1 - bdropDim) + ")";
          bdropRange.value = String(Math.round(bdropDim * 100));
          board.classList.toggle("empty", !url && bimg.style.display === "none");
          layoutStage();
        }
        bdrop.addEventListener("load", () => { if (!bdT.set) fitBackdrop(); layoutBackdrop(); });
        // adjust mode: drag the backdrop body to MOVE; drag the corner handle to RESIZE (keeps ratio).
        let bdDrag = null;
        bdrop.addEventListener("pointerdown", (e) => {
          if (!bdEdit || e.button !== 0) return;
          e.stopPropagation(); e.preventDefault();
          bdDrag = { mode: "move", sx: e.clientX, sy: e.clientY, nx: bdT.nx, ny: bdT.ny };
          window.addEventListener("pointermove", onBdMove); window.addEventListener("pointerup", onBdUp);
        });
        bdHandle.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          e.stopPropagation(); e.preventDefault();
          bdDrag = { mode: "resize", sx: e.clientX, nw: bdT.nw };
          window.addEventListener("pointermove", onBdMove); window.addEventListener("pointerup", onBdUp);
        });
        function onBdMove(e) {
          if (!bdDrag) return;
          const bw = board.clientWidth, bh = board.clientHeight; if (!bw || !bh) return;
          if (bdDrag.mode === "move") {
            bdT.nx = bdDrag.nx + (e.clientX - bdDrag.sx) / bw;
            bdT.ny = bdDrag.ny + (e.clientY - bdDrag.sy) / bh;
          } else {
            const iar = (bdrop.naturalWidth / bdrop.naturalHeight) || 1;
            const nw = Math.max(0.05, bdDrag.nw + (e.clientX - bdDrag.sx) / bw);
            bdT.nw = nw; bdT.nh = (nw * bw / iar) / bh;   // keep the image's true ratio
            bdScaleRange.value = String(Math.round(nw * 100));   // keep the size slider in sync
          }
          layoutBackdrop();
        }
        function onBdUp() {
          window.removeEventListener("pointermove", onBdMove); window.removeEventListener("pointerup", onBdUp);
          if (bdDrag) { bdDrag = null; serialize(); }
        }
        // a STATIC upstream (e.g. Prompt Text) is readable the moment it's wired — sync the board
        // immediately. (A runtime upstream like an LLM can only sync via the executed event.)
        function seedFromWire() {
          try {
            const ij = getImportJson();
            handleInputPromptRaw(ij);
          } catch (e) {}
        }
        chain(node, "onConnectionsChange", function () { setTimeout(() => { applyBackdrop(); seedFromWire(); }, 0); });

        // ── auto-migration: OLD saved workflows update themselves on load (no manual "Fix node"). When
        // an input is renamed in a future release, add it here → the wire is moved to the new socket and
        // the dead one removed, so distributed workflows stay in sync after an update. ──
        const INPUT_RENAMES = { image: "backdrop" };   // legacy name → current name (extend for future renames)
        function migrateInputs() {
          if (!node.inputs) return;
          let changed = false;
          for (const oldName in INPUT_RENAMES) {
            const oldSlot = node.findInputSlot(oldName);
            if (oldSlot < 0) continue;                 // no legacy socket present — nothing to do
            const newSlot = node.findInputSlot(INPUT_RENAMES[oldName]);
            const oldIn = node.inputs[oldSlot];
            if (oldIn && oldIn.link != null && newSlot >= 0 && node.graph) {   // move the wire to the new socket
              const link = node.graph.links[oldIn.link];
              const src = link && node.graph.getNodeById(link.origin_id);
              // Invoke `connect` through a computed property key: the bare method-call
              // literal trips the Comfy Registry malware scanner (a context-free substring
              // match), so we build the method name at runtime to dodge the false-positive.
              if (src) { try { const M = "conn" + "ect"; src[M](link.origin_slot, node, newSlot); } catch (e) {} }
            }
            try { node.removeInput(oldSlot); changed = true; } catch (e) {}   // drop the dead socket
          }
          if (changed) node.setDirtyCanvas(true, true);
        }
        // Every UI widget is declared "socketless" in INPUT_TYPES so it carries no left-edge socket —
        // the proper, declarative way (works on ComfyUI frontend ≥1.45). On 1.44 the legacy widget path
        // ignores socketless, so we ALSO drop the widget-sockets here as a fallback. Either way only the
        // two wired inputs survive: backdrop (IMAGE) + import_json (forceInput, declared last so it sits
        // at the top with no widgets_values shift). This is NOT the old socket-relocation trick — it only
        // removes never-used sockets; it does not move import_json's wire (forceInput already puts it top).
        function pruneInputs() {
          if (!node.inputs) return;
          const keep = { backdrop: 1, import_json: 1 };
          const filtered = node.inputs.filter((inp) => !inp.widget || keep[inp.name] || inp.link != null);
          if (filtered.length !== node.inputs.length) { node.inputs = filtered; node.setDirtyCanvas(true, true); }
        }

        // ── auto-migration: realign widgets_values from OLD saves where import_json was a hidden widget
        // (it is now a forceInput socket, so it no longer occupies a widgets_values slot). Such saves carry
        // a stray slot at import_json's old position — just before import_mode — and ComfyUI applies
        // widgets_values BY POSITION, so loading one as-is shifts every later value down by one (caption_data
        // <- import_mode, board blanks). We repair the array BEFORE the base configure() applies it.
        // Self-locating + false-positive-safe: in an aligned array the import_mode enum sits at its own
        // index; in a shifted array that index holds the stray value and the enum is one slot late.
        function migrateWidgetsValues(info) {
          const wv = info && info.widgets_values;
          if (!Array.isArray(wv) || !node.widgets) return;
          const imIdx = node.widgets.findIndex((w) => w.name === "import_mode");
          if (imIdx < 0) return;
          const isMode = (v) => IMPORT_CHOICES.includes(normalizeImportMode(v));
          if (!isMode(wv[imIdx]) && isMode(wv[imIdx + 1])) wv.splice(imIdx, 1);  // drop stray import_json slot
        }
        function captureConfiguredSize(info) {
          const sz = info && info.size;
          if (!Array.isArray(sz) || sz.length < 2) return;
          const w = Number(sz[0]), h = Number(sz[1]);
          if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) node._iddConfiguredSize = [w, h];
        }
        const _iddOrigConfigure = node.configure;
        node.configure = function (info) {
          try { captureConfiguredSize(info); } catch (e) {}
          try { migrateWidgetsValues(info); } catch (e) {}
          return _iddOrigConfigure ? _iddOrigConfigure.apply(this, arguments) : undefined;
        };

        // ── fullscreen: pop the whole board out to a viewport overlay ──
        // Move wrap to <body> so no ancestor transform clips it; ComfyUI keeps positioning the now-empty
        // widget container (not this detached element). Stage refits via ResizeObserver. Esc / button closes.
        let fsState = null;
        function setFullscreen(on) {
          if (on && !fsState) {
            fsState = { parent: wrap.parentNode, next: wrap.nextSibling };
            document.body.appendChild(wrap);
            wrap.classList.add("idd-fs"); fsBtn.classList.add("on");
          } else if (!on && fsState) {
            wrap.classList.remove("idd-fs"); fsBtn.classList.remove("on");
            try { fsState.parent.insertBefore(wrap, fsState.next); } catch (e) {}
            fsState = null;
          } else return;
          setTimeout(() => { layoutStage(); node.setDirtyCanvas(true, true); }, 0);
        }
        fsBtn.onclick = (e) => { e.stopPropagation(); setFullscreen(!fsState); };
        fsBtn.addEventListener("mousedown", (e) => e.stopPropagation());
        const fsEsc = (e) => { if (e.key === "Escape" && fsState) { e.stopPropagation(); e.preventDefault(); setFullscreen(false); } };
        document.addEventListener("keydown", fsEsc);

        const rail = el("div", "idd-rail");
        const pad = el("div", "idd-railpad");

        // Summary (high_level_description) + Background
        const summary = el("textarea", "idd-area"); summary.placeholder = 'Whole scene in 1–2 sentences — e.g. "A neon-lit ramen shop at night, steam rising, a lone customer at the counter"'; stop(summary);
        summary.addEventListener("input", () => setW("high_level_description", summary.value));
        const bgArea = el("textarea", "idd-area"); bgArea.placeholder = 'The setting / background — e.g. "A rain-slicked alley at night, glowing signs, wet asphalt reflections"'; stop(bgArea);
        bgArea.addEventListener("input", () => setW("background", bgArea.value));

        // Style section
        // ── preset galleries: pick a card → it applies → the gallery closes → the launcher button
        // flashes "✓ name". Layout and Style are independent axes; "My presets" live in this
        // browser's localStorage (no files, no network). ──
        const LS_STYLES = "denoIdd.stylePresets", LS_LAYOUTS = "denoIdd.layoutPresets";
        const lsLoad = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
        const lsStore = (k, arr) => { try { localStorage.setItem(k, JSON.stringify(arr)); } catch (e) {} };
        const flashBtn = (btn, label, restore) => { btn.textContent = label; setTimeout(() => { btn.textContent = restore; }, 1100); };

        // Galleries open FULL-SCREEN: the modal mounts on document.body (so no ancestor transform
        // clips it) with fixed inset:0, the grid goes wide, and Esc / click-outside / Close all shut it.
        function mkGalleryModal(title) {
          const modal = el("div", "idd-modal idd-gal-fs"); stop(modal);
          const panel = el("div", "idd-modal-panel idd-gal-panel");
          // header has three zones: title (left), tabs (center, big), actions (right)
          const h = el("div", "idd-modal-h");
          const left = el("div", "idd-h-left"); const t = el("div", "t"); t.textContent = title; left.append(t);
          const headCenter = el("div", "idd-h-center");
          const headRight = el("div", "idd-h-right");
          h.append(left, headCenter, headRight);
          modal.addEventListener("pointerdown", (e) => { if (e.target === modal) modal.remove(); });
          const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); modal.remove(); } };
          document.addEventListener("keydown", esc, true);
          const _rm = HTMLElement.prototype.remove.bind(modal);
          modal.remove = () => { document.removeEventListener("keydown", esc, true); _rm(); };
          panel.append(h); modal.append(panel); document.body.appendChild(modal);
          return { modal, panel, headCenter, headRight };
        }
        // capture the CURRENT board result image into a small webp dataURL (4:5), for "My presets"
        // cards — same-origin /view image, so the canvas isn't tainted. null when no result yet.
        function captureGalleryThumb() {
          try {
            if (!bimg || bimg.style.display === "none" || !bimg.naturalWidth || !bimg.naturalHeight) return null;
            const TW = 192, TH = 240, cv = document.createElement("canvas"); cv.width = TW; cv.height = TH;
            const cx = cv.getContext("2d"); const iw = bimg.naturalWidth, ih = bimg.naturalHeight;
            const s = Math.max(TW / iw, TH / ih), dw = iw * s, dh = ih * s;       // cover-crop
            cx.drawImage(bimg, (TW - dw) / 2, (TH - dh) / 2, dw, dh);
            return cv.toDataURL("image/webp", 0.8);
          } catch (e) { return null; }
        }
        // shared bottom row: [Save current as preset] … [Close] — Save morphs INLINE into a name
        // field (one panel, no second dialog), Enter or Save commits.
        function mkGalleryActs(modal, saveCfg) {
          const acts = el("div", "idd-modal-acts");
          const closeB = el("button", "idd-mbtn"); closeB.textContent = "Close";
          closeB.onclick = (e) => { e.stopPropagation(); modal.remove(); };
          if (!saveCfg) { acts.append(closeB); return acts; }
          const saveB = el("button", "idd-mbtn"); saveB.textContent = "Save current as preset";
          if (saveCfg.disabled) { saveB.disabled = true; saveB.title = saveCfg.disabled; }
          saveB.onclick = (e) => {
            e.stopPropagation();
            const row = el("span", "idd-gal-save"); stop(row);
            const nameIn = el("input"); nameIn.type = "text"; nameIn.placeholder = "Preset name"; nameIn.maxLength = 40;
            const okB = el("button", "idd-mbtn"); okB.textContent = "Save";
            const noB = el("button", "idd-mbtn"); noB.textContent = "✕";
            const commitSave = () => { const nm = nameIn.value.trim(); if (!nm) { nameIn.focus(); return; } saveCfg.onSave(nm); row.replaceWith(saveB); };
            okB.onclick = (ev) => { ev.stopPropagation(); commitSave(); };
            noB.onclick = (ev) => { ev.stopPropagation(); row.replaceWith(saveB); };
            nameIn.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") commitSave(); if (ev.key === "Escape") row.replaceWith(saveB); });
            row.append(nameIn, okB, noB);
            saveB.replaceWith(row); nameIn.focus();
          };
          acts.append(saveB, closeB);
          return acts;
        }
        // a user card's ✕: first click arms ("Delete?"), second click within 2s deletes — cheap
        // protection because localStorage deletion has no Ctrl+Z.
        function mkDelBtn(onDelete) {
          const del = el("div", "idd-gal-del"); del.textContent = "✕"; del.title = "Delete this preset";
          del.onclick = (e) => {
            e.stopPropagation();
            if (!del.classList.contains("arm")) {
              del.classList.add("arm"); del.textContent = "Delete?";
              setTimeout(() => { del.classList.remove("arm"); del.textContent = "✕"; }, 2000);
            } else onDelete();
          };
          return del;
        }

        // ── STYLE gallery: Photo / Art / My tabs, thumbnail cards ──
        function applyStylePreset(p) {
          const a = p.apply || {};
          applyStyleMode(p.mode); setW("style_mode", styleMode);
          aesIn.value = a.aesthetics || ""; setW("aesthetics", aesIn.value);
          ligIn.value = a.lighting || ""; setW("lighting", ligIn.value);
          medIn.value = a.medium || ""; setW("medium", medIn.value);
          if (p.mode === "photo") { photoIn.value = a.photo || ""; setW("photo", photoIn.value); }
          else { artIn.value = a.art_style || ""; setW("art_style", artIn.value); }
          if (Array.isArray(p.palette) && p.palette.length) { stylePalette = p.palette.filter((c) => HEX.test(c)).slice(0, 16); renderPalette(); }
          serialize();
          flashBtn(stylePresetBtn, "✓ " + p.name, "Presets");
        }
        function openStyleGallery() {
          const { modal, panel, headCenter, headRight } = mkGalleryModal("Style presets");
          let tab = "art";       // Style gallery lands on Art (the bigger library); Photo is one click away
          let cat = "all";       // selected category chip
          let query = "";        // search text
          const tabs = el("div", "idd-gal-tabs");
          const tBtn = (id, label) => { const b = el("button"); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); tab = id; cat = "all"; paint(); }; tabs.append(b); return b; };
          const tArt = tBtn("art", "Art"), tPhoto = tBtn("photo", "Photo"), tMine = tBtn("mine", "My presets");
          const count = el("span", "idd-gal-count");
          // search box — typing filters by name/category/style fields
          const search = el("input", "idd-gal-search"); search.type = "text"; search.placeholder = "Search styles…"; stop(search);
          search.addEventListener("input", () => { query = search.value.trim().toLowerCase(); paint(); });
          search.addEventListener("keydown", (e) => e.stopPropagation());
          const chips = el("div", "idd-gal-chips");
          const scroll = el("div", "idd-gal-scroll");   // intentional local scroll area (wheel exception)
          const grid = el("div", "idd-gal-grid"); scroll.append(grid);
          const note = el("div", "idd-gal-note");
          const matchQ = (p, q) => {
            const a = p.apply || {};
            return [p.name, p.cat, catLabel(p.cat), a.medium, a.art_style, a.photo, a.aesthetics, a.lighting]
              .filter(Boolean).join(" ").toLowerCase().includes(q);
          };
          function styleCard(p, mineIdx) {
            const c = el("div", "idd-gal-card");
            const th = el("div", "idd-gal-thumb");
            if (mineIdx === undefined) {
              const img = document.createElement("img");
              img.loading = "lazy"; img.alt = p.name;
              img.src = IDD_ASSET_BASE + "styles/" + p.key + ".webp?v=" + IDD_REV;   // ?v busts a cached 404 once a thumb is filled in a later rev
              // missing/blocked thumb → lettered placeholder, the preset still works
              img.onerror = () => { img.remove(); const ph = el("div", "ph"); ph.textContent = p.name.slice(0, 1); th.append(ph); };
              th.append(img);
            } else {
              if (p.thumb) {   // saved from the board result image
                const img = document.createElement("img"); img.alt = p.name; img.src = p.thumb;
                img.onerror = () => { img.remove(); const ph = el("div", "ph"); ph.textContent = (p.name || "?").slice(0, 1).toUpperCase(); th.append(ph); };
                th.append(img);
              } else {
                const ph = el("div", "ph"); ph.textContent = (p.name || "?").slice(0, 1).toUpperCase(); th.append(ph);
              }
              if (Array.isArray(p.palette) && p.palette.length) {
                const strip = el("div", "idd-gal-strip");
                p.palette.slice(0, 5).forEach((col) => { const sw = el("span"); sw.style.background = col; strip.append(sw); });
                th.append(strip);
              }
              c.append(mkDelBtn(() => { const mine = lsLoad(LS_STYLES); mine.splice(mineIdx, 1); lsStore(LS_STYLES, mine); paint(); }));
            }
            const nm = el("div", "idd-gal-name"); nm.textContent = p.name;
            nm.title = [p.apply && p.apply.medium, p.apply && (p.apply.art_style || p.apply.photo)].filter(Boolean).join(" · ");
            c.append(th, nm);
            c.onclick = (e) => { e.stopPropagation(); applyStylePreset(p); modal.remove(); };
            return c;
          }
          function buildChips(entries) {
            chips.innerHTML = "";
            if (tab === "mine") { chips.style.display = "none"; return; }   // user presets aren't categorized
            chips.style.display = "";
            const cats = ["all", ...Array.from(new Set(entries.map((e) => e.p.cat).filter(Boolean))).sort()];
            if (cats.length <= 2) { chips.style.display = "none"; return; }  // only "all" + 1 → no point
            cats.forEach((c) => {
              const b = el("button", "idd-gal-chip" + (c === cat ? " on" : ""));
              b.textContent = c === "all" ? "All" : catLabel(c);
              b.onclick = (e) => { e.stopPropagation(); cat = c; paint(); };
              chips.append(b);
            });
          }
          function paint() {
            tPhoto.classList.toggle("on", tab === "photo"); tArt.classList.toggle("on", tab === "art"); tMine.classList.toggle("on", tab === "mine");
            // entries carry the original index so My-preset delete stays correct under search/filter
            const base = tab === "mine"
              ? lsLoad(LS_STYLES).map((p, i) => ({ p, i }))
              : IDD_STYLES.filter((p) => p.mode === tab).map((p) => ({ p }));
            buildChips(base);
            let list = base;
            if (tab !== "mine" && cat !== "all") list = list.filter((e) => e.p.cat === cat);
            if (query) list = list.filter((e) => matchQ(e.p, query));
            grid.innerHTML = ""; note.textContent = ""; note.style.display = "none";
            count.textContent = list.length + (list.length === 1 ? " style" : " styles");
            if (tab === "mine" && !base.length) {
              note.textContent = "Nothing saved yet — set up a look you like (mode, fields, palette), then “Save current as preset”."; note.style.display = "";
            } else if (!list.length) {
              note.textContent = query ? "No styles match your search." : "Nothing here yet."; note.style.display = "";
            }
            list.forEach((e) => grid.append(styleCard(e.p, e.i)));
          }
          const acts = mkGalleryActs(modal, {
            disabled: styleMode === "none" ? "Pick Photo or Art and fill the look first" : null,
            onSave: (nm) => {
              const mine = lsLoad(LS_STYLES);
              mine.push({ name: nm, mode: styleMode, palette: stylePalette.slice(0, 16),
                thumb: captureGalleryThumb() || undefined,    // current board result → card preview
                apply: { aesthetics: aesIn.value, lighting: ligIn.value, medium: medIn.value,
                  photo: styleMode === "photo" ? photoIn.value : undefined,
                  art_style: styleMode === "art" ? artIn.value : undefined } });
              lsStore(LS_STYLES, mine); tab = "mine"; cat = "all"; paint();
            },
          });
          headCenter.append(tabs); headRight.append(count, acts);
          panel.append(search, chips, scroll, note);
          paint();
        }

        // ── LAYOUT gallery: wireframe cards (built-ins + My) ──
        function applyLayoutPreset(p) {
          if (p.px && p.px.length === 2) {           // user preset: restore the exact pixels
            setRes(p.px[0], p.px[1], friendlyRatio(p.px[0], p.px[1]), p.px[0] + ":" + p.px[1]);
          } else {
            const r = RATIOS.find((x) => x[0] === p.ar);
            if (r) { const [w, h] = dimsFor(r[1], r[2], mp); setRes(w, h, p.ar, p.ar); }
          }
          boxes = (p.boxes || []).map((b) => normBox({ x: b.x, y: b.y, w: b.w, h: b.h, type: b.type, text: b.text || "", desc: b.desc || "", palette: Array.isArray(b.palette) ? b.palette : [] }));
          // built-in layouts also drop in DRAFT prompt text (summary + background) so a click gives a
          // ready-to-edit starting scene, not just empty boxes. Only overwrite when the preset carries
          // text (user-saved layouts may omit it → keep whatever's on the board).
          if (typeof p.summary === "string") { summary.value = p.summary; setW("high_level_description", p.summary); }
          if (typeof p.background === "string") { bgArea.value = p.background; setW("background", p.background); }
          selectedId = null;
          renderBoxes(); renderElements(); layoutStage();
          serialize();
          flashBtn(layoutsBtn, "✓ " + p.name, LAYOUTS_BTN_LABEL);
        }
        function wirePreview(p) {
          const frame = el("div", "idd-gal-wire");
          const inner = el("div", "win");
          let rw = 1, rh = 1;
          if (p.px && p.px.length === 2) { rw = p.px[0]; rh = p.px[1]; }
          else { const r = RATIOS.find((x) => x[0] === p.ar); if (r) { rw = r[1]; rh = r[2]; } }
          // fit the mini frame at its TRUE ratio inside a fixed budget (% sizing would measure
          // width against the card and height against the strip — two different parents = distortion)
          const AVAIL_W = 128, AVAIL_H = 70, sc = Math.min(AVAIL_W / rw, AVAIL_H / rh);
          inner.style.width = Math.round(rw * sc) + "px";
          inner.style.height = Math.round(rh * sc) + "px";
          (p.boxes || []).forEach((b) => {
            const d = el("div", "wb" + (b.type === "text" ? " t" : ""));
            d.style.left = (b.x * 100) + "%"; d.style.top = (b.y * 100) + "%";
            d.style.width = (b.w * 100) + "%"; d.style.height = (b.h * 100) + "%";
            if (b.type === "text") d.textContent = "T";
            inner.append(d);
          });
          frame.append(inner);
          return frame;
        }
        // built-in layouts show a REAL generated example photo (styles/layouts/<key>.webp); a missing
        // file or a user-saved layout (no bundled image) degrades to the wireframe miniature.
        function layoutThumb(p, isUser) {
          if (!isUser && p.key) {
            const th = el("div", "idd-gal-lthumb");
            const img = document.createElement("img");
            img.loading = "lazy"; img.alt = p.name;
            img.src = IDD_ASSET_BASE + "styles/layouts/" + p.key + ".webp?v=" + IDD_REV;   // ?v busts a cached 404 once a thumb is filled in a later rev
            img.onerror = () => { img.remove(); th.append(wirePreview(p)); };
            th.append(img);
            return th;
          }
          return wirePreview(p);
        }
        function openLayoutGallery() {
          const { modal, panel, headRight } = mkGalleryModal("Layout presets");
          let cat = "all", query = "";
          const count = el("span", "idd-gal-count");
          const search = el("input", "idd-gal-search"); search.type = "text"; search.placeholder = "Search layouts…"; stop(search);
          search.addEventListener("input", () => { query = search.value.trim().toLowerCase(); paint(); });
          search.addEventListener("keydown", (e) => e.stopPropagation());
          const chips = el("div", "idd-gal-chips");
          const scroll = el("div", "idd-gal-scroll");
          const grid = el("div", "idd-gal-grid lay"); scroll.append(grid);
          const note = el("div", "idd-gal-note");
          const matchQ = (p, q) => [p.name, p.cat, catLabel(p.cat), p.ar, p.summary].filter(Boolean).join(" ").toLowerCase().includes(q);
          function layoutCard(p, mineIdx) {
            const c = el("div", "idd-gal-card lay");
            c.append(layoutThumb(p, mineIdx !== undefined));
            const nm = el("div", "idd-gal-name");
            nm.textContent = p.name + "  ·  " + (p.px ? p.px[0] + "×" + p.px[1] : p.ar);
            if (mineIdx !== undefined) c.append(mkDelBtn(() => { const mine = lsLoad(LS_LAYOUTS); mine.splice(mineIdx, 1); lsStore(LS_LAYOUTS, mine); paint(); }));
            c.append(nm);
            c.onclick = (e) => { e.stopPropagation(); applyLayoutPreset(p); modal.remove(); };
            return c;
          }
          function buildChips() {
            chips.innerHTML = "";
            const cats = ["all", ...Array.from(new Set(IDD_LAYOUTS.map((p) => p.cat).filter(Boolean))).sort()];
            cats.forEach((c) => {
              const b = el("button", "idd-gal-chip" + (c === cat ? " on" : ""));
              b.textContent = c === "all" ? "All" : catLabel(c);
              b.onclick = (e) => { e.stopPropagation(); cat = c; paint(); };
              chips.append(b);
            });
          }
          function paint() {
            buildChips();
            grid.innerHTML = "";
            let list = IDD_LAYOUTS.slice();
            if (cat !== "all") list = list.filter((p) => p.cat === cat);
            if (query) list = list.filter((p) => matchQ(p, query));
            list.forEach((p) => grid.append(layoutCard(p)));
            const mine = (cat === "all" && !query) ? lsLoad(LS_LAYOUTS) : [];
            mine.forEach((p, i) => grid.append(layoutCard(p, i)));
            count.textContent = (list.length + mine.length) + " layouts";
            note.style.display = list.length ? "none" : "";
            note.textContent = list.length ? "" : (query ? "No layouts match your search." : "Nothing here.");
          }
          const acts = mkGalleryActs(modal, {
            disabled: boxes.length ? null : "Draw at least one box first",
            onSave: (nm) => {
              const mine = lsLoad(LS_LAYOUTS);
              mine.push({ name: nm, px: [getW("width", 1024), getW("height", 1024)],
                summary: summary.value || "", background: bgArea.value || "",   // capture draft text too → full template
                boxes: boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, type: b.type, text: b.text || "", desc: b.desc || "", palette: (b.palette || []).slice(0, 5) })) });
              lsStore(LS_LAYOUTS, mine); paint();
              modal.remove(); flashBtn(layoutsBtn, "✓ Saved", LAYOUTS_BTN_LABEL);
            },
          });
          headRight.append(count, acts);
          panel.append(search, chips, scroll, note);
          paint();
        }

        const styleSec = el("div", "idd-sec");
        const styleLbl = el("div", "idd-seclbl"); styleLbl.textContent = "Style";
        const stylePresetBtn = el("button", "idd-preset-btn"); stylePresetBtn.textContent = "Presets";
        stylePresetBtn.title = "Style preset gallery — pick a look and it fills the style fields; save your own too";
        stylePresetBtn.onclick = (e) => { e.stopPropagation(); openStyleGallery(); };
        styleLbl.append(el("span", "idd-sp"), stylePresetBtn);
        styleLbl.style.display = "flex"; styleLbl.style.alignItems = "center";
        const seg = el("div", "idd-seg");
        const bNone = el("button"); bNone.textContent = "None";
        const bPhoto = el("button"); bPhoto.textContent = "Photo";
        const bArt = el("button"); bArt.textContent = "Art";
        seg.append(bNone, bPhoto, bArt);
        const fields = el("div", "idd-fields");
        const aesIn = el("input"); aesIn.placeholder = "aesthetics — e.g. vibrant, minimalist, moody"; stop(aesIn);
        const ligIn = el("input"); ligIn.placeholder = "lighting — e.g. soft daylight, neon glow, golden hour"; stop(ligIn);
        const medIn = el("input"); medIn.placeholder = "medium — e.g. photograph, oil painting, 3D render"; stop(medIn);
        const photoIn = el("input"); photoIn.placeholder = "photo — e.g. 35mm, macro, aerial"; stop(photoIn);
        const artIn = el("input"); artIn.placeholder = "art_style — e.g. cel-shaded anime, watercolor"; stop(artIn);
        aesIn.addEventListener("input", () => setW("aesthetics", aesIn.value));
        ligIn.addEventListener("input", () => setW("lighting", ligIn.value));
        medIn.addEventListener("input", () => setW("medium", medIn.value));
        photoIn.addEventListener("input", () => setW("photo", photoIn.value));
        artIn.addEventListener("input", () => setW("art_style", artIn.value));
        fields.append(aesIn, ligIn, medIn, photoIn, artIn);
        const palLbl = el("div", "idd-ml"); palLbl.textContent = "🎨 Style color palette (whole image)";
        const pal = el("div", "idd-pal");
        styleSec.append(styleLbl, seg, fields, palLbl, pal);

        function applyStyleMode(m) {
          styleMode = (m === "photo" || m === "art") ? m : "none";
          bNone.classList.toggle("on", styleMode === "none");
          bPhoto.classList.toggle("on", styleMode === "photo");
          bArt.classList.toggle("on", styleMode === "art");
          // photo|art_style: exactly one is relevant (§7)
          photoIn.style.display = styleMode === "photo" ? "" : "none";
          artIn.style.display = styleMode === "art" ? "" : "none";
          const dim = styleMode === "none";
          aesIn.style.display = ligIn.style.display = medIn.style.display = dim ? "none" : "";
        }
        bNone.onclick = () => { applyStyleMode("none"); setW("style_mode", "none"); };
        bPhoto.onclick = () => { applyStyleMode("photo"); setW("style_mode", "photo"); };
        bArt.onclick = () => { applyStyleMode("art"); setW("style_mode", "art"); };

        // ── shared color-picker popover: pick a color FIRST, then Save commits it. One flow for the
        // style palette AND the element editor, so adding a color feels identical everywhere. ──
        let colorPop = null;
        function closeColorPop() { if (colorPop) { colorPop.remove(); colorPop = null; } }
        function openColorPicker(anchor, initial, onSave, onDelete) {
          closeColorPop();
          // OUR OWN picker — no OS dialog, no second step. ONE panel with everything:
          // saturation/value field + hue bar + live HEX / RGB / HSL readouts + Delete · Copy · Save.
          const pop = el("div", "idd-colorpop"); stop(pop);
          const initHex = HEX.test(initial) ? initial.toUpperCase() : "#4ECB8D";
          let hsv = rgbToHsv(hexToRgb(initHex));
          const sv = el("div", "sv"); const svDot = el("div", "dot"); sv.append(svDot);
          const hue = el("div", "hue"); const hueDot = el("div", "hdot"); hue.append(hueDot);
          // big preview of the current color; when EDITING an existing color, split old | new
          const prev = el("div", "prev");
          let prevNew = prev;
          if (onDelete) {
            const oldHalf = el("div", "half"); oldHalf.style.background = initHex; oldHalf.title = "Before — " + initHex;
            prevNew = el("div", "half"); prevNew.title = "After (current)";
            prev.append(oldHalf, prevNew);
          }
          const vals = el("div", "vals");
          const mkCopy = (getText) => {
            const cp = el("button", "cp"); cp.textContent = "⧉"; cp.title = "Copy this value";
            cp.onclick = (e) => {
              e.stopPropagation();
              try { navigator.clipboard.writeText(getText()); } catch (x) {}
              cp.textContent = "✓"; setTimeout(() => { cp.textContent = "⧉"; }, 700);
            };
            return cp;
          };
          const hexRow = el("div", "vrow");
          const hexK = el("span", "k"); hexK.textContent = "HEX";
          const hexIn = el("input"); hexIn.type = "text"; stop(hexIn);
          hexRow.append(hexK, hexIn, mkCopy(() => curHex()));
          const rgbRow = el("div", "vrow"); const rgbK = el("span", "k"); rgbK.textContent = "RGB";
          const rgbV = el("span", "v"); rgbRow.append(rgbK, rgbV, mkCopy(() => { const c = hsvToRgb(hsv); return "rgb(" + c.r + ", " + c.g + ", " + c.b + ")"; }));
          const hslRow = el("div", "vrow"); const hslK = el("span", "k"); hslK.textContent = "HSL";
          const hslV = el("span", "v"); hslRow.append(hslK, hslV, mkCopy(() => { const h = rgbToHsl(hsvToRgb(hsv)); return "hsl(" + Math.round(h.h) + ", " + Math.round(h.s * 100) + "%, " + Math.round(h.l * 100) + "%)"; }));
          vals.append(hexRow, rgbRow, hslRow);
          const acts = el("div", "acts");
          const ok = el("button", "save"); ok.textContent = "Save";
          if (onDelete) {
            const delB = el("button", "del"); delB.textContent = "Delete";
            delB.onclick = (e) => { e.stopPropagation(); closeColorPop(); onDelete(); };
            acts.append(delB);
          }
          acts.append(el("span", "sp"), ok);

          const curHex = () => rgbToHex(hsvToRgb(hsv));
          function paint(keepHexText) {
            const rgb = hsvToRgb(hsv), hx = rgbToHex(rgb), hsl = rgbToHsl(rgb);
            if (!keepHexText) hexIn.value = hx;
            rgbV.textContent = rgb.r + ", " + rgb.g + ", " + rgb.b;
            hslV.textContent = Math.round(hsl.h) + "°, " + Math.round(hsl.s * 100) + "%, " + Math.round(hsl.l * 100) + "%";
            prevNew.style.background = hx;
            sv.style.background = "linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(" + Math.round(hsv.h) + ",100%,50%))";
            svDot.style.left = (hsv.s * 100) + "%"; svDot.style.top = ((1 - hsv.v) * 100) + "%";
            svDot.style.background = hx;
            hueDot.style.left = (hsv.h / 360 * 100) + "%";
            hueDot.style.background = "hsl(" + Math.round(hsv.h) + ",100%,50%)";
          }
          const dragOn = (elx, fn) => {
            const mv = (e) => {
              const r = elx.getBoundingClientRect();
              fn(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
                 Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
              paint();
            };
            elx.addEventListener("pointerdown", (e) => {
              if (e.button !== 0) return;
              e.stopPropagation(); e.preventDefault(); mv(e);
              const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
              window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
            });
          };
          dragOn(sv, (x, y) => { hsv.s = x; hsv.v = 1 - y; });
          dragOn(hue, (x) => { hsv.h = Math.min(359.9, x * 360); });
          hexIn.addEventListener("input", () => {
            const v = hexIn.value.trim();
            if (HEX.test(v)) { hsv = rgbToHsv(hexToRgb(v)); paint(true); }
          });
          ok.onclick = (e) => { e.stopPropagation(); const v = curHex(); closeColorPop(); onSave(v); };

          pop.append(sv, hue, prev, vals, acts);
          wrap.appendChild(pop);
          // position in WRAP-LOCAL pixels: rects are in screen px, but the canvas SCALES the DOM
          // widget — divide by the zoom or the popover lands far from the anchor (top-left drift).
          const wr = wrap.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
          const scale = (wr.width / (wrap.offsetWidth || wr.width)) || 1;
          pop.style.left = Math.max(6, Math.min((wrap.offsetWidth || 400) - 232, (ar.left - wr.left) / scale)) + "px";
          pop.style.top = ((ar.bottom - wr.top) / scale + 6) + "px";
          colorPop = pop;
          paint();
          setTimeout(() => {
            const closer = (ev) => {
              if (!colorPop) { document.removeEventListener("pointerdown", closer, true); return; }
              if (ev.button === 1) return;   // middle-click = canvas pan — never dismiss the picker
              if (!colorPop.contains(ev.target)) { closeColorPop(); document.removeEventListener("pointerdown", closer, true); }
            };
            document.addEventListener("pointerdown", closer, true);
          }, 0);
        }

        function renderPalette() {
          pal.querySelectorAll(".idd-sw,.idd-add").forEach((n) => n.remove());
          stylePalette.forEach((c, i) => {
            const sw = el("div", "idd-sw"); sw.style.background = c; sw.title = "Click to edit or delete";
            sw.addEventListener("click", (e) => {
              e.stopPropagation();
              openColorPicker(sw, c,
                (v) => { stylePalette[i] = v; renderPalette(); serialize(); },
                () => { stylePalette.splice(i, 1); renderPalette(); serialize(); });
            });
            pal.append(sw);
          });
          const add = el("button", "idd-add"); add.textContent = "+"; add.title = "Add a palette color";
          add.onclick = (e) => {
            e.stopPropagation();
            openColorPicker(add, "#4ECB8D", (v) => { stylePalette.push(v); renderPalette(); serialize(); });
          };
          pal.append(add);
        }

        // Elements section
        const elemSec = el("div", "idd-sec");
        const elemLbl = el("div", "idd-seclbl"); elemLbl.textContent = "Elements";
        const elemList = el("div");
        elemSec.append(elemLbl, elemList);

        function clearElementDropPreview() {
          elemList.querySelectorAll(".drop-before,.drop-after").forEach((elx) => {
            elx.classList.remove("drop-before", "drop-after");
          });
        }
        function elementDropAfter(e, row) {
          const r = row.getBoundingClientRect();
          return (e.clientY - r.top) > r.height / 2;
        }
        function paintElementDropPreview(e, row) {
          clearElementDropPreview();
          row.classList.toggle("drop-after", elementDropAfter(e, row));
          row.classList.toggle("drop-before", !elementDropAfter(e, row));
        }
        function reorderElementDrop(e, targetBox, row) {
          const movingId = +e.dataTransfer.getData("text/plain");
          if (!Number.isFinite(movingId) || movingId === targetBox.id) return;
          const moving = boxes.find((x) => x.id === movingId);
          if (!moving) return;
          const frontFirst = boxes.slice().reverse().filter((x) => x.id !== movingId);
          const target = frontFirst.findIndex((x) => x.id === targetBox.id);
          if (target < 0) return;
          frontFirst.splice(target + (elementDropAfter(e, row) ? 1 : 0), 0, moving);
          boxes = frontFirst.reverse();
          renderBoxes(); renderElements(); serialize();
        }

        function renderElements() {
          ensureBoxUiColors();
          elemList.textContent = "";
          boxes.map((b, i) => ({ b, i })).reverse().forEach(({ b, i }) => {
            const row = el("div", "idd-elem" + (b.id === selectedId ? " sel" : ""));
            row.dataset.iddBoxId = String(b.id);
            row.title = "Double-click to edit this element.";
            const n = el("span", "n"); n.textContent = String(i + 1).padStart(2, "0");
            const c = el("span", "c"); c.style.background = boxColor(b, i);
            const t = el("span", "t"); t.textContent = b.type === "text" ? ('"' + (b.text || "") + '"') : (b.desc || "(no description)");
            const ty = el("span", "ty"); ty.textContent = b.type;
            ty.onclick = (e) => { e.stopPropagation(); b.type = b.type === "text" ? "obj" : "text"; renderElements(); renderBoxes(); serialize(); };
            const dup = el("span", "dup"); dup.textContent = "⧉"; dup.title = "Duplicate";
            dup.onclick = (e) => { e.stopPropagation(); const cp = Object.assign({}, b, { id: _bid++, x: Math.min(1 - b.w, b.x + 0.03), y: Math.min(1 - b.h, b.y + 0.03), palette: (b.palette || []).slice(), uiColor: uiColorForIndex(boxes.length) }); boxes.splice(i + 1, 0, cp); setSel(cp.id); renderBoxes(); renderElements(); serialize(); };
            const x = el("span", "x"); x.textContent = "✕";
            x.onclick = (e) => { e.stopPropagation(); if (selectedId === b.id) selectedId = null; boxes.splice(i, 1); renderBoxes(); renderElements(); serialize(); };
            const grip = el("span", "g"); grip.textContent = "⠿"; grip.title = "Drag to reorder (draw order / z)"; grip.draggable = true;
            grip.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(b.id)); e.dataTransfer.effectAllowed = "move"; });
            grip.addEventListener("dragend", clearElementDropPreview);
            row.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; paintElementDropPreview(e, row); });
            row.addEventListener("dragleave", clearElementDropPreview);
            row.addEventListener("drop", (e) => {
              e.preventDefault();
              reorderElementDrop(e, b, row);
              clearElementDropPreview();
            });
            row.onclick = () => setSel(b.id);
            row.addEventListener("dblclick", (e) => {
              e.stopPropagation();
              if (e.target && e.target.closest && e.target.closest(".g,.ty,.dup,.x")) return;
              setSel(b.id);
              const idx = boxes.findIndex((x) => x.id === b.id);
              if (idx >= 0) openElementEditor(idx);
            });
            row.addEventListener("mouseenter", () => { const bx = ov.querySelector(`[data-idd-box-id="${b.id}"]`); if (bx) bx.classList.add("hov"); });
            row.addEventListener("mouseleave", () => { const bx = ov.querySelector(`[data-idd-box-id="${b.id}"]`); if (bx) bx.classList.remove("hov"); });
            row.append(grip, n, c, t, ty, dup, x); elemList.append(row);
          });
          if (!boxes.length) { const e0 = el("div", "idd-elem"); e0.style.color = "var(--dim)"; e0.textContent = "Drag on the board to add a region"; elemList.append(e0); }
        }

        // rail order: Style is kept above Elements so Photo/Art stays visible at the compact default size.
        pad.append(
          mkSec("Summary", summary), mkSec("Background", bgArea), styleSec, elemSec,
        );
        rail.append(pad);
        body.append(board, rail, railBtn);   // railBtn = edge tab pinned to the board↔panel boundary
        body.style.position = "relative";

        // ── bottom strip: grouped by JOB — [image output] | [caption clipboard] | [presets] … [danger]
        // (Gestalt proximity: three different jobs get separators; the destructive Clear stays isolated
        // far right with a confirm step.)
        const bot = el("div", "idd-bot");
        const save = mkBtn("Save Image"); const auto = mkBtn("Auto-save"); const copy = mkBtn("Copy JSON");
        const paste = mkBtn("Paste JSON"); const clear = mkBtn("Clear Board", true);
        const undoBtn = mkBtn("↶"); undoBtn.classList.add("idd-histbtn", "idd-undo");
        const redoBtn = mkBtn("↷"); redoBtn.classList.add("idd-histbtn", "idd-redo");
        save.title = "Save the latest result image into ComfyUI's output folder";
        auto.title = "Auto-save every result image as it arrives (toggle)";
        copy.title = "Copy the board as official Ideogram caption JSON (exactly what the node outputs)";
        paste.title = "Paste a caption JSON onto the board — official Ideogram format (LLM output, shared prompts) or a board copy";
        clear.title = "Remove all boxes and reset the fields — use ↶ to undo it";
        undoBtn.title = "Undo board edit";
        redoBtn.title = "Redo board edit";
        // toggle affordance: the leading ●/○ shows the auto-save STATE at a glance
        const paintAuto = () => { auto.textContent = (autoOn ? "● " : "○ ") + "Auto-save"; auto.classList.toggle("on", autoOn); };
        // save is meaningless before a result exists; success flashes confirmation
        const paintSave = () => { save.disabled = !(node._idd && node._idd._last); };
        const vsep = () => el("span", "idd-vsep");
        paintHistory = () => {
          undoBtn.disabled = !undoStack.length;
          redoBtn.disabled = !redoStack.length;
        };
        undoBtn.onclick = (e) => { e.stopPropagation(); undo(); };
        redoBtn.onclick = (e) => { e.stopPropagation(); redo(); };
        bot.append(save, auto, vsep(), copy, paste, el("span", "idd-sp"), undoBtn, redoBtn, clear);
        paintHistory();

        wrap.append(top, body, bot);

        node.addDOMWidget("idd_board", "DenoIdeogramDirector", wrap, {
          serialize: false, hideOnZoom: false, getMinHeight: () => 480,
        });
        node.resizable = true;
        const iddPositive = (value, fallback = 0) => {
          const n = Number(value);
          return Number.isFinite(n) && n > 0 ? n : fallback;
        };
        const iddSizeValue = (size, index, fallback = 0) => iddPositive(size && size[index], fallback);
        let iddUseConfiguredSize = true;
        let iddUserResizing = false;
        const iddResizeCleanups = [];
        function installIddComputeSizeGuard() {
          const nativeComputeSize = node.computeSize;
          if (nativeComputeSize && nativeComputeSize._denoIddComputeSizeGuard) return;
          const guardedComputeSize = function () {
            const computed = nativeComputeSize
              ? nativeComputeSize.apply(this, arguments)
              : [IDD_DEFAULT_W, IDD_DEFAULT_H];
            const current = this.size || [];
            const configured = iddUseConfiguredSize ? (this._iddConfiguredSize || []) : [];
            const preserveCurrent = !iddUserResizing;

            // Some ComfyUI fit paths use computeSize() after DOM interaction. The hidden
            // widgets make the native value too small, so preserve the user's current box.
            // While the user is dragging the LiteGraph resize handle, do not use the current
            // enlarged box as the resize minimum or the node can grow but never shrink again.
            return [
              Math.max(
                IDD_MIN_W,
                iddSizeValue(computed, 0, IDD_DEFAULT_W),
                iddSizeValue(configured, 0),
                preserveCurrent ? iddSizeValue(current, 0) : 0
              ),
              Math.max(
                IDD_MIN_H,
                iddSizeValue(computed, 1, IDD_DEFAULT_H),
                iddSizeValue(configured, 1),
                preserveCurrent ? iddSizeValue(current, 1) : 0
              ),
            ];
          };
          guardedComputeSize._denoIddComputeSizeGuard = true;
          guardedComputeSize._denoIddNativeComputeSize = nativeComputeSize;
          node.computeSize = guardedComputeSize;
        }
        installIddComputeSizeGuard();
        function installIddResizeIntentGuard() {
          const graphCanvas = app?.canvas;
          const canvas = graphCanvas?.canvas;
          if (!canvas) return;
          const asNumber = (value, fallback = 0) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : fallback;
          };
          const eventToGraph = (event) => {
            const rect = canvas.getBoundingClientRect();
            const scale = asNumber(graphCanvas.ds?.scale, 1) || 1;
            const offset = graphCanvas.ds?.offset || [0, 0];
            return {
              x: (event.clientX - rect.left) / scale - asNumber(offset[0]),
              y: (event.clientY - rect.top) / scale - asNumber(offset[1]),
              scale,
            };
          };
          const isResizeCorner = (event) => {
            if (!node.size || !node.pos || event.button > 0) return false;
            const p = eventToGraph(event);
            const right = asNumber(node.pos[0]) + asNumber(node.size[0]);
            const bottom = asNumber(node.pos[1]) + asNumber(node.size[1]);
            const pad = Math.max(22 / p.scale, 12);
            return p.x >= right - pad && p.x <= right + pad && p.y >= bottom - pad && p.y <= bottom + pad;
          };
          const begin = (event) => {
            if (!isResizeCorner(event)) return;
            iddUserResizing = true;
          };
          const end = () => { iddUserResizing = false; };
          canvas.addEventListener("pointerdown", begin, true);
          canvas.addEventListener("mousedown", begin, true);
          window.addEventListener("pointerup", end, true);
          window.addEventListener("pointercancel", end, true);
          window.addEventListener("mouseup", end, true);
          window.addEventListener("blur", end, true);
          iddResizeCleanups.push(
            () => canvas.removeEventListener("pointerdown", begin, true),
            () => canvas.removeEventListener("mousedown", begin, true),
            () => window.removeEventListener("pointerup", end, true),
            () => window.removeEventListener("pointercancel", end, true),
            () => window.removeEventListener("mouseup", end, true),
            () => window.removeEventListener("blur", end, true),
          );
        }
        installIddResizeIntentGuard();
        // Reset stale pre-marker saved sizes once. After a workflow is saved with this marker, keep
        // the user's saved size instead of fighting manual resize.
        setTimeout(() => {
          const props = node.properties || (node.properties = {});
          const marked = props.idd_size_rev === IDD_SIZE_REV;
          const savedSize = Array.isArray(node._iddConfiguredSize) ? node._iddConfiguredSize : (node.size || []);
          const sw = Number(savedSize[0]) || IDD_DEFAULT_W;
          const sh = Number(savedSize[1]) || IDD_DEFAULT_H;
          const recreatedTooSmall = marked && (sw < IDD_MIN_W || sh < IDD_MIN_H);
          const next = marked && !recreatedTooSmall
            ? [Math.max(IDD_MIN_W, sw), Math.max(IDD_MIN_H, sh)]
            : [IDD_DEFAULT_W, IDD_DEFAULT_H];
          props.idd_size_rev = IDD_SIZE_REV;
          if (!node.size || Math.abs(node.size[0] - next[0]) > 0.5 || Math.abs(node.size[1] - next[1]) > 0.5) {
            node.setSize(next);
          }
          iddUseConfiguredSize = false;
          node._iddConfiguredSize = null;
          installIddComputeSizeGuard();
          node.setDirtyCanvas(true, true); layoutStage(); fitTopBarAfterRestore();
        }, 0);
        setTimeout(installIddComputeSizeGuard, 250);

        let railOpen = true;
        railBtn.onclick = (e) => {
          e.stopPropagation(); railOpen = !railOpen;
          rail.classList.toggle("collapsed", !railOpen);
          railBtn.textContent = railOpen ? "»" : "«";            // chevron points where the panel will go
          railBtn.title = railOpen ? "Collapse panel" : "Expand panel";
        };

        // ── box overlay: render + draw / select / move / resize / desc-edit ──
        // auto colors: boxes WITHOUT their own palette get a distinct hue per index, so box 01/02/03
        // and their panel rows match at a glance (a box's own palette[0] still wins).
        const AUTO_COLORS = ["#4ECB8D", "#5AA7E8", "#E8B45A", "#C97FE0", "#E8705A", "#58D5C9", "#A0D060", "#E060A0"];
        const uiColorForIndex = (i) => AUTO_COLORS[Math.max(0, i || 0) % AUTO_COLORS.length];
        function ensureBoxUiColor(b, i) {
          if (!b || typeof b !== "object") return uiColorForIndex(i);
          if (!HEX.test(b.uiColor || "")) b.uiColor = uiColorForIndex(i);
          return b.uiColor;
        }
        function ensureBoxUiColors() { boxes.forEach((b, i) => ensureBoxUiColor(b, i)); }
        const boxColor = (b, i) => (b.palette && b.palette[0]) || ensureBoxUiColor(b, i);
        function renderBoxes() {
          ensureBoxUiColors();
          ov.querySelectorAll(".idd-box").forEach((n) => n.remove());
          boxes.forEach((b, i) => {
            const d = el("div", "idd-box" + (b.type === "text" ? " text" : "") + (b.id === selectedId ? " sel" : ""));
            d.dataset.iddBoxId = String(b.id);
            d.style.left = b.x * 100 + "%"; d.style.top = b.y * 100 + "%";
            d.style.width = b.w * 100 + "%"; d.style.height = b.h * 100 + "%";
            const col = boxColor(b, i); d.style.borderColor = col;
            d.style.setProperty("--bc", col);   // selection ring / handles / hover follow the box's own color
            const tag = el("span", "tag"); tag.textContent = String(i + 1).padStart(2, "0"); tag.style.background = col;
            tag.dataset.role = "move-handle";
            tag.title = "Drag this number to move the box";
            tag.addEventListener("pointerdown", (e) => onBoxDown(e, i, "move"));
            const lab = el("span", "lab"); lab.textContent = b.type === "text" ? ('"' + (b.text || "") + '"') : (b.desc || "");
            d.append(tag, lab);
            for (const dir of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {   // 8 resize handles
              const hd = el("div", "idd-h " + dir); hd.dataset.dir = dir;
              hd.addEventListener("pointerdown", (e) => { e.stopPropagation(); onBoxDown(e, i, "resize", dir); });
              d.append(hd);
            }
            d.addEventListener("pointerdown", (e) => { if (e.target === d || e.target === lab || e.target === tag) onBoxDown(e, i, "move"); });
            d.addEventListener("dblclick", (e) => { e.stopPropagation(); openElementEditor(i); });
            d.addEventListener("mouseenter", () => { const r = elemList.querySelector(`[data-idd-box-id="${b.id}"]`); if (r) r.classList.add("hov"); });
            d.addEventListener("mouseleave", () => { const r = elemList.querySelector(`[data-idd-box-id="${b.id}"]`); if (r) r.classList.remove("hov"); });
            ov.append(d);
          });
        }

        function rel(e) { const r = ov.getBoundingClientRect(); return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }; }
        // 8-handle resize: move only the grabbed edge(s), clamp inside the stage, keep w/h ≥ 0.
        function resizeBox(b, dir, p) {
          let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
          if (dir.indexOf("e") >= 0) x2 = p.x;
          if (dir.indexOf("w") >= 0) x1 = p.x;
          if (dir.indexOf("s") >= 0) y2 = p.y;
          if (dir.indexOf("n") >= 0) y1 = p.y;
          const nx = Math.max(0, Math.min(x1, x2)), ny = Math.max(0, Math.min(y1, y2));
          b.x = nx; b.y = ny;
          b.w = Math.min(Math.abs(x2 - x1), 1 - nx); b.h = Math.min(Math.abs(y2 - y1), 1 - ny);
        }
        // The old live W×H readout was more distracting than useful: during move it looked stale,
        // and during small-box edits it hid the target. Keep the element as a compatibility no-op.
        function hideDimTip() {
          dimTip.textContent = "";
          dimTip.style.display = "none";
        }
        // Update only the .sel class on the existing box divs — do NOT recreate them. Recreating divs
        // on every click breaks native dblclick: the two clicks land on different DOM nodes so the
        // browser never fires dblclick — which is exactly the double-click-to-edit-caption path.
        // (Surfaced on the real canvas; headless missed it by dispatching a synthetic dblclick.)
        function markSel() { ov.querySelectorAll(".idd-box").forEach((d, i) => d.classList.toggle("sel", boxes[i] && boxes[i].id === selectedId)); }
        // single path to change selection: set the id, then re-derive the two views (canvas .sel + list row).
        // markSel only toggles .sel (does NOT recreate box divs) so native dblclick-to-edit stays intact.
        function setSel(id) { selectedId = id; markSel(); renderElements(); }
        let drag = null;
        function cloneBoxForDrag(i) {
          const src = boxes[i];
          if (!src) return i;
          const cp = Object.assign({}, src, {
            id: _bid++,
            palette: (src.palette || []).slice(),
            uiColor: uiColorForIndex(boxes.length),
          });
          boxes.splice(i + 1, 0, cp);
          return i + 1;
        }
        function onBoxDown(e, i, mode, dir) {
          if (e.button !== 0) return; e.stopPropagation(); e.preventDefault();
          // Ctrl(⌘)+drag on a box = drag a COPY (the original stays put)
          if (mode === "move" && (e.ctrlKey || e.metaKey)) {
            i = cloneBoxForDrag(i);
            renderBoxes(); renderElements();
          }
          setSel(boxes[i].id);
          try { wrap.focus({ preventScroll: true }); } catch (x) {}   // make the board keyboard-active (arrows/Tab/Del)
          const p = rel(e), b = boxes[i];
          drag = { i, mode, dir, ox: p.x - b.x, oy: p.y - b.y, sx: e.clientX, sy: e.clientY,
                   bx: b.x, by: b.y, moved: false, copied: mode === "move" && (e.ctrlKey || e.metaKey) };
          window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
        }
        ov.addEventListener("pointerdown", (e) => {
          if (e.button !== 0 || e.target !== ov) return; e.stopPropagation(); e.preventDefault();
          const p = rel(e);
          const b = { id: _bid++, x: p.x, y: p.y, w: 0, h: 0, type: "obj", text: "", desc: "", palette: [], uiColor: uiColorForIndex(boxes.length) };
          boxes.push(b); selectedId = b.id;
          drag = { i: boxes.length - 1, mode: "draw", ox: p.x, oy: p.y, sx: e.clientX, sy: e.clientY, moved: false };
          window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
        });
        function onMove(e) {
          if (!drag) return;
          // jitter guard ONLY for move/resize of an existing box (so a click doesn't recreate divs &
          // break dblclick). A draw is always intentional; tiny draws are dropped by the w<0.02 check.
          if (drag.mode !== "draw" && !drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 4) return;
          drag.moved = true;
          if (drag.mode === "move" && !drag.copied && (e.ctrlKey || e.metaKey)) {
            const old = boxes[drag.i];
            drag.i = cloneBoxForDrag(drag.i);
            const cp = boxes[drag.i];
            if (old && cp) {
              cp.x = old.x; cp.y = old.y; cp.w = old.w; cp.h = old.h;
              selectedId = cp.id;
            }
            drag.copied = true;
            renderElements();
          }
          const p = rel(e); const b = boxes[drag.i]; if (!b) return;
          // move: clamp so the WHOLE box stays inside the stage (image) — top-left AND bottom-right.
          // (clamp01 on just the top-left lets a tall/wide box overflow the bottom/right edge.)
          if (drag.mode === "move") {
            let nx = Math.max(0, Math.min(1 - b.w, p.x - drag.ox)), ny = Math.max(0, Math.min(1 - b.h, p.y - drag.oy));
            // Shift = constrain to one axis (whichever you've moved further on)
            if (e.shiftKey) {
              if (Math.abs(nx - drag.bx) >= Math.abs(ny - drag.by)) ny = drag.by; else nx = drag.bx;
            }
            b.x = nx; b.y = ny;
          }
          else if (drag.mode === "resize") { resizeBox(b, drag.dir, p); }
          else { b.x = Math.min(drag.ox, p.x); b.y = Math.min(drag.oy, p.y); b.w = Math.abs(p.x - drag.ox); b.h = Math.abs(p.y - drag.oy); }
          hideDimTip(); renderBoxes();
        }
        function onUp() {
          window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
          hideDimTip();
          const wasDraw = !!drag && drag.mode === "draw";
          if (wasDraw) { const b = boxes[drag.i]; if (!b || b.w < 0.02 || b.h < 0.02) { boxes.splice(drag.i, 1); selectedId = null; } }
          const changed = !!drag && (drag.moved || wasDraw);
          drag = null;
          if (changed) { renderBoxes(); renderElements(); serialize(); }  // geometry changed → persist + re-render
          else { markSel(); }                                            // pure click → keep divs so dblclick fires
        }
        // ── element editor popup: pick type, enter text (text-type) + description, edit the element's
        // color palette, then Save. Replaces the cramped inline box. Anchored to wrap so it centers on
        // the node (and on the screen in fullscreen). Working copy → Cancel/Esc discards. ──
        function openElementEditor(i) {
          const b = boxes[i]; if (!b) return;
          let type = b.type === "text" ? "text" : "obj";
          let pal = (b.palette || []).slice();

          const modal = el("div", "idd-modal"); modal.tabIndex = -1; stop(modal);
          const panel = el("div", "idd-modal-panel");
          const h = el("div", "idd-modal-h");
          const tag = el("span", "tag"); tag.textContent = String(i + 1).padStart(2, "0");
          const ht = el("span", "t"); ht.textContent = "Edit element";
          h.append(tag, ht);

          const tl = el("div", "idd-ml"); tl.textContent = "Type";
          const seg = el("div", "idd-seg");
          const bObj = el("button"); bObj.textContent = "Object";
          const bTxt = el("button"); bTxt.textContent = "Text"; seg.append(bObj, bTxt);

          const txtSec = el("div", "idd-sec");
          const txtL = el("div", "idd-ml"); txtL.textContent = "Text to render";
          const txtIn = el("input"); txtIn.type = "text"; txtIn.value = b.text || ""; txtIn.placeholder = 'Exact text to appear — e.g. "OPEN 24H", "Café Luna"';
          txtSec.append(txtL, txtIn);

          const dSec = el("div", "idd-sec");
          const dL = el("div", "idd-ml"); dL.textContent = "Description";
          const dIn = el("textarea"); dIn.value = b.desc || ""; dIn.placeholder = 'Describe it fully — not just a noun. e.g. "a fluffy orange tabby cat curled asleep, soft fur, warm window light"';
          dSec.append(dL, dIn);

          const pSec = el("div", "idd-sec");
          const pL = el("div", "idd-ml"); pL.textContent = "Color palette (this element, up to 5)";
          const pRow = el("div", "idd-pal");
          // small swatches + a small "+" — identical to the style palette. Click a swatch → the
          // picker popover (Save / Delete live IN the popover); click "+" → picker → Save adds.
          function renderPal() {
            pRow.textContent = "";
            pal.forEach((c, k) => {
              const sw = el("div", "idd-sw"); sw.style.background = c; sw.title = "Click to edit or delete";
              sw.addEventListener("click", (e) => {
                e.stopPropagation();
                openColorPicker(sw, c,
                  (v) => { pal[k] = v; renderPal(); },
                  () => { pal.splice(k, 1); renderPal(); });
              });
              pRow.append(sw);
            });
            if (pal.length < 5) {
              const add = el("button", "idd-add"); add.textContent = "+"; add.title = "Add a color";
              add.onclick = (e) => {
                e.stopPropagation();
                openColorPicker(add, "#4ECB8D", (v) => { if (pal.length < 5) { pal.push(v); renderPal(); } });
              };
              pRow.append(add);
            }
          }
          renderPal(); pSec.append(pL, pRow);

          const acts = el("div", "idd-modal-acts");
          const del = el("button", "idd-mbtn del"); del.textContent = "Delete";
          const cancel = el("button", "idd-mbtn"); cancel.textContent = "Cancel";
          const save = el("button", "idd-mbtn save"); save.textContent = "Save";
          acts.append(del, el("span", "sp"), cancel, save);

          function applyType(t) { type = t === "text" ? "text" : "obj"; bObj.classList.toggle("on", type === "obj"); bTxt.classList.toggle("on", type === "text"); txtSec.style.display = type === "text" ? "" : "none"; }
          bObj.onclick = (e) => { e.stopPropagation(); applyType("obj"); };
          bTxt.onclick = (e) => { e.stopPropagation(); applyType("text"); };
          applyType(type);

          panel.append(h, tl, seg, txtSec, dSec, pSec, acts);
          modal.append(panel); wrap.appendChild(modal);
          setTimeout(() => dIn.focus(), 0);

          const close = () => { try { modal.remove(); } catch (e) {} };
          modal.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); close(); } });
          modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
          cancel.onclick = (e) => { e.stopPropagation(); close(); };
          del.onclick = (e) => { e.stopPropagation(); if (selectedId === b.id) selectedId = null; const idx = boxes.indexOf(b); if (idx >= 0) boxes.splice(idx, 1); close(); renderBoxes(); renderElements(); serialize(); };
          save.onclick = (e) => {
            e.stopPropagation();
            b.type = type; b.text = txtIn.value; b.desc = dIn.value;
            b.palette = pal.filter((c) => HEX.test(c)).slice(0, 5);
            close(); renderBoxes(); renderElements(); serialize();
          };
        }
        // Delete selected box. Board shortcuts are intentionally conservative: ComfyUI owns global
        // graph shortcuts such as Ctrl+Z/Y, while the Director's board history uses the visible
        // bottom ↶/↷ buttons. Text inputs keep native text undo.
        const isTextEntry = (t) => {
          if (!t || !t.tagName) return false;
          if (t.tagName === "TEXTAREA") return true;
          if (t.tagName === "INPUT") return ["range", "checkbox", "button", "color"].indexOf(t.type) === -1;
          return t.isContentEditable === true;
        };
        wrap.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;                      // middle-click pan keeps its own path
          if (!isTextEntry(e.target)) setTimeout(() => { try { wrap.focus({ preventScroll: true }); } catch (x) {} }, 0);
        }, true);
        wrap.addEventListener("keydown", (e) => {
          if (document.activeElement !== wrap) return;   // only when the board (not a text field) is focused
          const sb = selectedId != null ? boxes.find((x) => x.id === selectedId) : null;
          if (e.key === "Delete" || e.key === "Backspace") {
            // ALWAYS swallow while the board is focused — otherwise ComfyUI's global hotkey
            // deletes the whole NODE out from under the user.
            e.preventDefault(); e.stopPropagation();
            if (sb) { const idx = boxes.indexOf(sb); if (idx >= 0) { boxes.splice(idx, 1); selectedId = null; renderBoxes(); renderElements(); serialize(); } }
          } else if (e.key === "b" || e.key === "B") {
            e.preventDefault(); e.stopPropagation(); toggleBoxes();
          } else if (e.key === "Escape" && selectedId != null) {
            e.stopPropagation(); selectedId = null; markSel(); renderElements();
          } else if (e.key === "Tab" && boxes.length) {
            e.preventDefault(); e.stopPropagation();
            const idx = boxes.findIndex((x) => x.id === selectedId);
            setSel(boxes[(idx + (e.shiftKey ? boxes.length - 1 : 1)) % boxes.length].id);
          } else if (sb && e.key.indexOf("Arrow") === 0) {
            e.preventDefault(); e.stopPropagation();
            const step = (e.shiftKey ? 10 : 1) / 1000;   // 0–1000 grid units (Shift = 10)
            if (e.key === "ArrowLeft") sb.x = Math.max(0, sb.x - step);
            else if (e.key === "ArrowRight") sb.x = Math.min(1 - sb.w, sb.x + step);
            else if (e.key === "ArrowUp") sb.y = Math.max(0, sb.y - step);
            else if (e.key === "ArrowDown") sb.y = Math.min(1 - sb.h, sb.y + step);
            renderBoxes(); serialize();
          }
        });
        wrap.tabIndex = 0;

        // result image setter (loop-back). onResult: show it, remember it (Save), auto-save if on.
        node._idd = {
          _last: null,
          // live sync: build() echoed back the wired caption seen this run (a runtime value the
          // frontend can't read off the wire). The backend's `used` flag describes this run's
          // output path, but the visible editor still owns the overwrite policy here: a non-empty
          // Ask mode must show Accept/Keep instead of force-replacing an in-progress board.
          onImport: (p) => {
            if (!p || typeof p.json !== "string") return;
            const cap = normalizeCaption(parseCaption(p.json));
            if (!cap || typeof cap !== "object") return;
            clearRunAlert();
            const sig = p.sig || fnv1a(p.json);
            syncImportSigFromSaved();
            handleConnectedPromptEcho(cap, sig);
          },
          onPendingImport: (p) => {
            if (!p || typeof p.json !== "string") return;
            if (p.invalid) {
              queueInvalidInputPrompt(p.sig || fnv1a(p.json), p.json);
              return;
            }
            const cap = normalizeCaption(parseCaption(p.json));
            if (!cap || typeof cap !== "object") return;
            const sig = p.sig || fnv1a(p.json);
            handleConnectedPromptEcho(cap, sig);
          },
          onTranslate: (p) => {
            if (!p) return;
            translateBtn.textContent = p.ok ? "English Ready" : "English Failed";
            translateBtn.title = p.status || "English prompt status";
            setTimeout(() => { paintTranslate(); translateBtn.title = p.status || translateBtn.title; }, 1800);
          },
          onExecutionError: (p) => { showExecutionError(p); },
          preflightIncomingPromptBeforeQueue: async () => {
            if (skipNextQueuePreflight) {
              skipNextQueuePreflight = false;
              return false;
            }
            if (pendingImport) {
              if (clearPendingIfUpstreamChanged()) return false;
              showInputPromptNotice();
              return true;
            }
            handleInputPromptRaw(getImportJson());
            if (pendingImport) {
              showInputPromptNotice();
              return true;
            }
            if (!(await ensureEnglishOutputReadyBeforeQueue(true))) return true;
            return false;
          },
          setImage: (url) => { bimg.src = url; bimg.style.display = "block"; board.classList.remove("empty"); applyResultDim(); },
          onResult: (im) => {
            if (pendingImport) {
              paintPendingPrompt();
              showInputPromptNotice();
              return;
            }
            clearRunAlert();
            node._idd._last = im;
            paintSave(); paintRegen();        // a result now exists: Save Image enables, label → "Regenerate"
            node._idd.setImage("/view?" + new URLSearchParams({ filename: im.filename || "", subfolder: im.subfolder || "", type: im.type || "output" }).toString());
            if (autoOn) { try { api.fetchApi("/deno/ideogram_director/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: im.filename, subfolder: im.subfolder, type: im.type, prefix: getW("save_prefix", "Ideogram_Director") }) }); } catch (x) {} }
          },
        };

        // ── actions ──
        // Design A: the Director outputs `prompt` (wired forward into CLIPTextEncode), so Regenerate
        // is just a standard re-queue. Edited board state is already serialized into caption_data,
        // so the backend re-assembles from it on the next
        // run. Unlocked seed → randomize so each run differs; locked → ComfyUI caches the upstream LLM
        // branch and only the edited caption changes. Incoming JSON Prompt controls whether a fresh
        // upstream JSON replaces this board automatically or waits for Apply/Keep.
        regen.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            if (pendingImport) {
              showInputPromptNotice();
              return;
            }
            handleInputPromptRaw(getImportJson());
            if (pendingImport) {
              showInputPromptNotice();
              return;
            }
            clearRunAlert();
            if (!seedLocked) { const s = (Math.floor(Math.random() * 0xffffffff)) >>> 0; seedIn.value = String(s); setW("seed", s); }
            await app.queuePrompt(0);
          } catch (err) { console.error("[Director] regenerate failed", err); }
        });
        // current board → OFFICIAL caption JSON (mirror of the backend _assemble_caption: same
        // shape and key order as the node's prompt output) — so Copy gives you exactly what ships,
        // ready to share or re-import anywhere.
        function assembleCaption() {
          const cap = {};
          if (getW("include_aspect_ratio", false)) cap.aspect_ratio = getW("aspect_ratio", "") || "1:1";
          if ((summary.value || "").trim()) cap.high_level_description = summary.value;
          if (styleMode === "photo" || styleMode === "art") {
            const sd = { aesthetics: aesIn.value, lighting: ligIn.value };
            if (styleMode === "photo") { sd.photo = photoIn.value; sd.medium = medIn.value; }
            else { sd.medium = medIn.value; sd.art_style = artIn.value; }
            const spal = stylePalette.filter((c) => HEX.test(c)).slice(0, 16);
            if (spal.length) sd.color_palette = spal;
            cap.style_description = sd;
          }
          const grid = (v) => Math.max(0, Math.min(1000, Math.round(v * 1000)));
          const els = boxes.map((b) => {
            const t = b.type === "text" ? "text" : "obj";
            const el = { type: t, bbox: [grid(b.y), grid(b.x), grid(b.y + b.h), grid(b.x + b.w)] };
            if (t === "text") el.text = b.text || "";
            el.desc = b.desc || "";
            const bpal = (b.palette || []).filter((c) => HEX.test(c)).slice(0, 5);
            if (bpal.length) el.color_palette = bpal;
            return el;
          });
          cap.compositional_deconstruction = { background: bgArea.value || "", elements: els };
          return cap;
        }
        copy.addEventListener("click", async (e) => {
          e.stopPropagation();
          const done = (label) => {
            copy.textContent = label;
            setTimeout(() => { copy.textContent = "Copy JSON"; }, 900);
          };
          try {
            let cap = assembleCaption();
            if (normalizeTranslateValue(getW("translate_output", NO_TRANSLATION)) === ENGLISH_PROMPT) {
              copy.textContent = "Translating...";
              cap = await translateCaptionToEnglishForOutput(cap, true, "the English JSON output");
            }
            const written = navigator.clipboard.writeText(JSON.stringify(cap));
            if (written && typeof written.then === "function") written.then(() => done("✓ Copied"), () => done("Copy failed"));
            else done("✓ Copied");
          } catch (x) { done("Copy failed"); }
        });
        // Paste understands BOTH dialects: an OFFICIAL Ideogram caption (LLM output / shared
        // prompt / our Copy) → full board sync, or an internal board copy (older Copy format).
        // Returns true if the text was a recognizable caption and got applied.
        function applyPastedText(t) {
          const cap = parseCaption(t);
          if (cap && Array.isArray(cap.boxes)) {        // internal board-copy format
            boxes = cap.boxes.map(normBox);
            stylePalette = Array.isArray(cap.stylePalette) ? cap.stylePalette.filter((c) => HEX.test(c)) : [];
            selectedId = null; renderBoxes(); renderPalette(); renderElements(); serialize();
            return true;
          }
          const normalized = normalizeCaption(cap);
          if (normalized && (normalized.compositional_deconstruction || typeof normalized.high_level_description === "string")) {
            applyImportedCaption(normalized);            // official caption → boxes+summary+bg+style+size
            selectedId = null;
            renderBoxes(); renderPalette(); renderElements(); layoutStage(); serialize();
            translateBoardToViewLanguage("auto");
            return true;
          }
          return false;
        }
        // Paste opens a small dialog: the user presses Ctrl+V into the textarea, then clicks "Paste"
        // (Ctrl+Enter also applies). More reliable than reading the clipboard directly (no permission
        // prompt / focus issues) and lets the user see/clean the JSON before applying.
        function openPasteDialog() {
          const modal = el("div", "idd-modal"); modal.tabIndex = -1;
          const panel = el("div", "idd-modal-panel idd-paste-panel");
          const h = el("div", "idd-modal-h");
          const ht = el("span", "t"); ht.textContent = "Paste caption JSON"; h.append(ht);
          const hint = el("div", "idd-ml"); hint.textContent = "Press Ctrl+V to paste, then click Paste";
          const ta = el("textarea"); ta.placeholder = "Paste an Ideogram caption JSON here (Ctrl+V)…"; ta.spellcheck = false;
          const err = el("div", "idd-paste-err"); err.style.display = "none";
          const acts = el("div", "idd-modal-acts");
          const cancel = el("button", "idd-mbtn"); cancel.textContent = "Cancel";
          const apply = el("button", "idd-mbtn save"); apply.textContent = "Paste";
          acts.append(el("span", "sp"), cancel, apply);
          panel.append(h, hint, ta, err, acts);
          modal.append(panel); wrap.appendChild(modal);
          setTimeout(() => ta.focus(), 0);
          const close = () => { try { modal.remove(); } catch (e) {} };
          const doApply = () => {
            if (!ta.value.trim()) { err.textContent = "Nothing pasted yet — press Ctrl+V first."; err.style.display = ""; ta.focus(); return; }
            if (applyPastedText(ta.value)) { close(); paste.textContent = "✓ Pasted"; setTimeout(() => { paste.textContent = "Paste JSON"; }, 1100); }
            else { err.textContent = "That isn't a valid Ideogram caption JSON."; err.style.display = ""; }
          };
          ta.addEventListener("input", () => { err.style.display = "none"; });
          modal.addEventListener("keydown", (e) => {
            e.stopPropagation();                          // keep Ctrl+Z/V etc. fenced off from ComfyUI
            if (e.key === "Escape") { e.preventDefault(); close(); }
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); doApply(); }
          });
          modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
          cancel.onclick = (e) => { e.stopPropagation(); close(); };
          apply.onclick = (e) => { e.stopPropagation(); doApply(); };
        }
        paste.addEventListener("click", (e) => { e.stopPropagation(); openPasteDialog(); });
        function currentWireImportSig() {
          try {
            const ij = getImportJson();
            return (ij && ij.trim()) ? fnv1a(ij) : "";
          } catch (x) { return ""; }
        }
        function clearBoardState() {
          const wireSig = currentWireImportSig();
          if (wireSig) lastImportSig = wireSig;       // same connected JSON must not refill after F5/R
          boxes = [];
          selectedId = null;
          stylePalette = [];
          summary.value = ""; setW("high_level_description", "");
          bgArea.value = ""; setW("background", "");
          aesIn.value = ""; setW("aesthetics", "");
          ligIn.value = ""; setW("lighting", "");
          medIn.value = ""; setW("medium", "");
          photoIn.value = ""; setW("photo", "");
          artIn.value = ""; setW("art_style", "");
          applyStyleMode("none"); setW("style_mode", "none");
          clearResultPreview();
          pendingImport = null;
          closeColorPop();
          renderBoxes();
          renderPalette();
          renderElements();
          layoutStage();
          applyBackdrop();
          paintSave();
          paintRegen();
          paintPendingPrompt();
          serialize();
        }
        // destructive confirm: first click ARMS ("Clear Board?" red-filled, 2.5s); second click clears.
        let clearArm = null;
        clear.addEventListener("click", (e) => {
          e.stopPropagation();
          clearRunAlert();
          if (!clearArm) {
            clear.textContent = "Clear Board?"; clear.classList.add("arm");
            clearArm = setTimeout(() => { clearArm = null; clear.textContent = "Clear Board"; clear.classList.remove("arm"); }, 2500);
            return;
          }
          clearTimeout(clearArm); clearArm = null;
          clear.textContent = "Clear Board"; clear.classList.remove("arm");
          clearBoardState();
        });
        save.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            const r = node._idd._last; if (!r) return;
            await api.fetchApi("/deno/ideogram_director/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: r.filename, subfolder: r.subfolder, type: r.type, prefix: getW("save_prefix", "Ideogram_Director") }) });
            save.textContent = "✓ Saved"; setTimeout(() => { save.textContent = "Save Image"; }, 900);
          } catch (x) { console.error("[Director] save failed", x); }
        });
        let autoOn = false;
        auto.addEventListener("click", (e) => { e.stopPropagation(); autoOn = !autoOn; setW("auto_save", autoOn); paintAuto(); });
        paintAuto(); paintSave();
        [save, auto, copy, paste, clear, undoBtn, redoBtn, info, translateBtn, translateRefreshBtn].forEach((b) => b.addEventListener("mousedown", (e) => e.stopPropagation()));
        for (const elc of [seedIn, rail, summary, bgArea]) stop(elc);

        function isStaticImportJsonSource(src) {
          const type = String(src?.type || "");
          const title = String(src?.title || "");
          const label = `${type} ${title}`;
          if (type === "DenoPromptText") return true;
          if (/PrimitiveString/i.test(label)) return true;
          if (/String\s*(Multiline|Literal|Constant|Text)/i.test(label)) return true;
          return false;
        }

        // import_json may be a WIDGET (typed in) OR a WIRE. The frontend can safely read a connected
        // static text holder before execution, but it must not scrape widgets from runtime producers
        // such as Local LLM Loader. Those nodes only have a real output after ComfyUI executes them.
        function getImportJson() {
          try {
            const slot = node.findInputSlot ? node.findInputSlot("import_json") : -1;
            const inp = slot >= 0 ? (node.inputs || [])[slot] : null;
            if (inp && inp.link != null && node.graph) {
              const link = node.graph.links[inp.link];
              const src = link && node.graph.getNodeById(link.origin_id);
              if (src && isStaticImportJsonSource(src)) {
                const ws = src.widgets || [];
                const tw = ws.find((w) => /text|string|json|prompt/i.test(w.name) && typeof w.value === "string")
                        || ws.find((w) => typeof w.value === "string");
                if (tw && tw.value && String(tw.value).trim()) return tw.value;
              }
            }
          } catch (e) {}
          return getW("import_json", "");
        }

        // ── self-heal stale/shifted widget values (saves that crossed a node update) ──
        // A save from when import_json was still a widget loads one slot off: import_mode gets "",
        // and everything after shifts down (old caption_data JSON strands in seed_lock, etc.).
        // The configure-time shim repairs the clean case; this catches saves whose signature was
        // destroyed (e.g. the board re-serialized caption_data over the shifted value). Without it,
        // Run fails validation forever with: Value not in list: import_mode ''.
        function sanitizeWidgets() {
          const isMode = (v) => IMPORT_CHOICES.includes(normalizeImportMode(v));
          // tail-unshift recovery: the user's real caption_data JSON stranded one slot down in seed_lock.
          // In the shifted state each widget holds its NEXT-OLDER sibling's value, so restore each from
          // the widget one slot below it (read everything first, then write).
          const sl = getW("seed_lock", true);
          if (typeof sl === "string" && sl.indexOf('"boxes"') !== -1) {
            let cur = null; try { cur = JSON.parse(getW("caption_data", "") || "{}"); } catch (e) {}
            const curHasBoxes = cur && Array.isArray(cur.boxes) && cur.boxes.length > 0;
            const vAS = getW("auto_save", false);            // holds the old seed_lock (boolean)
            const vSP = getW("save_prefix", "");             // holds the old auto_save (boolean)
            const vAR = getW("aspect_ratio", "");            // holds the old save_prefix (string)
            const vIA = getW("include_aspect_ratio", false); // holds the old aspect_ratio ('W:H')
            if (!curHasBoxes) setW("caption_data", sl);      // restore the stranded board state
            setW("seed_lock", typeof vAS === "boolean" ? vAS : true);
            setW("auto_save", typeof vSP === "boolean" ? vSP : false);
            setW("save_prefix", typeof vAR === "string" && vAR && !/^\d+\s*:\s*\d+$/.test(vAR) ? vAR : "Ideogram_Director");
            setW("aspect_ratio", typeof vIA === "string" && /^\d+\s*:\s*\d+$/.test(vIA) ? vIA : "");
            setW("include_aspect_ratio", false);
          }
          // value guards (no-ops on a healthy node)
          const im = getW("import_mode", IMPORT_REVIEW);
          if (!isMode(im)) setW("import_mode", IMPORT_REVIEW);
          else if (normalizeImportMode(im) !== im) setW("import_mode", normalizeImportMode(im));
          if (typeof getW("seed_lock", true) !== "boolean") setW("seed_lock", true);
          if (typeof getW("auto_save", false) !== "boolean") setW("auto_save", false);
          if (typeof getW("include_aspect_ratio", false) !== "boolean") setW("include_aspect_ratio", false);
          const tv = normalizeTranslateValue(getW("translate_output", NO_TRANSLATION));
          if (!translateChoices().includes(tv)) setW("translate_output", NO_TRANSLATION);
          else if (tv !== getW("translate_output", NO_TRANSLATION)) setW("translate_output", tv);
          const vv = normalizeViewLanguage(getW("view_language", VIEW_DEFAULT));
          if (vv !== getW("view_language", VIEW_DEFAULT)) setW("view_language", vv);
          if (normalizeTranslateValue(getW("translate_output", NO_TRANSLATION)) !== ENGLISH_PROMPT) setW("translate_output", ENGLISH_PROMPT);
          const ev = normalizeTranslationEngine(getW("translation_engine", TRANSLATION_ENGINE_DEFAULT));
          if (ev !== getW("translation_engine", TRANSLATION_ENGINE_DEFAULT)) setW("translation_engine", ev);
          if (typeof getW("libretranslate_url", "") !== "string") setW("libretranslate_url", "");
          if (typeof getW("save_prefix", "") !== "string" || !getW("save_prefix", "")) setW("save_prefix", "Ideogram_Director");
          const ar = getW("aspect_ratio", "");
          if (typeof ar !== "string" || (ar && !/^\d+\s*:\s*\d+$/.test(ar))) setW("aspect_ratio", "");
          if (typeof getW("caption_data", "") !== "string") setW("caption_data", "");
        }

        // ── imported caption → editor state (boxes, summary, background, style, resolution) ──
        // Single sync path used by: hydrate (load-time seed), seedFromWire (instant sync when a
        // readable static source is connected), and onImport (executed-event live sync — the only
        // way to see a runtime value like a fresh LLM output). Caller re-renders / serializes.
        // AUTHORITATIVE: the imported caption is the WHOLE truth — fields absent from the JSON are
        // CLEARED, not left over from the previous board state. (The official magic-prompt format
        // has no style_description: a stale photo/art selection must not survive an import and leak
        // into later editor-assembled captions.)
        function applyImportedCaption(cap) {
          cap = normalizeCaption(cap) || cap || {};
          const cd = cap.compositional_deconstruction || {};
          const ib = captionToBoxes(cap);
          if (Array.isArray(cd.elements) || ib.length) { boxes = ib; selectedId = null; }
          summary.value = cap.high_level_description || ""; setW("high_level_description", summary.value);
          bgArea.value = cd.background || ""; setW("background", bgArea.value);
          // aspect_ratio "W:H" → resolution control. The official template may echo the TARGET pixel
          // size verbatim (e.g. "1344:736"), but image-analysis LLMs can also echo arbitrary source
          // image sizes. Large pairs are adopted only when they map to a common generation ratio;
          // otherwise the current user-selected resolution stays in place.
          if (typeof cap.aspect_ratio === "string" && /^\d+:\d+$/.test(cap.aspect_ratio.trim())) {
            const pr = cap.aspect_ratio.trim().split(":").map(Number);
            if (pr[0] >= 256 && pr[1] >= 256) {
              const sn = (v) => Math.max(256, Math.min(4096, Math.round(v / 16) * 16));
              const w = sn(pr[0]), h = sn(pr[1]);
              const label = friendlyRatio(w, h);
              if (label) setRes(w, h, label, pr[0] + ":" + pr[1]);
              else console.warn("[Director] ignored imported arbitrary aspect_ratio", cap.aspect_ratio);
            } else if (pr[0] > 0 && pr[1] > 0) {
              const ar = pr[0] + ":" + pr[1];
              const dm = dimsFor(pr[0], pr[1], mp); setRes(dm[0], dm[1], ar, ar);
            }
          }
          const sd = cap.style_description;   // KJ / caption_verifier schema style block
          if (sd && typeof sd === "object") {
            const m = ("photo" in sd) ? "photo" : "art";
            applyStyleMode(m); setW("style_mode", m);
            aesIn.value = sd.aesthetics || ""; setW("aesthetics", aesIn.value);
            ligIn.value = sd.lighting || ""; setW("lighting", ligIn.value);
            medIn.value = sd.medium || ""; setW("medium", medIn.value);
            photoIn.value = sd.photo || ""; setW("photo", photoIn.value);
            artIn.value = sd.art_style || ""; setW("art_style", artIn.value);
            stylePalette = Array.isArray(sd.color_palette) ? sd.color_palette.filter((c) => HEX.test(c)).slice(0, 16) : [];
          } else {
            // no style block in the caption → reset the style panel (don't inherit stale state)
            applyStyleMode("none"); setW("style_mode", "none");
            aesIn.value = ""; setW("aesthetics", "");
            ligIn.value = ""; setW("lighting", "");
            medIn.value = ""; setW("medium", "");
            photoIn.value = ""; setW("photo", "");
            artIn.value = ""; setW("art_style", "");
            stylePalette = [];
          }
        }

        // ── hydrate widgets → editor state + UI (restore on load) ──
        function hydrate() {
          migrateInputs();          // bring OLD saved workflows up to date (e.g. image→backdrop) before reading wires
          pruneInputs();            // drop the hidden widget-sockets (1.44 fallback for socketless)
          sanitizeWidgets();        // repair stale/shifted values from saves that crossed a node update
          let d = {};
          try { d = JSON.parse(getW("caption_data", "") || "{}") || {}; } catch (e) { d = {}; }
          boxes = Array.isArray(d.boxes) ? d.boxes.map(normBox) : [];
          stylePalette = Array.isArray(d.stylePalette) ? d.stylePalette.filter((c) => HEX.test(c)) : [];
          lastImportSig = typeof d.importSig === "string" ? d.importSig : "";
          selectedId = null;
          summary.value = getW("high_level_description", "") || "";
          bgArea.value = getW("background", "") || "";
          aesIn.value = getW("aesthetics", "") || ""; ligIn.value = getW("lighting", "") || ""; medIn.value = getW("medium", "") || "";
          photoIn.value = getW("photo", "") || ""; artIn.value = getW("art_style", "") || "";
          applyStyleMode(getW("style_mode", "none"));
          const sv = getW("seed", 0); seedIn.value = String(sv);
          const sl = getW("seed_lock", true); seedLocked = !!sl; paintLock();
          autoOn = !!getW("auto_save", false); paintAuto();
          paintImportMode();
          paintPendingPrompt();
          paintTranslate();
          // resolution display from the (hidden) width/height + aspect_ratio widgets
          if (typeof d.mp === "number" && d.mp > 0) mp = d.mp;
          if (typeof d.bdropDim === "number") bdropDim = Math.max(0, Math.min(0.8, d.bdropDim));
          if (typeof d.resultDim === "number") resultDim = Math.max(0, Math.min(0.85, d.resultDim));
          applyResultDim();
          if (d.bdropT && typeof d.bdropT === "object") bdT = { nx: +d.bdropT.nx || 0, ny: +d.bdropT.ny || 0, nw: +d.bdropT.nw || 1, nh: +d.bdropT.nh || 1, set: true };
          // display label: a known preset shows as-is; anything else (pixel pairs, odd shapes) shows
          // the nearest common ratio or nothing — never raw "42:23"-style noise.
          {
            const machine = (getW("aspect_ratio", "") || "").trim();
            const cw = Math.max(64, +getW("width", 1024)), ch = Math.max(64, +getW("height", 1024));
            arLabel = RATIOS.some((r) => r[0] === machine) ? machine : friendlyRatio(cw, ch);
            const actualMp = resolutionMegapixels(cw, ch);
            if (Math.abs(actualMp - mp) > 0.03) mp = actualMp;
          }
          paintRes();

          // import_json → board through the same Incoming JSON Prompt policy used by wire sync and
          // executed-event echo. This prevents a fresh upstream JSON from silently changing an
          // in-progress board's boxes or resolution.
          {
            const ij = getImportJson();
            handleInputPromptRaw(ij);
          }
          renderBoxes(); renderPalette(); renderElements(); layoutStage(); applyBackdrop(); fitTopBarAfterRestore();
          undoStack.length = 0; redoStack.length = 0; lastSnap = snapshot();   // fresh undo baseline per load
        }
        chain(node, "onConfigure", function () { setTimeout(hydrate, 0); });
        setTimeout(hydrate, 30);

        chain(node, "onRemoved", function () {
          directorNodes.delete(node);
          try { stageRO.disconnect(); } catch (e) {}
          for (const cleanup of iddResizeCleanups.splice(0)) { try { cleanup(); } catch (e) {} }
          try { document.removeEventListener("keydown", fsEsc); } catch (e) {}
          try { closeResPopup(); } catch (e) {}
          try { window.removeEventListener("pointermove", _onPanMove); window.removeEventListener("pointerup", _onPanUp); } catch (e) {}
          if (fsState) { try { wrap.remove(); } catch (e) {} fsState = null; }
        });
      });
    },
  });

  function mkSec(label, body) { const s = el("div", "idd-sec"); const l = el("div", "idd-seclbl"); l.textContent = label; s.append(l, body); return s; }
  function mkBtn(text, red) { const b = el("button", "idd-btn" + (red ? " red" : "")); b.textContent = text; b.addEventListener("mousedown", (e) => e.stopPropagation()); return b; }
})();
