# (Deno) Ideogram Director — 디자인 DNA (Claude 작성 · 참고 레퍼런스)

> **이 문서의 성격.** 사용자가 완성도·디자인(색·컨셉 포함)을 특히 만족한 노드의 "왜 좋은가"를
> 코드에서 검증해 뽑은 **재사용 가능한 레퍼런스**다. `docs/DENO_NODE_VISUAL_IDENTITY.md`의
> *구체 사례편*이자, `docs/CLAUDE_NODE_FRONTEND_GUIDE.md`의 "이렇게 하면 된다"의 *실물 증거*다.
> 새 대표 노드를 만들 때 여기서 토큰과 원칙을 그대로 들어 쓰는 것을 전제로 한다.

> **출처/검증.** 모든 색·토큰·치수·코드 인용은 `web/js/deno_ideogram_director.js`(frontend rev
> `IDD_REV = "r2026.06.13-p"`, L1199)와 `deno_ideogram_director.py`의 **정적 read**로 확인했고,
> 색·타이포·컴포넌트·인터랙션을 각각 독립 추출해 같은 줄에서 교차검증했다. 다만 DeON canon상
> frontend "완료"는 실제 캔버스 렌더 확인이 기준이며, 이 문서는 코드 기준이다(실기기 동작은
> 사용자 확인 대상). 작성된 디자인 결정의 사용자 합의 근거는 기억 파일
> `ideogram-director-ux-decisions.md` / `ideogram4-official-caption-contract.md`.

---

## 0. 한 줄 정체성

**Ideogram 4의 구조화 JSON 캡션을, 손으로 그리는 보드로 바꾼 "비주얼 캡션 스튜디오".**
JSON을 타이핑하는 대신 박스를 그리고 → 편집 → **Regenerate**를 제자리에서 도는 닫힌 루프 노드.

---

## 1. 컨셉 — 무엇이며 왜 존재하나

- **닫힌 edit→Regenerate 루프.** 상류 Local LLM이 보드를 1회 seed(`import_json`) → 사용자가
  박스·설명·스타일을 보드에서 편집 → 제자리 Regenerate. 결과 이미지는 ComfyUI의 표준
  `executed` 이벤트로 **read-only**로 받아 보드에 깔아준다.
  - 코드(verbatim): *"the prompt is wired FORWARD into CLIPTextEncode, so the Director never emits
    an image of its own. We read ComfyUI's standard `executed` event (READ-ONLY) and paint the most
    recent image-bearing result … onto every Director board. Failure-isolated: if this misses,
    generation is unaffected — the board just won't update."* (`deno_ideogram_director.js:15-19`)
  - → **루프는 graph cycle이 아니라 temporal**이고, **실패 격리**돼 있어 헬퍼가 생성을 절대 못 깨뜨린다.
- **출력 캡션 계약.** 공식 `caption_verifier`(KJ/모델 validator) 형식으로, 항상 **single-line
  minified**. `aspect_ratio`는 기본 off(렌더러는 latent의 width/height에서 모양을 가져오므로
  캡션에 불필요).
  - verbatim: *"Output is SINGLE-LINE MINIFIED — minification measurably lowers the model's
    safety-block rate (A/B: 1/6 minified vs 4/6 pretty-printed)."* (`deno_ideogram_director.py:266`)
  - → **결정은 추측이 아니라 A/B 측정 기반.** minify가 실제 안전필터 레버.
- **테스트 가능한 코어 + 깔끔한 좌변.** JSON 조립은 순수 함수(ComfyUI import 없음)로 분리해
  헤드리스 단위테스트 가능; ComfyUI 결합부(save route)는 try/except 뒤에. UI 위젯은 전부
  `socketless:True`로 소켓을 안 만들어 좌변을 깨끗이 둠(아래 §6-9).

---

## 2. 비주얼 정체성 — "Verdant Pro" (사용자가 좋아한 그 색·컨셉)

**핵심 철학(verbatim 주석, `:456`, `:461-462`):**
> *"Verdant Pro — DENO green-on-dark, grown up … `--gfaint` (every idle border in the old theme)
> goes NEUTRAL: green is reserved for interactive / selected states only."*

= **색은 장식이 아니라 신호다.** 쉬는 상태(idle)의 테두리는 전부 **중립 회색**, 초록은 오직
hover/focus/selected/active에만 쓴다. 이 한 줄이 노드 전체의 상태 색을 지배한다.

**두 겹 테마 구조.** base neon green 시트 위에 **Verdant Pro 스킨이 `!important`로 덮인다**(L455~784).
런타임 실제 외형 = Verdant Pro. base(neon `#48ff84`)는 폴백/구조용으로만 남아 있다.

### 색 토큰 (Verdant Pro — exact, 그대로 복사용)

| 역할 | 토큰/값 | 비고 |
|---|---|---|
| 주 초록 (interactive/selected ONLY) | `--g #42bd7f` | active 텍스트·dot·selected ring·focus |
| 보조 초록 (hover/focus 테두리) | `--gdim rgba(66,189,127,.45)` | |
| **idle 테두리 (중립 회색!)** | `--gfaint rgba(173,191,181,.14)` | 초록 아님 — 핵심 |
| 외곽 패널 hairline | `rgba(255,255,255,.07~.10)` | white-alpha 계열 |
| 패널 배경 (wrap) | `#121614` | warm near-black charcoal |
| 상/하 바 | `#171c19` · 칩 `#1a201c` · rail `#141917` | |
| 보드(stage) | `#080b0a` + inset `rgba(66,189,127,.22)` hairline frame | 움푹한 "well" |
| 팝오버/모달 | `#181e1b`, border `rgba(255,255,255,.10)` | |
| 입력 inset(가장 깊은 검정) | `#0c100e` | seed/textarea/fields |
| 텍스트 사다리 | title `#e4e8e5` / `--txt #d3d8d4` / 편집중 `#ced5d0` / `--acc #aeb8b1` / `--dim #7c867f` | 중립 회색 계열 |
| 파괴적(destructive) | `--red rgba(190,84,84,.85)`, armed `#a03326`/`#c64a3a` + 흰 글자 | |
| **따뜻한 카운터-액센트 (amber)** | `#e8b45a` (글자 `#1a1205`) | **RANDOM seed** + text-type 영역 표시 |
| **시그니처 CTA 그라디언트** | `linear-gradient(180deg,#46c281,#35a86b)` 글자 `#0b1410` | Regen·Save·Apply 전부 동일 |
| filled-green 위 글자 (관례) | `#0b1410` (legacy `#041208`) | 초록 버튼/태그엔 거의-검정 글자 |
| 보드 박스 자동 색환 (8색) | `AUTO_COLORS = ["#4ECB8D","#5AA7E8","#E8B45A","#C97FE0","#E8705A","#58D5C9","#A0D060","#E060A0"]` (`:2351`) | 박스 index별 1색 → 그 박스의 테두리·태그·ring·핸들 **그리고 rail 행**이 같은 `--bc` 색 |

**깊이의 원천:** 네온 글로우가 아니라 **테두리 + 미묘한 대비 + 부드러운 검정 그림자**
(팝오버 `0 12px 32px rgba(0,0,0,.55)`, 모달 `0 16px 48px rgba(0,0,0,.6)`). 보드는 일부러
**움푹 들어간 어두운 well**에 얇은 emerald 안쪽 테두리를 둘러 "무대"로 읽히게 한다(verbatim
`:519` *"a clearly darker well with a hairline emerald frame"*). 박스는 어떤 이미지 위에서도
읽히게 **색선 + 검정 대비 ring + 글자 그림자**(`:531` *"legible on bright AND dark"*).

---

## 3. 타이포 · 형태 · 간격 · 레이아웃 골격

**폰트(Windows-native, 웹폰트 로드 없음):**
- 본문 `12px/1.45 "Segoe UI Variable Text","Segoe UI"`
- 타이틀/디스플레이 `12.5px / weight 600 "Segoe UI Variable Display"`
- **숫자/코드 readout 전부 모노** `"Cascadia Code","Consolas"` — seed, 비율, 박스 태그, HEX/RGB
- `i` 배지만 `Georgia` serif
- 마이크로카피: 섹션 라벨 `bold 10px uppercase letter-spacing:1px`

**라운드 스케일:** wrap `8px` · 입력/버튼 `6–8px` · 카드/팝오버 `7–10px` · 모달 `12px` ·
보드 박스/핸들 `2–3px` · 1차 버튼·하단 바 버튼 **full-pill `999px`** · 원형 `50%`.

**간격:** 상/하 바 `padding 7px 10px` · rail `padding 9px / gap 11px` · 섹션 내부 `gap 5px` ·
모달 `padding 15px 17px / gap 12px`. 작업 묶음 사이 `.idd-vsep`(1px×18px) 구분선.

**레이아웃 골격(`wrap.append(top, body, bot)`, 수직 flex):**
```
┌ .idd-top  (status dot · title · Layout Presets · ↦spacer · resolution · seed · Generate) ┐
│ .idd-body : .idd-board (flex 1, aspect-correct stage) │ .idd-rail (248px, 0으로 collapse) │ edge tab │
└ .idd-bot  ([Save · Auto-save] | [Copy · Paste JSON] ↦spacer [Clear Board]) ┘
```
**노드 크기:** `addDOMWidget("idd_board", getMinHeight:()=>510)` 뒤
`setSize([Math.max(840,w), Math.max(660,h)])` — **최소만 강제, 사용자가 키운 크기는 보존**
(다른 위젯은 전부 `computeSize→[0,-4]`로 숨겨 이 보드 패널이 노드 몸체를 독점). rail은 use-frequency
순서 **Summary → Background → Elements → Style**.

---

## 4. 컴포넌트 사전 (표면)

> 보드는 `<canvas>`가 **아니다** — CSS로 배치된 `<div>` well이고, 박스·핸들·라벨 전부 DOM div.
> (유일한 canvas 사용은 "My preset" 썸네일 굽는 `captureGalleryThumb`.)

- **Stage(보드):** `layoutStage()`가 결과 이미지와 박스 오버레이를 **정확한 출력 비율**로
  letterbox/center. 40px 정렬 그리드. 빈 상태는 *"Drag on the board to draw a region / then press
  Generate"* 안내(데드엔드 방지·첫 행동 교육).
- **bbox 영역 에디터:** 드래그로 그리기, 8핸들 리사이즈, 더블클릭=요소 에디터. 박스마다 자동
  색(`--bc`), 번호 태그, 글자-그림자 라벨. 핸들 9px 보이지만 hit-area ~25px.
- **Reference backdrop 서브시스템:** 옵션 `backdrop` 이미지를 박스 **아래**에 깔아 트레이싱 —
  *"NEVER enters the caption JSON, zero effect on generation"*. 어둡게(가독성) 슬라이더 + 📐 Adjust.
- **Result dimmer:** 결과 이미지를 화면에서만 톤다운(저장본은 불변).
- **Top 바:** status dot, 타이틀(hover=rev), **Layout Presets** 런처, resolution(비율×메가픽셀
  팝오버 + 라이브 프리뷰 사각형 + 비율별 size flyout), **seed pill** `[Seed|n|🔒 Fixed|🎲 Random]`,
  **Generate/Regenerate**(터미널 top-right, 가장 큰 컨트롤, 결과 후 라벨 전환).
- **Rail:** Summary/Background 텍스트영역(min-height 96px로 Elements를 fold 위에), Style
  segmented(None/Photo/Art)+필드, 팔레트 픽커, **Elements 리스트**(박스 미러, 드래그 재정렬,
  dup/del, 보드 박스와 cross-highlight).
- **커스텀 HSV 색 픽커 팝오버:** OS 다이얼로그 없이 한 패널(SV+hue+HEX/RGB/HSL+Save) — 색을 고르는
  모든 곳에서 동일. *"pick first, Save commits."*
- **풀스크린 갤러리(Style/Layout):** `document.body`에 마운트(조상 transform clip 회피), 3-zone
  헤더(title·중앙 탭·count+Save+Close), 칩+검색+스크롤. **정직한 미리보기**: style=실제 생성
  썸네일, layout=와이어프레임.
- **요소 에디터 모달**(dblclick), **Paste-JSON 다이얼로그**(클립보드 직접 읽기 대신 안정적 입력란).
- **하단 바:** job별 그룹 + 구분선, 파괴적 **Clear Board**는 멀리 격리 + 2단계 확인.

---

## 5. 인터랙션 철학 (느낌) — verbatim 주석이 곧 철학

이 노드가 "좋게 느껴지는" 이유는 대부분 여기에 있다. 코드 주석이 의도를 직접 말한다.

**A. 캔버스가 1순위(노드는 손님).**
> *"Canvas passthrough — RULE: wheel-zoom and middle-click-pan belong to the ComfyUI canvas, FIRST
> CLASS, over EVERY part of this node … Capture phase on the whole wrap beats every inner
> stopPropagation, so no area can swallow them."* (`:1539-1541`)

유일한 예외는 갤러리 스크롤 영역(*"a deliberate local scroll area"* `:1545`). pan은 합성
이벤트로 안 되니 `ds.offset`을 직접 민다. 중클릭은 픽커를 **닫지 않는다**(`:2245`).

**B. DOM 정체성 보존 — 실기기에서만 잡힌 버그.** (← `CLAUDE_NODE_FRONTEND_GUIDE` L3의 산 증거)
> *"Update only the .sel class on the existing box divs — do NOT recreate them. Recreating divs on
> every click breaks native dblclick … which is exactly the double-click-to-edit-caption path.
> (Surfaced on the real canvas; headless missed it by dispatching a synthetic dblclick.)"* (`:2398-2401`)

→ 선택은 기존 노드를 **변형**할 뿐 재생성하지 않는다. 클릭/드래그 구분용 jitter guard(`w<0.02`).

**C. 제스처 문법(디자인 툴 관례).** Ctrl+drag=복제(원본 유지, `:2409`), Shift=한 축 잠금(더 많이
움직인 축, `:2442`), B=박스 eye-toggle, 화살표/Tab 키보드, dblclick=편집. 이동은 **양쪽 모서리**를
stage에 clamp(박스가 실제 이미지 밖으로 못 나가게, `:2438`).

**D. Undo 소유권(사용자 멘탈모델과 일치).**
> *"Ctrl+Z OWNERSHIP: while you're working ANYWHERE inside this node, undo/redo means the BOARD's
> history — never ComfyUI's graph undo (that one … reads as 'the node reset itself') … a CAPTURE-phase
> key handler claims Ctrl+Z … Inside text fields the event is still fenced off from ComfyUI, but the
> browser's native TEXT undo is left alone."* (`:2548-2555`)

Delete/Backspace는 보드 포커스 중 삼켜서 **박스**만 지운다(전역 단축키가 노드를 통째로 지우는
데드엔드 차단, `:2584`). 드래그 burst = pointerup의 단일 serialize = **한 undo 스텝**(`:1161`).

**E. 라이브 싱크 계약(누가 권위인가).**
> *"a wired caption wins when the editor is empty, when import_mode is 'always', or when the wired
> JSON CHANGED … The editor wins only while the wired JSON is the same one it was seeded from — so
> user edits survive re-runs, but a new upstream (LLM) result takes over."* (`deno_ideogram_director.py:232`)

import는 **권위적 full-replace**(JSON에 없는 필드는 비움, 묵은 값 오염 차단, `:2825`). static
상류는 연결 즉시 싱크, runtime(LLM) 값은 백엔드가 `executed`에 `ui.idd_import`로 echo해야만
프론트가 봄(`:24`).

**F. 단계적 커밋 + 정직한 피드백.** resolution 팝오버 *"Nothing changes until Apply."* 프리뷰는
*"size-honest … a bigger megapixel budget visibly grows the rectangle"*(`:1436`) — 큰 이미지는
실제로 더 크게 보인다(거짓 auto-fit 금지).

**G. 상태는 모호하지 않게.** seed는 단일 lock 아이콘(*"is it locked, or does clicking lock it?"*)
대신 **채워진 세그먼트** `[🔒 Fixed | 🎲 Random]`. 토글은 흐려지기만 하는 게 아니라 **채움+사선**.

**H. 데드엔드 없음 / 절대 brick 안 함.** LLM 출력 ```json 펜스/잡담 관대 파싱, 묵은
`import_mode`는 거부 말고 `"when empty"`로 coerce(옛 저장본 안 깨짐), raw `"42:23"` 같은 노이즈는
안 보여줌.

---

## 6. 관통하는 설계 원칙 (이게 재사용할 DNA)

1. **ComfyUI-native first, 그 위에 쓸모 있는 DENO 패널 하나** — 호스트 캔버스 제스처는 항상 우선.
2. **색은 신호다** — 초록은 interactive/selected에만, idle은 중립 회색.
3. **정확한 기계값 vs 친절한 표시값을 분리** — 위젯엔 정확값, 화면엔 읽기 좋은 값(표시 문자열은
   캡션에 안 들어감).
4. **빈도가 레이아웃을 정한다** — 1차 액션은 터미널+최대+자기-라벨(Generate→Regenerate), rail은
   빈도순, 잘 안 쓰는 컨트롤은 코너에서 치움.
5. **직교 축, 위계 아님** — Layout(구성) × Style(룩)은 자유 조합(N×M), 번들링하면 조합을 잃고
   사용자 선택을 덮어씀. 미리보기는 정직하게(style=실물, layout=와이어).
6. **즉각적·정직한 피드백** — 라이브 프리뷰, size-honest, 단계적 Apply.
7. **데드엔드 없음 / 절대 brick 금지** — 관대 파싱, 묵은 값 coerce, 옛 저장본 자동 마이그레이션,
   파괴적 액션 2단계 확인.
8. **DOM 정체성 + 제스처 충실도** — 재생성 말고 변형, 제스처는 캔버스로 포워드, undo 범위는
   사용자가 편집 중인 그것.
9. **백엔드 래퍼가 아니라 인간 도구** — `socketless`로 좌변 깨끗, 내부 enum 모양을 그대로
   노출하지 않음, 마케팅 카드 아닌 **실전 생산 도구**의 절제.
10. **테스트 가능한 코어 + 실패 격리** — 순수 함수 분리, read-only loopback(헬퍼가 생성을 못 깨뜨림).

---

## 7. 재사용 메모

- 위 Verdant Pro 토큰표와 원칙 10개는 `DENO_NODE_VISUAL_IDENTITY.md`의 **구체 인스턴스**다.
  새 대표(flagship) 노드를 만들 때 이 토큰 + 원칙을 그대로 들어 쓰면 계보가 유지된다.
- 같은 idiom(hide/move/configure-migration/wheel-forward/computeSize-clamp)은
  `CLAUDE_NODE_FRONTEND_GUIDE.md` §4 표에 본보기 위치가 정리돼 있다 — Director가 그 표의 단골 출처.
- **정직 메모:** 이 문서는 정적 read 기준이다. 실제 캔버스에서의 동작·F5 생존은 DeON canon상
  사용자 확인 대상(과거 이 노드도 연결 브라우저가 127.0.0.1:8188을 못 띄워 click-through QA가
  막힌 이력이 있음). frontend rev 스탬프 `IDD_REV = "r2026.06.13-p"`.
