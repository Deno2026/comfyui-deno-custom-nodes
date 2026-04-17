import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Deno.ResolutionHelper",
    async setup() {
        onNodeCreated(app, "DenoResolutionSetup");
    }
});

function onNodeCreated(app, nodeTypeName) {
    const callbacks = {
        onWidgetChanged: function (node, widget, value) {
            if (node.type === nodeTypeName) {
                updateResolutionDisplay(node);
            }
        },
    };

    // 기존 노드들에 대해 이벤트 리스너 등록 및 초기화
    app.ui.nodes.forEach(node => {
        if (node.type === nodeTypeName) {
            // 위젯들에 변경 이벤트 훅 추가 (ComfyUI-internal mechanism)
            // 실제 ComfyUI는 위젯 변경 시 onWidgetChanged를 호출하는 구조임
            updateResolutionDisplay(node);
        }
    });

    // 새로 생성되는 노드들에 대해 처리
    app.ui.addNodeEvent = (node) => {
        if (node.type === nodeTypeName) {
            updateResolutionDisplay(node);
        }
    };
}

function updateResolutionDisplay(node) {
    const widgets = node.widgets;
    const wWidget = widgets.find(w => w.name === "width");
    const hWidget = widgets.find(w => w.name === "height");
    const modeWidget = widgets.find(w => w.name === "mode");
    const ratioWidget = widgets.find(w => w.name === "ratio_preset");
    const alignWidget = widgets.find(w => w.name === "alignment");

    if (!wWidget || !hWidget) return;

    let width = parseInt(wWidget.value);
    let height = parseInt(hWidget.value);
    const mode = modeWidget ? modeWidget.value : "Preset Ratio";
    const ratio = ratioWidget ? ratioWidget.value : "16:9";
    const align = alignWidget ? parseInt(alignWidget.value) : 8;

    // 백엔드와 동일한 계산 로직 구현
    let targetW = width;
    let targetH = height;

    if (mode === "Preset Ratio") {
        const [rw, rh] = ratio.split(":").map(Number);
        targetH = Math.floor((width * rh) / rw);
    }

    // Alignment (Ceil)
    const finalW = Math.ceil(targetW / align) * align;
    const finalH = Math.ceil(targetH / align) * align;

    const displayText = `Result: ${finalW} x ${finalH} (${ratio})`;
    
    // 노드 하단에 텍스트 표시 (간단하게 console.log 대신 노드 UI에 직접 추가)
    // ComfyUI에서는 보통 커스텀 위젯을 추가하거나 캔버스에 그리지만, 
    // 여기서는 노드의 'description'이나 별도 텍스트 필드처럼 보이게 처리
    if (node.custom_display) {
        node.custom_display.text = displayText;
    } else {
        // 간단한 구현을 위해 노드의 캡션이나 상태 메시지에 추가
        node.setDirty(true); 
        // 참고: 실제 상용 UI에서는 별도의 텍스트 위젯을 생성하여 업데이트함
        console.log(`[Deno Res Helper] ${displayText}`);
    }
}
