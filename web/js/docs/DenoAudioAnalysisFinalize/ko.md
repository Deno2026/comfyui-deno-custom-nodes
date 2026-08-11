# (Deno) Audio Analysis Finalizer

ComfyUI 순정 Gemma 4 `Text Generate` 오디오 분석 노드 바로 뒤에 연결합니다. 이 노드 자체가 `AUDIO`를 분석하거나 Gemma를 실행하는 것은 아닙니다. Text Generate가 끝낸 문자열을 정리하고 동일하게 연결된 CLIP 모델을 관리합니다.

```text
Gemma 4 CLIP -> Text Generate -> analysis
       |                         |
       +-------------------------+-> Audio Analysis Finalizer
```

Text Generate에 사용한 동일한 Gemma 4 `CLIP`을 `clip`에 연결하고, `generated_text`를 `analysis`에 연결하세요. 출력은 아래 7개 필드만 고정 순서로 남깁니다.

- `AUDIO_CLASS`
- `VOCAL_PRESENCE`
- `MAJOR_SOUND_SOURCES`
- `ENERGY_AND_RHYTHM`
- `TIMED_ACOUSTIC_EVENTS`
- `PERFORMANCE_CUES`
- `UNCERTAINTIES`

마지막 `</think>` 이전의 생각 과정과 필드 밖의 불필요한 문구는 제거합니다. `<think>`가 닫히지 않았거나 쓸 수 있는 지원 필드가 하나도 없으면 잘못된 분석을 조용히 넘기지 않고 명확한 오류로 중단합니다.

기본 `Unload after run`은 연결된 Gemma 음향 분석 `clip.patcher`만 해제하고 캐시를 비웁니다. 다른 ComfyUI 모델은 내리지 않습니다. 이 선택 해제 기능은 ComfyUI 0.23.0 이상이 필요하며 MiniMax H3 초보용 경로는 이미 그보다 최신 ComfyUI를 요구합니다. 반복 분석 속도가 VRAM 회수보다 중요할 때만 `Keep loaded`를 사용하세요.
