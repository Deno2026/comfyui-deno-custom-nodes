import math
from typing import Tuple


COMMON_RATIOS = [
    "1:1",
    "4:5",
    "5:4",
    "3:4",
    "4:3",
    "2:3",
    "3:2",
    "16:9",
    "9:16",
    "16:10",
    "10:16",
    "21:9",
    "9:21",
]

DIVISIBLE_BY_VALUES = ["8", "16", "32", "64", "128"]
RESIZE_METHODS = ["Center Crop (Fill)", "Fit (Letterbox/Pillarbox)"]
PREFERRED_DIMENSIONS = [512, 720, 768, 1024, 1088, 1536, 1920]


def round_up(value: float, multiple: int) -> int:
    return int(math.ceil(max(float(value), float(multiple)) / multiple) * multiple)


def parse_ratio(ratio_preset: str) -> Tuple[int, int]:
    ratio_x, ratio_y = ratio_preset.split(":")
    return int(ratio_x), int(ratio_y)


def simplify_ratio(width: int, height: int) -> str:
    gcd = math.gcd(int(width), int(height))
    return f"{width // gcd}:{height // gcd}"


def compute_aligned_ratio_dims(ratio_preset: str, megapixels: float, divisible_by: int) -> Tuple[int, int]:
    ratio_x, ratio_y = parse_ratio(ratio_preset)
    total_pixels = max(0.01, float(megapixels)) * 1_000_000
    effective_alignment = int(divisible_by)

    base_width = math.sqrt(total_pixels * ratio_x / ratio_y)
    base_height = math.sqrt(total_pixels * ratio_y / ratio_x)

    def round_down(value: float) -> int:
        return max(effective_alignment, int(math.floor(float(value) / effective_alignment) * effective_alignment))

    width_candidates = sorted({round_up(base_width, effective_alignment), round_down(base_width)})
    height_candidates = sorted({round_up(base_height, effective_alignment), round_down(base_height)})

    candidates = set()

    for width_candidate in width_candidates:
        exact_height = width_candidate * ratio_y / ratio_x
        candidates.add((width_candidate, round_up(exact_height, effective_alignment)))
        candidates.add((width_candidate, round_down(exact_height)))

    for height_candidate in height_candidates:
        exact_width = height_candidate * ratio_x / ratio_y
        candidates.add((round_up(exact_width, effective_alignment), height_candidate))
        candidates.add((round_down(exact_width), height_candidate))

    def candidate_score(dims: Tuple[int, int]) -> Tuple[float, float, float, float]:
        width_candidate, height_candidate = dims
        area_error = abs((width_candidate * height_candidate) - total_pixels) / total_pixels
        width_error = abs(width_candidate - base_width) / base_width
        height_error = abs(height_candidate - base_height) / base_height
        ratio_error = abs((width_candidate / height_candidate) - (ratio_x / ratio_y)) / (ratio_x / ratio_y)
        preference_error = min(abs(width_candidate - preferred) for preferred in PREFERRED_DIMENSIONS) + min(
            abs(height_candidate - preferred) for preferred in PREFERRED_DIMENSIONS
        )
        return (
            width_error + height_error,
            preference_error,
            area_error,
            ratio_error,
        )

    return min(candidates, key=candidate_score)
