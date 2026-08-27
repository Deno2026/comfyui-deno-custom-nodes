# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

![Deno Custom Nodes banner](images/deno-custom-nodes-banner.jpg)

Puedes usar, estudiar, modificar y redistribuir este repo bajo GPL-3.0.

Los nodos, documentos, ejemplos, workflows y recursos del proyecto que pertenecen a DENO se publican bajo GNU GPL v3.0 (`GPL-3.0-only`). El uso comercial está permitido, pero las versiones modificadas que distribuyas deben seguir GPL-3.0 y conservar los avisos de licencia y copyright requeridos.

Los modelos, checkpoints, LoRAs, bibliotecas, herramientas y servicios de terceros mantienen sus propias licencias y condiciones. Si un workflow usa un modelo o recurso específico, revisa y respeta esa licencia antes de compartir o vender resultados.

Deno Custom Nodes es un paquete de nodos personalizados para ComfyUI, pensado para mejorar flujos reales de imagen, video, LTX, RTX y preparación de modelos.

La mayoría de los nodos Deno incluyen un pequeño botón verde `i` para ver ayuda rápida sin salir del canvas de ComfyUI. Si hay una nueva versión de Deno Custom Nodes, el botón se vuelve amarillo y muestra una pequeña insignia `!`.

## Release Notes

Las actualizaciones públicas se registran en [CHANGELOG.md](../CHANGELOG.md) con un formato corto.

## Web Tools

Herramientas que puedes abrir directamente en el navegador.

- [DENO Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - compara dos videos renderizados con slider, lado a lado, diferencia y vista toggle.
- [DENO Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - recorta, ajusta tamaño y exporta clips cortos como GIF o WebP ligero.
- [DENO Compresor de video / imagen para Discord](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - reduce videos o imágenes y los guarda, cuando es posible, por debajo de 10 MB para compartirlos en Discord. La interfaz está disponible solo en coreano.

## DENO Visual Fold

![DENO Visual Fold](images/deno-visual-fold.webp)

DENO Visual Fold ayuda a ordenar visualmente grafos grandes de ComfyUI. Puedes plegar nodos o grupos sin cambiar la lógica del workflow.

Al seleccionar dos o más nodos aparece un botón verde `Fold` cerca de la esquina superior derecha del canvas. Al pulsarlo, los nodos se compactan como un grupo visual y puedes restaurarlos con `Unfold`. Si seleccionas un grupo normal de ComfyUI, `Fold Group` pliega los nodos dentro del grupo; con varios grupos también aparecen acciones de alineación.

A diferencia de Subgraph, Visual Fold no mueve nodos a un grafo hijo. Es una función visual para ordenar, útil cuando quieres mantener nodos `Get` / `Set` o la estructura padre-hijo visible en el grafo principal.

## DENO Floating Tools

DENO Floating Tools es un asistente opcional en `Settings > DENO > Tools`. Está desactivado por defecto.

Al activarlo, añade un pequeño icono DENO arrastrable a la pantalla de ComfyUI. El panel puede liberar VRAM mediante el endpoint de limpieza de memoria integrado de ComfyUI, mostrar en modo de solo lectura el estado de la versión actual y más reciente de ComfyUI Stable, y abrir un informe de Error Help cuando falla una ejecución.

Error Help crea un informe preparado para GPT / Gemini con el workflow actual, el ejecutable y tipo de entorno de Python, versiones de paquetes, GPU, contexto reciente de traceback / log y un resumen de custom nodes. Es de solo lectura, abre primero una ventana de informe y solo copia al pulsar `Copy Report`. Antes de copiar, oculta secretos habituales como tokens, cookies, contraseñas, claves privadas y credenciales en URLs.

Floating Tools no instala, actualiza, reinicia, repara ni modifica workflows.

## Included Nodes

### `(Deno) Ideogram Director`

Constructor visual de prompts para Ideogram 4 que permite editar captions JSON estructurados y layouts bbox dentro del canvas de ComfyUI.

![Deno Ideogram Director](images/ideogram-director.png)

Funciones principales: dibujar y editar regiones bbox, importar prompts JSON desde Local LLM Loader u otra fuente STRING, pedir confirmación antes de sustituir un board existente, rechazar claramente JSON no válido, usar galerías de presets de estilo/layout y leer o editar las descripciones en tu idioma con Language view, manteniendo la salida final en inglés listo para el modelo y conservando exactamente las palabras literales de cajas TEXT, como carteles, logos y titulares.

### `(Deno) Resize Box`

Nodo de resolución y redimensionado de imagen para ComfyUI.

![Deno Resize Box](images/resize-box.jpg)

Funciones principales: presets de proporción, entrada manual, cálculo por megapíxeles, alineación `divisible_by`, modos Center Crop, Crop Position arrastrable y Fit, vista previa de proporción y, en Crop Position, la imagen de origen semitransparente recortada al cuadro de salida real y desplazable mediante arrastre, salidas `image`, `width`, `height`.

### `(Deno) Multi Image Loader`

Cargador de múltiples imágenes diseñado para workflows de guía por lotes.

![Deno Multi Image Loader](images/multi-image-loader.jpg)

Funciones principales: galería de altura fija, reordenar arrastrando, upload, drag-and-drop, pegar imagen, explorador de carpeta `input`, carpetas anidadas, orden por fecha reciente, redimensionado por ratio/preset/manual, salidas `multi_output`, `width`, `height`.

### `(Deno) MiniMax H3 Multi Reference Image Loader`

Cargador de imágenes de referencia con un solo cable para el workflow nativo MiniMax H3 Reference to Video de ComfyUI.

Mantiene el mismo flujo de upload, paste, drag-and-drop, Input Folder, ordenación de tarjetas y borrado que `(Deno) Multi Image Loader`. Envía hasta 9 referencias ordenadas por un socket `ref_images`, conservando por separado las dimensiones y la proporción originales de cada imagen sin resize, crop ni padding. El orden de las tarjetas corresponde a `<Picture 1>`, `<Picture 2>`, etc.; las mismas imágenes también salen como `image_list` para conectarlas directamente a la entrada `image` de `(Deno) Local LLM Loader`.

El nodo incluido `(Deno) MiniMax H3 Reference to Video` solo reúne las imágenes en una entrada; mantiene las entradas Autogrow nativas de video de referencia, audio asociado al video y audio independiente. Ambos nodos MiniMax H3 requieren ComfyUI 0.30.0 o posterior. Consulta el [workflow de ejemplo MiniMax H3 con múltiples referencias](workflows/minimax-h3-multi-reference.json).

### Workflow MiniMax H3 R2V con referencia de audio

El [workflow de audio de referencia para principiantes](workflows/minimax-h3-r2v-audio-reference.json) conserva la ruta de audio de referencia nativa de MiniMax H3 y añade una línea automática de dirección de prompts.

- `(Deno) Audio Transcript`: usa OpenAI Whisper en local para generar letras o diálogo, tiempos por segmento, idioma detectado y un resumen de confianza. Si el usuario introduce letras o diálogo, ese texto tiene prioridad.
- `(Deno) Audio Analysis Finalizer`: conserva solo los campos de análisis acústico documentados del resultado de ComfyUI `TextGenerate` y, de forma opcional, descarga el modelo CLIP usado para el análisis al terminar.
- `(Deno) Local LLM Loader`: recibe la transcripción y el informe acústico mediante la entrada STRING opcional `audio_context`. No envía AUDIO sin procesar al LLM local y trata el análisis automático como datos de referencia, no como instrucciones.
- La sección elegida del audio original sirve a la vez como referencia `<Audio 1>` de H3 y como sonido insertado en el MP4 final. Este workflow no decodifica el audio generado internamente por H3.

Requisitos: ComfyUI Stable actualizado con MiniMax H3 y `TextGenerate` compatible con entrada de audio; [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) para `Load Audio (Upload)`; `gemma4_e4b_it_fp8_scaled.safetensors` en `ComfyUI/models/text_encoders/` para el análisis acústico; y LM Studio con `google/gemma-4-12b-qat` cargado y Local Server activo para el paso final de dirección del prompt.

`openai-whisper` se instala como dependencia del nodo. El checkpoint de Whisper elegido se descarga desde la dirección oficial de OpenAI en la primera ejecución de `(Deno) Audio Transcript`, el loader oficial verifica su checksum y se guarda en caché bajo `ComfyUI/models/stt/whisper/`.

### `(Deno) Text Encoder Unload`

Barrera de VRAM en línea y opcional para el flujo habitual con solo prompt positive o con prompts positive/negative.

![Workflow Deno Text Encoder Unload](images/text-encoder-unload-workflow.png)

- conecta el conditioning positive mediante `Positive Conditioning`; es obligatorio y se transmite sin cambios
- opcionalmente, conecta un prompt negative ya codificado o `Conditioning Zero Out` mediante `Negative Conditioning`; también se transmite sin cambios
- conecta el `CLIP` exacto usado por los text encoders anteriores a `Text Encoder (CLIP)`
- deja `Negative Conditioning` vacío para un workflow de guider que solo use positive
- descarga mediante la gestión de modelos de ComfyUI únicamente ese CLIP / text encoder, sus clones y componentes gestionados; no descarga globalmente diffusion models, VAE ni ControlNet
- sigue la caché normal de entradas de ComfyUI, por lo que el sampling de preview sin cambios puede reutilizarse; los cambios en conditioning o en la ruta de CLIP vuelven a activar el unload

Dynamic VRAM mueve pesos según la presión de memoria y puede dejar deliberadamente parte del text encoder residente. Este nodo crea un punto de liberación determinista, pero no puede llevar todo el proceso de ComfyUI a `0 MiB`: el contexto CUDA, los conditioning tensors, otros modelos, custom nodes y otras aplicaciones mantienen asignaciones independientes. Tampoco aumenta por sí solo la calidad del sampling; crea margen de VRAM que puede reducir model offload o evitar un OOM. Un text encode posterior debe volver a cargar el modelo y `--gpu-only` no puede sacar el encoder de la VRAM.

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

### `(Deno) LTX High resolution Tiled Sampler`

Sampler para pases de refinement LTX AV. Mantiene una trayectoria global de sampler mientras calcula y fusiona las predicciones de video por spatial tiles superpuestos.

Pasa el audio completo a cada tile de video como contexto, pero mantiene el latent de audio sin cambios en modo `freeze`.

### `(Deno) Easy Model Download Helper`

Ayudante de instalación por presets para conjuntos recomendados de archivos de modelo. Los presets incluidos cubren el conjunto inicial LTX 2.3 GGUF para 8 GB de VRAM y el conjunto oficial LTX 2.5 Distilled INT8 de dos etapas.

![Deno Easy Model Download Helper](images/easy-model-download-helper.png)

Funciones principales: abre enlaces oficiales en el navegador en lugar de descargar desde Python, muestra raíces de modelos de ComfyUI, guarda creator presets en el workflow, soporta Hugging Face y Civitai, y verifica si los archivos están en la carpeta correcta. El preset LTX 2.5 incluye el diffusion model, el text encoder Gemma 4 con projection, los VAE de video y audio y el x2 spatial upscaler requerido por el proceso de dos etapas.

Los archivos de LTX 2.5 requieren iniciar sesión en Hugging Face y obtener **Agree and Access** antes de descargarlos. El asistente no evita esa restricción ni descarga modelos automáticamente. Revisa la [LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md), solicita acceso en el [repositorio oficial LTX 2.5](https://huggingface.co/Lightricks/LTX-2.5), usa los enlaces que abre el nodo y mueve cada archivo descargado a la carpeta de modelos de ComfyUI mostrada en pantalla.

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

### `(Deno) Multi LoRA Loader`

Cargador multi LoRA de uso general para workflows de diffusion normales de ComfyUI. Aplica hasta ocho LoRAs al `MODEL` conectado y al `CLIP` opcional; permite activar o desactivar cada slot sin perder la selección guardada, ajustar strengths separados para model y CLIP, guardar trigger words y notas, cambiar el orden y enviar los resultados `model` y `clip` parcheados.

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

Este nodo solo prepara text conditioning. Conecta sus salidas `positive` y `negative` al nodo nativo `(Bernini) Conditioning` de la versión actual de ComfyUI Stable para construir el conditioning visual / context-latent de Bernini. El backend de Bernini quedó integrado oficialmente mediante el [PR #14216 de ComfyUI](https://github.com/Comfy-Org/ComfyUI/pull/14216), así que el antiguo actualizador preview ya no es necesario; actualiza ComfyUI Stable si no aparece el nodo nativo de conditioning.

### `(Deno) Prompt Text`

Pequeña fuente STRING multiline para guardar system prompts, user prompts, templates o texto JSON largo de forma legible en su propio nodo. Úsala para conectar el texto sin modificar a Ideogram Director, Local LLM Loader u otra entrada STRING.

### `(Deno) Local LLM Loader` / `(Deno) Local LLM Reviewer`

Nodos para llamar desde ComfyUI a LLM locales que ya se estén ejecutando en tu PC y usar un review text del LLM para permitir o bloquear los resultados antes de guardarlos.

Funciones principales: llama a modelos de Ollama, LM Studio, llama.cpp, vLLM, servidores Custom OpenAI-compatible, llama-swap o Unsloth Studio; limita las direcciones a `127.0.0.1` / `localhost`; actualiza listas de modelos por provider; detiene requests en curso; usa APIs de gestión de llama-swap / Unsloth Studio para unload manual o después de la ejecución; procesa prompt batches secuencialmente dentro de una sola ejecución; adjunta IMAGE a modelos de visión; muestra Thinking / Result; controla IMAGE / AUDIO antes de nodos Save; aprueba una vez el resultado actual o vuelve a ejecutar solo la ruta anterior al reviewer. El Result final se guarda en metadata de PNG / workflow y se restaura al reabrirlo; Thinking / reasoning no se conserva.

El provider `Unsloth` es exclusivo de Unsloth Studio y usa por defecto `http://127.0.0.1:8888/v1`. Si ejecutas en LM Studio un GGUF descargado de Unsloth, elige `LM Studio`, no `Unsloth`. Antes de iniciar ComfyUI debes configurar la variable de entorno `DENO_LOCAL_LLM_UNSLOTH_API_KEY`; la clave no se guarda en workflows ni metadata PNG.

Si LM Studio rechaza el campo opcional de control de reasoning antes de empezar a generar, el nodo reintenta una vez sin ese campo. Después, el comportamiento de reasoning depende del server y model elegidos.

Nota de audio: Local LLM Loader no envía AUDIO sin procesar al modelo local. La entrada STRING opcional `audio_context` puede recibir una transcripción y un informe acústico anteriores como datos de referencia sin cambiar el prompt del usuario. Local LLM Reviewer puede permitir o bloquear AUDIO cuando otro nodo de generación de texto compatible con audio produce el review text.

## Why This Exists

Estos nodos reducen la fricción repetida en trabajos reales con ComfyUI. El objetivo no es tener una lista enorme de funciones, sino hacer que los workflows diarios sean más rápidos, limpios y fáciles de enseñar.

## Search Tips

Busca primero `Deno Custom Nodes` en ComfyUI Manager. En GitHub, Manager y Registry también sirven `deno custom nodes`, `ideogram director`, `minimax h3`, `audio transcript`, `whisper`, `text encoder unload`, `clip unload`, `dynamic vram`, `vram barrier`, `multi lora`, `ltx 2.5`, `ltx model loader`, `local llm loader`, `local llm reviewer`, `prompt text`, `ollama`, `lm studio`, `llama.cpp`, `vllm`, `llama-swap`, `unsloth studio`, `bernini conditioning`, `image compare`, `video compare`, `video preview`, `visual fold`, `floating tools`, `free vram`, `comfyui stable`, `error help`, `workflow diagnostics`.

## Install

Método recomendado: busca `Deno Custom Nodes` en ComfyUI Manager, instálalo y reinicia ComfyUI.

Para una instalación manual, clona el repositorio dentro de la carpeta `custom_nodes` de ComfyUI e instala las dependencias con el mismo Python que inicia ComfyUI:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
cd comfyui-deno-custom-nodes
python -m pip install -r requirements.txt
```

Para actualizar manualmente, ejecuta `git pull --ff-only` dentro de la carpeta del repositorio, vuelve a instalar `requirements.txt` con ese mismo Python y reinicia ComfyUI. Las instalaciones mediante ComfyUI Manager / Registry gestionan automáticamente las dependencias del paquete.

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
