# (Deno) Easy Model Download Helper

내장 LTX 프리셋에 필요한 모델 파일을 확인하고 공식 다운로드 페이지를 엽니다. 모델 파일을 자동으로 다운로드하거나 작성하지 않습니다.

내장 프리셋은 기존 LTX 2.3 8GB VRAM GGUF 워크플로우와 공식 LTX 2.5 Distilled INT8 2단계 워크플로우를 지원합니다. 워크플로우나 브라우저에 저장한 사용자 프리셋은 내장 프리셋과 함께 그대로 유지됩니다.

## LTX 2.5 접근 권한

LTX 2.5 링크를 사용하기 전에 다음 절차를 진행하세요.

1. Hugging Face에 로그인합니다.
2. [Lightricks/LTX-2.5 모델 페이지](https://huggingface.co/Lightricks/LTX-2.5)를 엽니다.
3. **Agree and Access**를 완료합니다.
4. [LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md)를 확인합니다.

LTX 2.5 프리셋에는 distilled INT8 transformer, projection이 포함된 Gemma 4 text encoder, video VAE, audio VAE, x2 latent spatial upscaler가 들어 있습니다. 계정 접근 절차가 사용자에게 보이도록 각 Hugging Face 파일 링크를 브라우저로 엽니다.

## 입력값

| 이름 | 설명 |
| --- | --- |
| model_root | 확인할 ComfyUI models 루트입니다. 등록된 모델 루트 중 필요한 파일이 가장 많이 있는 위치를 패널이 자동 선택할 수 있습니다. |
| presets_json | 저장된 프리셋 목록입니다. 내장 프리셋은 최신 상태로 갱신하며 사용자 정의 프리셋과 알 수 없는 프리셋 ID는 보존합니다. |

## 사용법

프리셋을 선택하고 누락 파일의 링크를 연 다음, 다운로드한 파일을 노드에 표시된 정확한 대상 폴더로 옮기세요. 파일 배치 후 **Refresh Check**를 누릅니다.
