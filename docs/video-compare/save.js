/* Local-only MP4 composition, using the same FFmpeg engine as Video to GIF/WebP. */
(() => {
  "use strict";
  const even = n => Math.max(2, Math.round(n / 2) * 2);

  function geometry(a, b, layout) {
    const vertical = layout === "vertical";
    const common = even(Math.min(vertical ? a.width : a.height, vertical ? b.width : b.height));
    const size = v => vertical
      ? { width: common, height: even(common * v.height / v.width) }
      : { width: even(common * v.width / v.height), height: common };
    const A = size(a), B = size(b);
    return { A, B, width: vertical ? common : A.width + B.width,
      height: vertical ? A.height + B.height : common };
  }

  function tempoFilters(rate) {
    const filters = [];
    while (rate > 2) { filters.push("atempo=2"); rate /= 2; }
    while (rate < 0.5) { filters.push("atempo=0.5"); rate *= 2; }
    filters.push(`atempo=${rate}`);
    return filters;
  }

  function plan(options) {
    const { a, b, layout, swapped, ratio, audio, fps } = options;
    if (![a, b].every(v => [v.width, v.height, v.duration].every(n => Number.isFinite(n) && n > 0)))
      throw new Error("Load two playable videos with a finite duration first.");
    if (!["horizontal", "vertical"].includes(layout) || ![24, 30, 60].includes(fps))
      throw new Error("Choose a valid layout and frame rate.");
    const g = geometry(a, b, layout), duration = a.duration;
    const scaleB = ratio ? a.duration / b.duration : 1;
    const chain = (i, size, scale) => `[${i}:v:0]setpts=${scale}*(PTS-STARTPTS),` +
      `scale=${size.width}:${size.height}:flags=lanczos,setsar=1,fps=${fps},` +
      `format=yuv420p,tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration}[v${i}]`;
    const order = swapped ? "[v1][v0]" : "[v0][v1]";
    const filters = [chain(0, g.A, 1), chain(1, g.B, scaleB),
      `${order}${layout === "vertical" ? "vstack" : "hstack"}=inputs=2[v]`].join(";");
    const args = ["-y", "-i", "/inputs/a.video", "-i", "/inputs/b.video",
      "-filter_complex", filters, "-map", "[v]"];
    if (audio === "A" || audio === "B") {
      args.push("-map", `${audio === "A" ? 0 : 1}:a:0?`, "-af",
        ["asetpts=PTS-STARTPTS", ...(audio === "B" && ratio ? tempoFilters(1 / scaleB) : []),
          "apad"].join(","), "-c:a", "aac", "-b:a", "192k");
    } else args.push("-an");
    args.push("-t", String(duration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "comparison.mp4");
    return { ...g, duration, args };
  }

  let loader;
  function loadScript() {
    if (window.FFmpegWASM) return Promise.resolve();
    if (!loader) loader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "../video-to-gif/vendor/ffmpeg.js";
      script.onload = resolve;
      script.onerror = () => { script.remove(); loader = null; reject(new Error("Cannot load the video engine. Check your connection and try again.")); };
      document.head.append(script);
    });
    return loader;
  }

  async function encode(options, fileA, fileB, signal, onProgress) {
    const job = plan(options);
    let ff, wasmURL;
    const cancelled = () => signal.throwIfAborted();
    const stop = () => { if (ff) ff.terminate(); };
    signal.addEventListener("abort", stop, { once: true });
    try {
      onProgress(null, "Preparing video engine (first use: about 30 MB)…");
      await loadScript(); cancelled();
      ff = new window.FFmpegWASM.FFmpeg();
      ff.on("progress", ({ time }) => {
        const pct = Math.max(0, Math.min(99, Math.round(time / 1e6 / job.duration * 100)));
        onProgress(pct, `Creating MP4… ${pct}%`);
      });
      const response = await fetch("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm", { signal }).catch(error => {
        if (signal.aborted) throw error;
        throw new Error("Cannot download the video engine. Check your connection and try again.");
      });
      if (!response.ok) throw new Error("Cannot download the video engine. Check your connection and try again.");
      wasmURL = URL.createObjectURL(await response.blob()); cancelled();
      await ff.load({ coreURL: new URL("../video-to-gif/vendor/ffmpeg-core.js", location.href).href, wasmURL });
      cancelled();
      // WORKERFS reads the selected files directly, without copying both into WASM memory.
      await ff.createDir("/inputs"); cancelled();
      await ff.mount("WORKERFS", { files: [new File([fileA], "a.video"), new File([fileB], "b.video")] }, "/inputs");
      cancelled(); onProgress(0, "Creating MP4… 0%");
      const result = await ff.exec(job.args);
      cancelled();
      if (result !== 0) throw new Error("Could not create this MP4. Try shorter or smaller videos, then save again.");
      onProgress(99, "Finishing MP4…");
      const data = await ff.readFile("comparison.mp4"); cancelled();
      return new Blob([data], { type: "video/mp4" });
    } finally {
      signal.removeEventListener("abort", stop);
      if (ff) ff.terminate();
      if (wasmURL) URL.revokeObjectURL(wasmURL);
    }
  }

  window.DenoCompareExport = { geometry, plan, encode };
})();
