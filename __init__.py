import torch
import torch.nn.functional as F

class DenoResolutionSetup:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": (["Preset Ratio", "Manual Input"], {"default": "Preset Ratio"}),
                "ratio_preset": ([
                    "1:1", "4:3", "3:2", "16:9", "21:9", "9:16", "2:3", "3:4"
                ], {"default": "16:9"}),
                "alignment": ([8, 16, 32, 64, 128], {"default": 8}),
                "resize_method": (["Center Crop (Fill)", "Fit (Letterbox/Pillarbox)"], {"default": "Center Crop (Fill)"}),
                "width": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 576, "min": 64, "max": 8192, "step": 8}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("IMAGE", "width", "height")
    FUNCTION = "setup_resolution"
    CATEGORY = "Deno/Image"

    def calculate_dims(self, mode, ratio_preset, width, height, alignment):
        # 1. 기본 타겟 해상도 결정
        target_w = width
        target_h = height

        if mode == "Preset Ratio":
            # 비율 파싱 (ex: "16:9")
            rw, rh = map(int, ratio_preset.split(":"))
            # 가로 기준으로 세로 계산
            target_h = int((width * rh) / rw)

        # 2. Alignment 적용 (올림 처리: 항상 요청한 크기보다 크거나 같게)
        final_w = ((target_w + alignment - 1) // alignment) * alignment
        final_h = ((target_h + alignment - 1) // alignment) * alignment

        return final_w, final_h

    def setup_resolution(self, image, mode, ratio_preset, alignment, resize_method, width, height):
        # 해상도 계산
        tw, th = self.calculate_dims(mode, ratio_preset, width, height, alignment)
        
        # ComfyUI 이미지 텐서 형태: [B, H, W, C] -> PyTorch 처리 위해 [B, C, H, W]로 변경
        img = image.permute(0, 3, 1, 2)
        b, c, h, w = img.shape
        
        # 현재 이미지의 비율
        src_aspect = w / h
        dst_aspect = tw / th
        
        if resize_method == "Center Crop (Fill)":
            # Fill: 타겟 영역을 완전히 채우고 남는 부분을 잘라냄 (왜곡 없음)
            if src_aspect > dst_aspect:
                # 가로가 더 김 -> 세로를 맞추고 가로를 자름
                scale = tw / (w * (dst_aspect / src_aspect)) # 논리적 오류 방지를 위함
                scale = th / h
                inter_w = int(w * scale)
                inter_h = th
            else:
                # 세로가 더 김 -> 가로를 맞추고 세로를 자름
                scale = tw / w
                inter_w = tw
                inter_h = int(h * scale)
            
            # 리사이징
            img = F.interpolate(img, size=(inter_h, inter_w), mode='bilinear', align_corners=False)
            
            # Center Crop
            start_w = (inter_w - tw) // 2
            start_h = (inter_h - th) // 2
            img = img[:, :, start_h:start_h+th, start_w:start_w+tw]

        else: # Fit (Letterbox/Pillarbox)
            # Fit: 이미지 전체가 들어가게 하고 빈 공간을 검정색으로 채움
            if src_aspect > dst_aspect:
                # 가로가 더 김 -> 가로를 맞추고 세로에 패딩
                scale = tw / w
                inter_w = tw
                inter_h = int(h * scale)
            else:
                # 세로가 더 김 -> 세로를 맞추고 가로에 패딩
                scale = th / h
                inter_w = int(w * scale)
                inter_h = th
            
            img = F.interpolate(img, size=(inter_h, inter_w), mode='bilinear', align_corners=False)
            
            # Padding (검정색 채우기)
            pad_w = tw - inter_w
            pad_h = th - inter_h
            # F.pad: (left, right, top, bottom)
            img = F.pad(img, (pad_w//2, pad_w - pad_w//2, pad_h//2, pad_h - pad_h//2), mode='constant', value=0)

        # 다시 [B, H, W, C]로 변환
        out = img.permute(0, 2, 3, 1)
        
        return (out, tw, th)

NODE_CLASS_MAPPINGS = {
    "DenoResolutionSetup": DenoResolutionSetup
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DenoResolutionSetup": "Resolution Setup Helper (Deno)"
}
