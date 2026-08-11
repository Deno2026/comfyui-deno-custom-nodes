# (Deno) Audio Transcript

ComfyUI `AUDIO` 하나를 OpenAI Whisper로 로컬 전사합니다. 프롬프트 연출용 구조화 전사 자료, 최종 적용할 대사·가사 텍스트, 원본 그대로의 `AUDIO`를 함께 출력합니다.

## 권장 설정

- `model`: 가사와 어려운 음성의 정확도를 우선하면 `large-v3`, 속도를 우선하면 기본 `large-v3-turbo`
- `language`: `auto` 또는 확실한 언어 선택
- `model_after_run`: `Unload after run`
- `manual_transcript` 선택 소켓: 사용자가 직접 입력한 정확한 가사·대사

선택한 모델을 처음 사용할 때 공식 체크포인트를 `ComfyUI/models/stt/whisper`에 자동 다운로드합니다. `large-v3` 파일은 약 2.9GB이고 실행 중 VRAM은 약 10GB, 기본 `large-v3-turbo`는 약 1.5GB와 6GB가 필요합니다. 다운로드 파일의 체크섬 검증은 공식 Whisper 로더가 수행합니다.

## Smart Swap

CUDA 전사 전에 ComfyUI가 관리하는 모델을 먼저 내리고 캐시를 비워 Whisper가 Gemma나 생성 모델과 겹쳐 올라가지 않게 합니다. 기본 `Unload after run`에서는 전사 완료 또는 오류 후 Whisper도 해제합니다.

`Keep loaded`는 반복 실행을 위한 고VRAM 고급 옵션입니다. 이 옵션에서도 CUDA 전사 전 ComfyUI 관리 모델 해제는 수행됩니다.

원본 오디오는 자르거나 바꾸지 않습니다. 분석용 복사본만 모노로 합치고 16kHz로 리샘플합니다.

## 정확한 가사·대사 직접 입력

정확한 문구를 알고 있다면 텍스트 노드를 `manual_transcript`에 연결하세요. 연결하지 않거나 비워두면 기존처럼 Whisper 결과를 사용합니다.

내용이 있으면 사용자가 입력한 문구가 최종 가사·대사의 기준이 되고, `transcript` 출력도 그 문구를 그대로 반환합니다. 다만 Whisper는 계속 실행해서 감지 언어, 신뢰도, 구간 시작·종료 시간을 대략적인 타이밍 참고 자료로 남깁니다. 구조화 문맥에서는 수동 문구와 자동 Whisper 결과를 서로 다른 데이터 블록으로 명확히 구분합니다.

이 기능은 단어 단위 강제 정렬이 아닙니다. 사용자가 시간을 직접 적지 않았다면 Whisper 구간 시간은 대략적인 기준일 뿐입니다. 선택한 오디오 구간에서 실제로 들리는 가사·대사만 입력하세요.

초보용 오디오 분석 체인에서는 원본 그대로의 `audio` 출력을 Gemma 4 E4B Text Generate에 연결하세요. 그러면 Whisper가 먼저 Smart Swap과 전사를 마친 뒤 Gemma가 로드되는 실제 실행 의존성이 생기며, 마지막에 Audio Analysis Finalizer가 Gemma를 해제합니다.
