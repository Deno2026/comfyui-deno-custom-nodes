# DENO 노드 Frontend 제작 가이드 (Claude 작성 · 병합용 참고 문서)

> **이 문서의 성격.** Claude가 작성한 **독립 참고 문서**다. 아직 어떤 권위 문서에도
> 병합되지 않았다. 나중에 사용자가 Codex에게 "이 문서를 읽고 병합하라"고 지시하면,
> Codex가 아래 §6의 병합 지도를 따라 기존 canon에 흡수시키는 것을 전제로 쓴다.
> 그때까지 이 파일은 **권위가 아니라 제안**이다. 충돌 시 `.codex\AGENTS.md`,
> 레포 `AGENTS.md`, `docs/DENO_NODE_RETROSPECTIVE.md`,
> `C:\Users\aions\Documents\Codex\DESIGN_UX_PLAYBOOK.md`가 우선한다.

> **무엇을 메우는 문서인가.** 이 PC의 노드 제작 규칙(Codex authority + DESIGN_UX_PLAYBOOK)은
> 이미 강하다 — "코드만 보고 완료 선언 금지, 실제 canvas로 검증" 사다리가 명문화돼 있다.
> 빠진 것은 **두 가지뿐**이다:
> 1. **코드 레벨 layout 불변식**(§1) — "겹침/삐져나옴이 코드에서 어떻게 생기는가"를
>    함수 단위로 못 박은 법전. 지금은 RETROSPECTIVE §5와 전역 CLAUDE.md, 그리고 잘 만든
>    노드들의 코드에 흩어져 있다.
> 2. **Geometry 검증 셀**(§2) — 실제 canvas 검수에서 "글자가 칸을 넘치나/위젯이 겹치나"를
>    **눈으로 볼 구체적 항목**. DESIGN_UX_PLAYBOOK §1.D-4가 "시각 검수"를 요구하지만,
>    노드 문서의 실제 검증 기록은 버튼 라벨 전환 + 콘솔 에러 0개만 찍혀 있어서 layout
>    회귀가 그 게이트를 그냥 통과한다.

이 문서는 그 두 구멍을 메우는 것이 전부다. 새 규칙을 늘리는 게 아니라, 이미 잘 도는
본보기 코드를 한곳에 모으고, 검수 체크리스트에 빠진 칸을 채운다.

---

## 0. 한 줄 원칙 (frontend 한정)

**값 하나에 위젯 하나. serialized 순서는 절대 안 바꾼다(숨길 뿐). 노드는 자기 크기를
자기가 매 프레임 다시 재지 않는다. wheel/휠클릭은 캔버스 것이다. 그리고 — 이 네 가지가
실제 canvas에서 어긋나지 않는지 눈으로 보기 전엔 완료가 아니다.**

---

## 1. Frontend Layout Law (코드 레벨 불변식)

각 항목: **규칙 → 왜 → 본보기(파일·함수) → 최소 코드 → 안티패턴.**
본보기는 이 레포에서 *실제로 잘 도는* 코드다. 재발명하지 말고 이걸 복사한다.

### L1. 값 하나엔 위젯 하나 — 숨긴 serialized widget 위에 같은 값의 box를 또 그리지 마라

**규칙.** 어떤 입력값(prompt, system_prompt 등)을 보여줄 때, serialized widget을
`hide` 해놓고 같은 값을 그리는 DOM/custom box를 **추가로** 만들면 안 된다. 둘 중 하나만:
(a) serialized widget을 그대로 보이게 두거나, (b) serialized widget은 hide하고 DOM box
하나만 쓰되 DOM box는 `serialize:false`로 두고 값 동기화를 box→widget 한 방향으로 건다.

**왜.** 숨긴 widget은 layout에서 빠졌다고 생각하지만, DOM widget은 ComfyUI가 별도 좌표로
띄운다. 둘이 공존하면 DOM box가 다른 위젯 위에 떠서 겹친다. **(Deno) Local LLM Loader가
실제로 이 함정을 거쳐갔다** — 한때 serialized `prompt`를 hide한 채 `addPromptTextBox`로 별도
DOM textarea를 또 만들었고, 그게 위쪽 Provider/Model combo를 덮었다. 지금은 제거돼 single
serialized 위젯으로 렌더하며, 재등장을 막는 테스트(`tests/test_image_resize_node.py:2142`,
`assert "addPromptTextBox" not in script`)까지 있다. (§3-A 참조)

**본보기.** `web/js/deno_ltx_prompt_guide.js` — `positive_prompt`(serialized)는 그대로
쓰고, 요약/토글 같은 보조 UI만 `addCustomWidget`으로 추가한다. serialized 텍스트 입력을
DOM으로 복제하지 않는다.

**안티패턴(이 노드에서 제거됨).** `deno_local_llm_refiner.js`가 한때 쓴 `addPromptTextBox`
— hidden serialized `prompt` + DOM box 동시 존재. 제거 후 `removeLegacyPromptBoxDomElements()`로
잔재 정리 + 금지 테스트로 봉인. 새 노드에서 같은 형태가 보이면 둘 중 하나만 남겨라.

---

### L2. Custom/DOM 패널은 serialized widget '뒤'에만 — 생성 시 앞에 끼우지 마라

**규칙.** `addCustomWidget`/`addDOMWidget`은 위젯 배열 **끝에 append**된다. 위치를 옮기려면
생성 후 `moveWidgetBefore/After`로 옮긴다. **절대** serialized widget보다 앞 인덱스에
끼워 넣지 마라. 원래 serialized 순서는 유지하고, 재배치가 필요하면 **hide로** 처리한다.

**왜.** `widgets_values`는 위젯 **순서(index)** 로 저장·복원된다. serialized 위젯 앞에 새
위젯을 끼우면 저장값이 한 칸씩 밀려서, 다음 로드 때 URL이 model 칸에, boolean이 텍스트
칸에 들어간다. 그리고 패널이 위 위젯과 같은 Y를 먹어 겹친다.

**본보기.** `web/js/deno_ltx_prompt_guide.js`:

```js
function moveWidgetBefore(node, widget, anchor) {
    if (!widget || !anchor) return;
    const currentIndex = node.widgets.indexOf(widget);
    if (currentIndex >= 0) node.widgets.splice(currentIndex, 1); // 끝에서 빼고
    const anchorIndex = Math.max(0, node.widgets.indexOf(anchor));
    node.widgets.splice(anchorIndex, 0, widget);                 // anchor 자리에 끼움
}

// setupNode 안:
const summary = node.addCustomWidget(new DialogueSummaryWidget()); // append (끝)
moveWidgetBefore(node, summary, getWidget(node, "positive_prompt")); // 그 다음 제자리로
```

**안티패턴.** DOM 패널을 끝에 붙인 뒤 위쪽 combo들을 **재anchor하지 않아서** combo와 패널이
같은 Y를 공유 — `deno_local_llm_refiner.js`에서 관측됨(§3-B).

---

### L3. Hide = zero-height converted-widget (원본 스냅샷 먼저, 복원 가능하게)

**규칙.** 위젯을 숨길 때 배열에서 **빼거나 옮기지 마라**. 제자리에 둔 채:
원래 `type`·`computeSize`를 *처음 한 번만* 스냅샷 → `type="converted-widget"`,
`computeSize=()=>[0,-4]`, DOM이면 `element.style.display="none"`. un-hide는 스냅샷 복원.

**왜.** 제자리에 두고 높이만 0으로 접어야 `widgets_values` index→value 매핑이 안 깨지고,
F5/reload 후 저장값이 살아난다. 빼거나 옮기면 저장값이 위치로 드리프트한다.

**본보기.** `web/js/deno_ltx_prompt_guide.js : setWidgetHidden()`:

```js
function setWidgetHidden(widget, hidden) {
    if (!widget) return;
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoPromptOriginalType"))
        widget.__denoPromptOriginalType = widget.type;            // 최초 1회만 스냅샷
    if (!Object.prototype.hasOwnProperty.call(widget, "__denoPromptOriginalComputeSize"))
        widget.__denoPromptOriginalComputeSize = widget.computeSize;
    widget.hidden = hidden;
    if (hidden) {
        widget.type = "converted-widget";
        widget.computeSize = () => [0, -4];
        if (widget.element) widget.element.style.display = "none";
        return;
    }
    widget.type = widget.__denoPromptOriginalType;                // 복원
    if (widget.__denoPromptOriginalComputeSize) widget.computeSize = widget.__denoPromptOriginalComputeSize;
    else delete widget.computeSize;
    if (widget.element) widget.element.style.display = "";
}
```

같은 idiom의 최소판은 `web/js/deno_res_helper.js : toggleWidget()`. **주의:** 스냅샷
키는 파일마다 namespace를 다르게 둔다(`__denoPrompt*`, `__denoLocalLLM*`, `__denoHidden`)
— 충돌 방지용이므로 새 노드는 자기 prefix를 쓴다.

**함정.** 이미 `converted-widget`인 상태를 다시 스냅샷하면 원본 type을 `converted-widget`으로
덮어써 복원이 깨진다. 위 `hasOwnProperty` 가드가 그걸 막는다 — 반드시 유지.

---

### L4. 노드는 자기 크기를 자기가 매 프레임 다시 재지 않는다 (self-referential resize 금지)

**규칙.** `computeSize`가 노드의 **현재 높이**를 읽어 다른 위젯 높이를 거기서 빼는 식으로
값을 만들면 안 된다. 그러면 그린다→크기 바뀐다→다시 computeSize→다시 그린다 루프가 돌아
DOM 높이와 슬롯이 매 프레임 어긋난다. **최소값만 강제하고, 정확 크기는 강제하지 마라.**
사용자가 키워 둔 크기는 보존한다(`setSize`는 `Math.max`).

**왜.** `computeSize`/`setSize`/draw 로직이 사용자의 수동 resize와 싸우면 노드가 튄다
(RETROSPECTIVE §5). 미디어 로드마다 `setSize` 호출도 같은 죄.

**본보기 — 최소값 clamp(`web/js/deno_res_helper.js`):**

```js
node.computeSize = function () {
    const size = node.__denoOriginalComputeSize
        ? node.__denoOriginalComputeSize.apply(node, arguments) : [MIN_NODE_WIDTH, 300];
    return [Math.max(size[0], MIN_NODE_WIDTH), Math.max(size[1] + SUMMARY_HEIGHT, MIN_NODE_HEIGHT)];
};
```

**본보기 — 최소만 강제, 사용자가 키운 건 보존(`web/js/deno_ideogram_director.js`):**

```js
node.addDOMWidget("idd_board", "DenoIdeogramDirector", wrap, {
    serialize: false, hideOnZoom: false, getMinHeight: () => 510,
});
node.resizable = true;
// 정확 크기 강제가 아니라 "이보다 작아지지만 마라". 사용자가 저장한 더 큰 크기는 그대로 살아남음.
setTimeout(() => { node.setSize([Math.max(840, node.size[0]), Math.max(660, node.size[1])]); ... }, 0);
```

**안티패턴.** `deno_local_llm_refiner.js`의 prompt box `computeSize`가
`nodeHeight − (다른 위젯 높이 합)`을 돌려줘서, 그 높이가 다시 노드 크기를 바꾼다(§3-C).
DOM 패널 높이는 노드 현재 높이에 의존하지 말고 `getMinHeight` + flex(`flex:1; min-height:0`)로
컨테이너 안에서 늘어나게 둔다.

---

### L5. wheel/휠클릭은 ComfyUI 캔버스가 1순위

**규칙.** 노드 위 어디서든 wheel(zoom)·middle-click drag(pan)은 캔버스로 가야 한다.
큰 wrap에는 **capture phase**로 wheel을 잡아 캔버스 canvas로 **재dispatch**하고, pan은
synthetic pointer로 안 되니 `app.canvas.ds.offset`을 직접 민다. 의도된 local scroll
영역(긴 갤러리 등)만 명시적 예외로 자기 wheel을 가진다. 반대로, **작은** 스크롤 패널은
의도적으로 `stopPropagation`으로 자기 스크롤을 지키는 것이 맞다 — 둘은 상충이 아니라
"무엇을 스크롤할 것인가"의 선택이다.

**왜.** custom DOM/overlay가 캔버스 내비를 삼키는 건 RETROSPECTIVE §5의 단골 버그다.

**본보기(`web/js/deno_ideogram_director.js`, capture re-dispatch + 직접 pan):**

```js
wrap.addEventListener("wheel", (e) => {
    const cel = (app.canvas && app.canvas.canvas) || null; if (!cel) return;
    if (e.target && e.target.closest && e.target.closest(".idd-gal-scroll")) return; // 유일한 예외
    e.preventDefault(); e.stopPropagation();
    cel.dispatchEvent(new WheelEvent("wheel", {
        deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode,
        clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey,
        bubbles: false, cancelable: true,
    }));
}, { passive: false, capture: true });

// middle-click pan: 합성 포인터로는 LiteGraph pan이 안 도니 offset을 직접 민다
const _onPanMove = (e) => {
    const ds = app.canvas && app.canvas.ds; if (!ds) return;
    ds.offset[0] += (e.clientX - _panLast[0]) / ds.scale;
    ds.offset[1] += (e.clientY - _panLast[1]) / ds.scale;
    _panLast = [e.clientX, e.clientY]; app.canvas.setDirty(true, true);
};
```

`capture:true`가 핵심 — 안쪽 위젯이 `stopPropagation`해도 내려가는 길에 먼저 잡는다.

---

### L6. 빈 노드 body가 캔버스 내비를 막지 않게 — 숨긴 뒤 보이는 컨트롤만큼 줄여라

**규칙.** 위젯을 hide/collapse한 뒤 남는 빈 공간은 "무해한 여백"이 아니라 interaction
bug다. 노드를 실제 보이는 컨트롤 높이로 줄이거나, 그 빈 영역이 캔버스 wheel/scroll/zoom을
못 막게 한다. **노드 아래쪽 빈 부분 위에서 wheel을 반드시 테스트**한다(§2 체크리스트).

---

### L7. 옛 저장본 migration은 `configure()` 안에서, LiteGraph가 값 복원하기 '전에'

**규칙.** 노드 버전이 바뀌어 위젯이 추가/삭제/재배치되면, 옛 `widgets_values` 배열의
shape가 안 맞는다. 이를 `onConfigure`/setup이 아니라 **`configure()` wrap 안에서**,
원본 `configure`에 넘기기 **전에** 위치 기준으로 normalize한다. 알아본 정확한 legacy
shape만 건드리고, 현재 layout 배열은 절대 안 흔든다. shifted label / model 칸의 URL /
text 칸의 boolean / NaN seed / 죽은 hidden 위젯 / 옛 option 토큰은 **runtime 값이 되기 전에
거부**한다. try/catch로 감싸 나쁜 저장본이 로드를 막지 않게 한다.

**본보기(`web/js/deno_ltx_prompt_guide.js`):**

```js
function getNormalizedLtxPromptGuideSerializedValues(values) {
    if (!Array.isArray(values)) return null;
    // legacy v0.3.8: index 0,4가 빈 display 슬롯인 정확한 shape만 remap
    if (values.length >= 7 && (values[0] === "" || values[0] == null)
                           && (values[4] === "" || values[4] == null)) {
        return [values[1], values[2], values[3], values[5], values[6]];
    }
    if (values.length >= LTX_PROMPT_GUIDE_SERIALIZED_WIDGET_COUNT)
        return values.slice(0, LTX_PROMPT_GUIDE_SERIALIZED_WIDGET_COUNT); // 현재 layout은 안 흔듦
    return null;
}

const configure = nodeType.prototype.configure;
nodeType.prototype.configure = function (info) {
    normalizeLtxPromptGuideLegacyWidgetValues(info); // LiteGraph restore '전'
    return configure?.apply(this, arguments);
};
```

원형 템플릿: `DenoLTX23PresetLoader.getNormalizedLtxSerializedValues`
(`web/js/deno_extra_nodes.js`). fixture는 `tests/fixtures/public_workflows/`,
가드는 `tests/test_public_workflow_migration.py`. **옛 저장본 + 새 노드를 같은 패스에서
둘 다** 테스트한다.

---

### L8. setup/refresh는 재진입 가드 + idempotent, 정리는 onRemoved에서

**규칙.** `setupNode`/`refreshNode`는 `onNodeCreated`와 `onConfigure` 양쪽에서 불리고
타이머로도 재실행될 수 있으니, 재진입 가드 플래그로 무한 재귀를 막는다. 생성 위젯은
prefix를 붙이고 재setup 시 먼저 제거(`removeGeneratedWidgets`)해 **중복 생성 0**을
보장한다. `ResizeObserver`/window listener는 `onRemoved`에서 반드시 해제한다.

**본보기:** `deno_ltx_prompt_guide.js`의 `__denoLtxPromptGuideSettingUp` /
`__denoLtxPromptGuideRefreshing` 가드, `removeGeneratedWidgets()`;
`deno_ideogram_director.js`의 `onRemoved` teardown.

```js
function setupNode(node) {
    if (!node || node.__denoLtxPromptGuideSettingUp) return;
    node.__denoLtxPromptGuideSettingUp = true;
    try { removeGeneratedWidgets(node); /* ...rebuild... */ }
    finally { node.__denoLtxPromptGuideSettingUp = false; }
}
```

---

### L9. Backend contract first — INPUT_TYPES 순서 = serialized 순서, frontend는 index 말고 name으로 매칭

**규칙.** Python `INPUT_TYPES.required` 선언 순서가 곧 `widgets_values` 순서다. JS는
위젯을 **고정 index로 읽지 말고** `getWidget(node, name)`으로, 새 위젯 spec은
`registeredNodeData.input.required[name]`에서 끌어온다. 이러면 backend/ frontend 순서
불일치로 인한 겹침이 구조적으로 사라진다.

**확인됨(Local LLM 기준).** `deno_local_llm_refiner.py`의 13개 required 순서와 JS가
name으로 잘 맞물려 있어, **현재 겹침은 backend 불일치가 아니라 순수 layout 문제**다(§3).
즉 L1~L4를 고치면 해결된다. forceInput이 필요한 wired socket은 가능하면 위젯들 **뒤(마지막)에
선언**해 widgets_values shift를 피한다. (단 순수 socket은 위젯 값에 안 섞여 위치 영향이 작다
— 이 노드의 reviewer `review`는 forceInput 첫 번째로 선언돼 있다.)

---

## 2. Geometry 검증 셀 (지금 빠진 검사 — 이걸 통과 못 하면 완료 아님)

DESIGN_UX_PLAYBOOK §1.D-4 "시각 검수"를 **노드용 구체 항목**으로 내린 것이다. 헤드리스
(`/object_info`·served JS grep·pytest)와 "버튼 라벨 바뀌나 + 콘솔 0개"만으로는 아래가
**전부 통과로 보인다**. 그래서 layout 회귀가 새는 자리다. 실제 canvas에서 **눈으로** 본다.

각 노드 작업 시 `docs/nodes/<node>.md`에 아래 행을 채워 증거로 남긴다:

- [ ] **글자 클리핑/줄바꿈** — 모든 텍스트 위젯/preview에서 글자가 칸 **안**에 들어오나,
      줄바꿈 위치가 맞나, 칸 폭을 넘쳐 잘리지 않나. (긴 줄 + CJK + 줄바꿈 포함 입력으로)
- [ ] **위젯 Y 겹침 = 0** — 어떤 두 위젯도 같은 Y에 안 겹친다. 특히 **새 패널/DOM box
      추가 직후 그 위쪽 combo/dropdown**. (현재 Local LLM 버그가 새던 칸)
- [ ] **패널이 노드 경계 안** — 패널이 노드 frame 밖으로 삐져나오지 않는다.
- [ ] **토글 시 자리 밀림 = 0** — provider/mode 등 토글을 눌러도 다른 위젯이 안 밀린다.
- [ ] **resize grow + shrink 둘 다** — 키울 때 정상, **줄일 때 글자 안 잘리고** 패널이
      min 아래로 안 무너진다. 줄였다 키워도 안 튄다.
- [ ] **F5/reload 생존** — 값 유지 + 위치 유지 + **중복 위젯 0**(reload 후 box가 두 개로
      늘지 않나). old-save fixture와 fresh 노드 **둘 다**.
- [ ] **빈 아래 공간 wheel = 캔버스 zoom** — 노드 아래쪽 빈 부분 위 wheel이 캔버스를
      zoom하나. 휠클릭 drag = pan 되나.
- [ ] **짧은 뷰포트** — 세로 좁은 창/축소 줌에서 layout이 안 깨지나.

**증거 방식.** 특정 노드 폭(예: 기본 폭, 그리고 좁힌 폭)에서 스크린샷을 찍어 위 항목을
대조한다. 한두 컨트롤만 누른 "대표 확인"으로 이 셀을 대신하지 않는다. **이 셀을 실제
canvas에서 보기 전에는, 헤드리스가 전부 초록이어도 노드는 완료가 아니다.** 못 본 항목은
"미검증"으로 정직히 적는다(DESIGN_UX_PLAYBOOK §1.E).

---

## 3. Anti-pattern 카탈로그 (실제 사례: (Deno) Local LLM Loader가 거쳐간 함정)

> **정직 메모.** A·B는 이 노드가 **실제로 거쳐갔다가 이미 제거한** 함정이고, C는 **지금도
> 코드에 남아 있는** 패턴이다. 보내준 스크린샷(Prompt 검은 박스가 Provider/Model combo를
> 덮은 화면)은 A를 쓰던 **제거 전 상태이거나 그 stale DOM 잔재**로 보인다 — 현재 committed
> 코드는 serialized 위젯 하나로 렌더한다. (정적 read 기준; 실제 canvas 재현은 미검증.)

**A. 중복 prompt (hidden serialized + DOM box) — 제거됨, 테스트로 봉인.**
이 노드는 한때 serialized `prompt`를 hide한 채 `addPromptTextBox()`로
`.deno-local-llm-prompt-box` DOM textarea를 또 만들었다(= 값 하나에 칸 두 개). 그 DOM
박스가 위 combo 위에 떠 겹쳤다. 지금은 제거됐고 흔적이 강하게 남아 있다:
`removeLegacyPromptBoxDomElements()`(`deno_local_llm_refiner.js:2687`, 호출 1258/2382/3691)가
stale `.deno-local-llm-prompt-box` DOM 노드를 지우고, `tests/test_image_resize_node.py:2142`가
`assert "addPromptTextBox" not in script`로 재등장을 막는다. → **L1.** 교훈: serialized
위젯을 DOM으로 복제하지 마라.

**B. hide와 show/재배치의 분리 (현재 코드의 올바른 형태).**
지금은 serialized `prompt`를 `setActiveProviderModelVisibility`가
`setWidgetHidden(getWidget(node,"prompt"),true)`(`:3124`)로 숨기고, `ensurePromptWidget`(`:2546`)이
다시 보이게 한 뒤 `positionPromptWidget`(`:2673`)이 `moveWidgetAfter`로 **맨 끝에** 옮긴다.
끝으로 옮겨 native 위젯 흐름으로 배치되므로 combo와 같은 Y를 공유하지 않는다. → **L2를
지킨 모습.** (A의 DOM 박스를 끝이 아닌 중간에 끼웠다면 정확히 L2 위반이 됐을 자리다.)

**C. self-referential computeSize — 현재도 존재(클램프됨).**
serialized prompt 위젯의 `computeSize`가 `configurePromptWidget` → `loaderPromptWidgetHeight`
(`:3627`)를 통해 `node.size[1] − Σ(다른 위젯 높이)`를 돌려준다. 값이 `[118,460]`으로 clamp돼
무한 루프는 아니지만, 노드 높이를 위젯 높이에서 역산하는 구조 자체가 수동 resize와 부딪칠
소지다(RETROSPECTIVE §5: "computeSize/setSize가 수동 resize와 싸운다"). → **L4.** 더 안전한
형태는 높이를 노드 크기에서 역산하지 않고 `getMinHeight`+flex로 컨테이너 안에서 늘리는 것.

**D. 타이머 재빌드.** `installGraphScan`(`:836`)은 `setTimeout` 150/700/1800ms로 `setupNode`를,
`schedulePostSetupCleanup`(`:2360`)은 80/300ms로 ensure/position/dedupe 파이프라인을 재실행한다.
재실행이 멱등(idempotent)이고 재진입 가드가 있으면 안전하지만, 아니면 매 패스 위젯이
중복/재배치된다. → **L8.**

> 참고: 이 노드의 **backend(py) contract는 멀쩡**하다(§L9). A~C는 전부 frontend layout
> 영역이며, backend를 건드리지 않고 해결된다.

---

## 4. Copy-ready 본보기 출처 (재발명 말고 복사)

현재 이 레포에는 **공용 util 모듈이 없다** — 모든 노드가 같은 헬퍼를 복붙한다. 새 노드는
아래의 *검증된* 구현을 그대로 가져다 쓴다(파일·함수 기준; 줄 번호는 드리프트할 수 있으니
함수명으로 찾는다):

| 패턴 | 본보기 위치 |
|---|---|
| hide/un-hide (zero-height) | `deno_ltx_prompt_guide.js : setWidgetHidden()` · 최소판 `deno_res_helper.js : toggleWidget()` |
| 위젯 재배치 | `deno_ltx_prompt_guide.js : moveWidgetBefore()` · `deno_local_llm_refiner.js : moveWidgetAfter()` |
| legacy save migration | `deno_ltx_prompt_guide.js : getNormalizedLtxPromptGuideSerializedValues()` · 원형 `deno_extra_nodes.js : getNormalizedLtxSerializedValues()` |
| wheel/pan 캔버스 포워드 | `deno_ideogram_director.js` wrap wheel/pointerdown capture 리스너 |
| computeSize 최소 clamp | `deno_res_helper.js` `node.computeSize` override |
| DOM widget + 최소크기 보존 | `deno_ideogram_director.js` `addDOMWidget(...{getMinHeight}) + setSize(Math.max)` |
| 헤더 `i` info 버튼 | `deno_node_help.js : patchCanvasHelpButton()` |
| 재진입 가드 / idempotent | `deno_ltx_prompt_guide.js : setupNode()` + `removeGeneratedWidgets()` |
| onRemoved teardown | `deno_ideogram_director.js` `onRemoved` |

### Visual identity (위반 시 캔버스에서 바로 티 남)

`docs/DENO_NODE_VISUAL_IDENTITY.md` 기준. 핵심 토큰:

- Panel 배경 `rgba(3,10,7,0.96)` 계열 · inner dark `rgba(0,0,0,0.92)`/`#020403`
- Primary accent border `rgba(72,255,132,0.42)`~`0.95`
- Primary text `#dfffea` · accent text `#9dffba` · destructive `rgba(119,26,26,0.95)`(clear/삭제 전용)
- 패널 radius 8~12px, modal 16px, 액션 버튼 pill
- 헤더 우상단 `i` 버튼 기본 탑재(`patchCanvasHelpButton` 본보기), hover 시 `Node info`
- **custom 패널은 backend 위젯 순서·`widgets_values`를 흔들지 않는 자리에 둔다**(= L1·L2)

---

## 5. 권장 작업 순서 (frontend 노드 한정, 요약)

1. **Backend contract 확정** — `INPUT_TYPES` 순서 = serialized 순서. 이게 곧 layout 골격.
2. **Frontend는 name 기반** — `getWidget(node,name)`, spec은 `registeredNodeData`에서(L9).
3. **보조 UI는 append→move**(L2), **숨김은 hide**(L3), **값 하나엔 위젯 하나**(L1).
4. **크기 규칙**(L4): 최소만 강제, 사용자 크기 보존, self-referential 금지.
5. **캔버스 내비 보존**(L5·L6), **재진입 가드/teardown**(L8), **legacy migration**(L7).
6. **검증 사다리**(DESIGN_UX_PLAYBOOK §1.D / RETROSPECTIVE §10 18-step) 돌리고,
   **마지막에 §2 Geometry 셀을 실제 canvas에서 눈으로** 통과시킨다.

---

## 6. 병합 지도 (Codex가 흡수할 때)

이 문서를 권위 문서에 합칠 때 **삼중 복제하지 말고** 아래로 나눠 넣는다:

- **§1 Frontend Layout Law** → `docs/DENO_NODE_RETROSPECTIVE.md` §5 "LiteGraph UI Pitfalls"
  아래에 L1~L9를 코드 본보기 링크와 함께 정식 편입. (현재 §5의 산문 bullet을 코드 레벨
  불변식으로 승격하는 셈.)
- **§2 Geometry 검증 셀** → `DESIGN_UX_PLAYBOOK.md` §1.D-4 "시각 검수" 바로 아래에
  노드용 체크리스트로 삽입. 그리고 RETROSPECTIVE §10의 step 15(스크린샷 검수)에 이 항목들을
  명시적으로 나열.
- **§3 Anti-pattern** → 해당 노드 문서 `docs/nodes/LOCAL_LLM_LOADER_REVIEWER.md`의 버그
  transcript로 이동(레포 규칙상 per-node 기록은 docs/nodes/).
- **§4 Copy-ready** → 장기적으로 `web/js/` 공용 util 모듈 추출 제안의 근거. 당장은
  VISUAL_IDENTITY와 RETROSPECTIVE에 본보기 포인터로만.

> **검증 메모.** 이 문서의 코드 인용·함수명은 정적 read로 실재 확인했고, 별도 적대적
> fact-check를 한 번 더 거쳤다. §1·§4 본보기 코드는 인용한 파일에 그대로 존재한다.
> §3-A/B는 `deno_local_llm_refiner.js`가 **과거 거쳐갔다 제거한** 상태(잔재 정리 함수
> `removeLegacyPromptBoxDomElements`와 금지 테스트로 확인)이고, §3-C는 현재도 존재한다 —
> "현재 working tree의 버그"가 아니다. "이 패턴들이 실제 canvas에서 widgets_values를
> 보존하고 F5를 견디는지"는 §2 절차로 실기기 확인이 남아 있다(미검증).
