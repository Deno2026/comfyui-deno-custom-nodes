# (Deno) Audio Analysis Finalizer

Place this node immediately after the core Gemma 4 `Text Generate` audio-analysis node. It does not analyze `AUDIO` or run Gemma by itself; it sanitizes completed Text Generate output and manages the same connected CLIP model.

```text
Gemma 4 CLIP -> Text Generate -> analysis
       |                         |
       +-------------------------+-> Audio Analysis Finalizer
```

Connect the same Gemma 4 `CLIP` value to `clip`, and connect `generated_text` to `analysis`. The output contains only these fields in a stable order:

- `AUDIO_CLASS`
- `VOCAL_PRESENCE`
- `MAJOR_SOUND_SOURCES`
- `ENERGY_AND_RHYTHM`
- `TIMED_ACOUSTIC_EVENTS`
- `PERFORMANCE_CUES`
- `UNCERTAINTIES`

Reasoning before the last `</think>` marker and unrelated text outside these fields are removed. An unfinished `<think>` block or a response with no usable supported field stops with a clear error instead of silently passing bad analysis downstream.

The default `Unload after run` releases only the connected Gemma audio-analysis `clip.patcher` and clears its cache. It does not unload unrelated ComfyUI models. Targeted unload requires ComfyUI 0.23.0 or newer; the MiniMax H3 beginner path already requires a newer ComfyUI build. Use `Keep loaded` only when repeated analysis speed is more important than freeing VRAM.
