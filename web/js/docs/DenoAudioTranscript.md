# (Deno) Audio Transcript

Transcribes one ComfyUI `AUDIO` value locally with OpenAI Whisper. It returns structured transcript context, the effective transcript, and the original `AUDIO` unchanged.

## Recommended settings

- `model`: `large-v3` for quality-first lyric and difficult-speech transcription; `large-v3-turbo` for the faster default
- `language`: `auto`, or choose the known language
- `model_after_run`: `Unload after run`
- `manual_transcript` (optional socket): exact lyrics or dialogue supplied by the user

The first use of a model downloads its official checkpoint into `ComfyUI/models/stt/whisper`. `large-v3` is about 2.9 GB and uses roughly 10 GB of VRAM while running; the default `large-v3-turbo` is about 1.5 GB and uses roughly 6 GB. The official Whisper loader verifies the downloaded checkpoint checksum.

## Smart Swap

Before CUDA transcription, the node unloads ComfyUI-managed models and clears their cache so Whisper does not overlap with Gemma or generation models. With the default `Unload after run`, Whisper is also released after transcription or after an error.

`Keep loaded` reuses Whisper on repeated runs but is intended for advanced, high-VRAM workflows. ComfyUI-managed models are still unloaded before each CUDA transcription.

The node never trims or rewrites the source audio. It downmixes mono/stereo input to mono and resamples a temporary analysis copy to 16 kHz.

## Optional exact lyrics or dialogue

Connect a text node to `manual_transcript` when you already know the exact words. Leave it disconnected or blank to use Whisper normally.

When non-empty, the user text becomes the authoritative wording and the plain `transcript` output returns that exact text. Whisper still runs so its detected language, confidence, and segment start/end times remain available as approximate timing evidence. The structured context keeps the user wording and automatic Whisper result in separate, clearly labeled data blocks.

This is not forced word alignment. Without user-supplied timestamps, Whisper segment times are only approximate anchors. Enter only lyrics or dialogue that can actually be heard in the selected audio segment.

For the beginner audio-analysis chain, connect the unchanged `audio` output to Gemma 4 E4B Text Generate. This creates a real execution dependency: Whisper performs the preflight swap and finishes first, then Gemma loads, and the Audio Analysis Finalizer releases Gemma afterward.
