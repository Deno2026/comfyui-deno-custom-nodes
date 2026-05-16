from nodes import PreviewImage


COMPARE_MODES = ["Slider", "Side by Side", "Difference", "Toggle"]
TOGGLE_CHOICES = ["A", "B"]


def _frame_batch(video):
    if video is None or len(video) <= 0:
        return None
    return video.float().clamp(0.0, 1.0)


def _normalize_mode(mode: str) -> str:
    return mode if mode in COMPARE_MODES else "Slider"


def _normalize_toggle(value: str) -> str:
    return value if value in TOGGLE_CHOICES else "B"


def _normalize_split(value) -> float:
    try:
        return max(0.02, min(0.98, float(value)))
    except (TypeError, ValueError):
        return 0.5


def _normalize_fps(value) -> float:
    try:
        return max(1.0, min(240.0, float(value)))
    except (TypeError, ValueError):
        return 24.0


def _normalize_bool(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _video_size(video):
    if video is None or len(video) <= 0:
        return 0, 0, 0
    return int(video.shape[2]), int(video.shape[1]), int(video.shape[0])


class DenoVideoCompare(PreviewImage):
    DESCRIPTION = (
        "DENO A/B video comparison node with synced playback, Slider, Side by Side, "
        "Difference, Toggle, Swap, and a shared timeline so upscale and FPS-interpolation "
        "results stay the same length while frame-rate differences show as smoothness."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (COMPARE_MODES, {"default": "Slider"}),
                "split_position": ("FLOAT", {"default": 0.5, "min": 0.02, "max": 0.98, "step": 0.01}),
                "toggle_image": (TOGGLE_CHOICES, {"default": "B"}),
                "swap": ("BOOLEAN", {"default": False}),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 0.01}),
            },
            "optional": {
                "video_a": ("IMAGE",),
                "video_b": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "compare_videos"
    CATEGORY = "Deno/Image"
    OUTPUT_NODE = True

    def _preview_ui(self, video, filename_prefix: str, prompt=None, extra_pnginfo=None):
        if video is None or len(video) <= 0:
            return []
        return self.save_images(video, filename_prefix, prompt, extra_pnginfo)["ui"]["images"]

    def compare_videos(
        self,
        mode: str,
        split_position: float,
        toggle_image: str,
        swap: bool,
        fps: float,
        video_a=None,
        video_b=None,
        prompt=None,
        extra_pnginfo=None,
    ):
        mode = _normalize_mode(mode)
        split_position = _normalize_split(split_position)
        toggle_image = _normalize_toggle(toggle_image)
        swap = _normalize_bool(swap)
        fps = _normalize_fps(fps)

        source_a = _frame_batch(video_a)
        source_b = _frame_batch(video_b)
        width_a, height_a, count_a = _video_size(source_a)
        width_b, height_b, count_b = _video_size(source_b)

        ui = {
            "a_frames": self._preview_ui(source_a, "deno.vcompare.a.", prompt, extra_pnginfo),
            "b_frames": self._preview_ui(source_b, "deno.vcompare.b.", prompt, extra_pnginfo),
            "compare_meta": [{
                "mode": mode,
                "split_position": split_position,
                "toggle_image": toggle_image,
                "swap": swap,
                "fps": fps,
                "a_width": width_a,
                "a_height": height_a,
                "a_count": count_a,
                "b_width": width_b,
                "b_height": height_b,
                "b_count": count_b,
            }],
        }
        return {"ui": ui}
