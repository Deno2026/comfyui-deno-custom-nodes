# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

![Deno Custom Nodes banner](images/deno-custom-nodes-banner.jpg)

Puedes usar este repo libremente.

Los nodos, documentos, ejemplos, workflows y recursos propiedad de DENO incluidos en este repo se pueden usar, copiar, modificar, publicar, redistribuir y usar comercialmente. No necesitas mencionar a DENO, al creador ni este repo cuando los uses.

Los modelos, checkpoints, LoRAs, bibliotecas, herramientas y servicios de terceros mantienen sus propias licencias y condiciones. Si un workflow usa un modelo o recurso específico, revisa y respeta esa licencia antes de compartir o vender resultados.

Deno Custom Nodes es un paquete de nodos personalizados para ComfyUI, pensado para mejorar flujos reales de imagen, video, LTX, RTX y preparación de modelos.

La mayoría de los nodos Deno incluyen un pequeño botón verde `i` para ver ayuda rápida sin salir del canvas de ComfyUI. Si hay una nueva versión de Deno Custom Nodes, el botón se vuelve amarillo y muestra una pequeña insignia `!`.

## Release Notes

Las actualizaciones públicas se registran en [CHANGELOG.md](../CHANGELOG.md) con un formato corto.

## Web Tools

Herramientas que puedes abrir directamente en el navegador.

- [DENO Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - compara dos videos renderizados con slider, lado a lado, diferencia y vista toggle.
- [DENO Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - recorta, ajusta tamaño y exporta clips cortos como GIF o WebP ligero.
- [DENO 디스코드용 영상 / 이미지 압축](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - 영상이나 이미지를 줄여 가능하면 10MB 이하 디스코드용 파일로 저장합니다.

## DENO Visual Fold

![DENO Visual Fold](images/deno-visual-fold.webp)

DENO Visual Fold ayuda a ordenar visualmente grafos grandes de ComfyUI. Puedes plegar nodos o grupos sin cambiar la lógica del workflow.

Al seleccionar dos o más nodos aparece un botón verde `Fold` cerca de la esquina superior derecha del canvas. Al pulsarlo, los nodos se compactan como un grupo visual y puedes restaurarlos con `Unfold`. Si seleccionas un grupo normal de ComfyUI, `Fold Group` pliega los nodos dentro del grupo; con varios grupos también aparecen acciones de alineación.

A diferencia de Subgraph, Visual Fold no mueve nodos a un grafo hijo. Es una función visual para ordenar, útil cuando quieres mantener nodos `Get` / `Set` o la estructura padre-hijo visible en el grafo principal.

## Included Nodes

### `(Deno) Ideogram Director`

Visual Ideogram 4 prompt builder for structured JSON captions and bbox layout work.

![Deno Ideogram Director](images/ideogram-director.png)

Main features: draw and edit bbox regions, import JSON prompts from Local LLM Loader or another STRING source, ask before replacing an existing board, reject malformed JSON clearly, use style/layout preset galleries, and use Language view to read/edit board descriptions in your language while final output stays model-ready English and literal TEXT box words stay exact.

### `(Deno) Resize Box`

Nodo de resolución y redimensionado de imagen para ComfyUI.

![Deno Resize Box](images/resize-box.jpg)

Funciones principales: presets de proporción, entrada manual, cálculo por megapíxeles, alineación `divisible_by`, modos Center Crop y Fit, vista previa de proporción en el nodo, salidas `image`, `width`, `height`.

### `(Deno) Multi Image Loader`

Cargador de múltiples imágenes diseñado para workflows de guía por lotes.

![Deno Multi Image Loader](images/multi-image-loader.jpg)

Funciones principales: galería de altura fija, reordenar arrastrando, upload, drag-and-drop, pegar imagen, explorador de carpeta `input`, carpetas anidadas, orden por fecha reciente, redimensionado por ratio/preset/manual, salidas `multi_output`, `width`, `height`.

### `(Deno) Advanced Image Source Loader`

Cargador avanzado para workflows que usan carpetas externas, rutas locales, URLs web y listas de imágenes con tamaños mixtos.

![Deno Advanced Image Source Loader](images/advanced-image-source-loader.png)

Funciones principales: soporte para `input` y carpetas externas, entrada URL/Path, upload y paste, activar/desactivar miniaturas, reordenar, galería tipo masonry, carpetas recursivas, salida batch tensor e `image_list`.

### `(Deno) Image Compare`

Nodo de comparación A/B para revisar dos imágenes directamente en el canvas de ComfyUI.

![Deno Image Compare](images/image-compare.jpg)

Funciones principales: compara `image_a` e `image_b`, modos Slider/Side by Side/Difference/Toggle, slider con hover, etiquetas A/B, botón Swap y preview interno redimensionable.

### `(Deno) Video Compare`

Nodo de comparación A/B para revisar resultados de upscale e interpolación FPS dentro del canvas de ComfyUI.

Funciones principales: `video_a`, `video_b`, audio opcional, modos Slider/Side by Side/Difference/Toggle, play/pause, scrub, frame step, velocidad, loop, badges opcionales y salida `comparison`.

Si el nodo es pesado para tu flujo, usa la herramienta web: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/

![Deno Video Compare - Slider](images/video-compare.png)

![Deno Video Compare - Side by Side](images/video-compare-sbs.png)

![Deno Video Compare - Difference](images/video-compare-diff.png)

### `(Deno) Video Preview`

Preview de video a resolución completa para revisar resultados codificados reales en cualquier punto del grafo.

![Deno Video Preview](images/video-preview.jpg)

Funciones principales: entrada IMAGE batch y salida directa, audio opcional, hover para escuchar, click para play/pause, botón Full screen, badge de resolución/FPS/frames/duración y aviso claro si falta PyAV.

### `(Deno) RTX Video Super Resolution`

Nodo opcional para Windows/NVIDIA RTX que permite probar NVIDIA RTX Video Super Resolution dentro de ComfyUI.

![Deno RTX Video Super Resolution](images/rtx-vfx-easy-upscale-node.png)

Flujo para principiantes: instala o actualiza `deno-custom-nodes`, inicia ComfyUI, añade el nodo y ejecútalo una vez. Si falta NVIDIA VFX, cierra ComfyUI por completo, abre `How to install`, sigue la guía, confirma que la ruta del BAT pertenece al ComfyUI correcto y reinicia ComfyUI al terminar.

Enlaces oficiales de NVIDIA: [NVIDIA Maxine Windows Getting Started](https://docs.nvidia.com/deeplearning/maxine/vfx-sdk-programming-guide/index.html), [RTX Video FAQ](https://nvidia.custhelp.com/app/answers/detail/a_id/5448/~/rtx-video-faq).

### `(Deno) RTX Video Super Resolution (2 Pass)`

Nodo RTX de dos pasadas para finalizar videos. Puede ejecutar primero `Denoise` o `Deblur` al mismo tamaño, y después un upscale `VSR` o `High Bitrate`.

Workflow de ejemplo: [RTX 2-pass upscale workflow](workflows/deno-rtx-lowram-metabatch.json)

Funciones principales: rutas Low System Memory y High System Memory, procesamiento por chunks con VHS Meta Batch, conservación de FPS y audio, pensado para salidas de video reales.

### `(Deno) LTX Sequencer`

Secuenciador de guía para workflows LTX con múltiples imágenes.

![Deno LTX Sequencer](images/ltx-sequencer.jpg)

Funciones principales: trabaja con la salida batch de `(Deno) Multi Image Loader`, puede rellenar `num_images`, mantiene el flujo sync, permite control manual de strength cuando hace falta y añade bypass para A/B rápido.

### `(Deno) LTX Model Loader`

Cargador compacto para patrones comunes de carga de modelos LTX 2.3.

![Deno LTX Model Loader](images/ltx-model-loader.jpg)

Funciones principales: Checkpoint Style, KJ Style y GGUF Style, salidas `model`, `clip`, `video_vae`, `audio_vae`, compatibilidad con loaders de ComfyUI, KJNodes y ComfyUI-GGUF.

### `(Deno) LTX Tiled Spatial Upscaler`

Ayudante para segundas pasadas de video latent LTX en alta resolución. Divide el video latent en spatial tiles superpuestos, ejecuta el upscaler por tile y vuelve a mezclar el resultado en un solo latent.

Úsalo con latents LTX solo de video. Si el workflow lleva video/audio combinados, separa primero el audio y vuelve a unirlo después del pase de video tiled.

### `(Deno) LTX AV Step-Fused Tiled Sampler`

Sampler para pases de refinement LTX AV. Mantiene una trayectoria global de sampler mientras calcula y fusiona las predicciones de video por spatial tiles superpuestos.

Pasa el audio completo a cada tile de video como contexto, pero mantiene el latent de audio sin cambios en modo `freeze`.

### `(Deno) Easy Model Download Helper`

Ayudante de instalación por presets para conjuntos recomendados de archivos de modelo.

![Deno Easy Model Download Helper](images/easy-model-download-helper.png)

Funciones principales: abre enlaces oficiales en el navegador en lugar de descargar desde Python, muestra raíces de modelos de ComfyUI, guarda creator presets en el workflow, soporta Hugging Face y Civitai, y verifica si los archivos están en la carpeta correcta.

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

### `(Deno) LTX Multi LoRA Loader`

Cargador multi LoRA estilo Power-LoRA para workflows LTX.

![Deno LTX Multi LoRA Loader](images/ltx-multi-lora-loader.png)

Funciones principales: varios LoRA en un nodo, activación por slot, strength/video/audio strength, trigger word y notas por LoRA, copiar trigger words, salidas `model` y `clip` parcheadas.

### `(Deno) LTX Prompt Guide`

Ayudante que combina prompt encoding para LTX, negative prompt opcional, conditioning LTX y planificación de duración de diálogo.

![Deno LTX Prompt Guide](images/ltx-prompt-guide.png)

Funciones principales: positive prompt encoding, negative prompt plegable, LTX conditioning con `frame_rate`, estimación de duración a partir de diálogos entre comillas y soporte Auto/Korean/English/Japanese/Chinese.

### `(Deno) Bernini Prompt Guide`

Ayudante de prompts para prefijos KJ-style Bernini. Reúne positive y negative prompt encoding en un nodo más fácil de usar y muestra arriba el system prompt correspondiente al modo `System Prompt` elegido.

![Deno Bernini Prompt Guide](images/bernini-prompt-guide.jpg)

Funciones principales: selector `System Prompt` con modos legibles como `Text to Video`, `Image to Video` y `Reference Video Edit`, hint automático de nombres `image0` / `image1` en modos de referencia, negative prompt plegable, autocompletado del preset negativo Official Wan2.2 y salidas `positive` / `negative`.

El negative preset no es un modo de salida. Solo rellena la caja de negative prompt; después puedes editar esa caja directamente y el texto final se codifica como negative conditioning.

Escribe el prompt como una instrucción para un chatbot, no como una lista de etiquetas. Ejemplo: `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`

Nota: este nodo solo prepara text conditioning. Bernini visual conditioning todavía necesita un backend ComfyUI/KJ compatible con Bernini context latents.
Mientras ese soporte siga como draft PR de ComfyUI, usa `tools/DENO_Bernini_Preview_Backend_Update.bat` solo en una carpeta portable ComfyUI copiada para pruebas.

## Why This Exists

Estos nodos reducen la fricción repetida en trabajos reales con ComfyUI. El objetivo no es tener una lista enorme de funciones, sino hacer que los workflows diarios sean más rápidos, limpios y fáciles de enseñar.

## Search Tips

Puedes buscar `deno custom nodes`, `ideogram`, `ideogram 4`, `ideogram director`, `json prompt`, `bbox`, `bounding boxes`, `layout prompt`, `rtx video super resolution`, `nvidia vfx`, `image compare`, `video compare`, `video preview`, `video to gif`, `gif webp`, `ltx 2.3`, `ltx model loader`, `ltx tiled`, `ltx tiled sampler`, `ltx spatial upscaler`, `ltx multi lora`, `prompt guide`, `system prompt`, `local llm loader`, `local llm prompt`, `local llm reviewer`, `prompt only`, `final prompt`, `bernini`, `bernini prompt guide`, `reference video edit`, `wan2.2`, `visual fold`, `floating tools`, `free vram`, `update watch`, `portable update check`.

## Install

Clona el repositorio dentro de la carpeta `custom_nodes` de ComfyUI:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

Después reinicia ComfyUI.

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
