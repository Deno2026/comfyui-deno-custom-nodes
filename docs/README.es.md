<p align="center">
  <img src="images/deno-custom-nodes-banner.jpg" alt="Deno Custom Nodes" width="100%">
</p>

<p align="center">
  <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Deno2026/comfyui-deno-custom-nodes?style=flat-square&label=release&labelColor=0F0E12&color=F2FF59"></a>
  <a href="https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes"><img alt="Comfy Registry" src="https://img.shields.io/badge/Comfy_Registry-deno--custom--nodes-2E1E38?style=flat-square&labelColor=0F0E12"></a>
  <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Deno2026/comfyui-deno-custom-nodes/ci.yml?branch=main&style=flat-square&label=CI&labelColor=0F0E12"></a>
  <a href="../LICENSE"><img alt="License: GPL-3.0-only" src="https://img.shields.io/badge/license-GPL--3.0--only-2E1E38?style=flat-square&labelColor=0F0E12"></a>
  <a href="https://www.youtube.com/@Denoise-AI"><img alt="YouTube" src="https://img.shields.io/badge/YouTube-Denoise--AI-2E1E38?style=flat-square&labelColor=0F0E12"></a>
</p>

<p align="center">
  <b>Nodos prácticos de ComfyUI para todo el ciclo de producción.</b><br>
  Prepara las entradas, dirige el modelo, compara resultados, define el acabado y mantén legibles los grafos grandes.
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja.md">日本語</a> · <a href="README.zh-CN.md">简体中文</a> · Español · <a href="README.pt-PT.md">Português (PT)</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.id.md">Bahasa Indonesia</a>
</p>

<p align="center">
  <a href="#inicio-rápido">Inicio rápido</a> · <a href="#mapa-de-workflows">Mapa de workflows</a> · <a href="#herramientas-web">Herramientas web</a> · <a href="#nodos-incluidos">Referencia de nodos</a> · <a href="#seguridad-y-privacidad">Seguridad</a> · <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest">Última versión</a>
</p>

> [!NOTE]
> **Novedad en v0.7.126:** [`(Deno) MiniMax H3 Tiled Sampler`](#deno-minimax-h3-tiled-sampler) termina por mosaicos superpuestos un latent de video+audio de MiniMax H3 ya ampliado, de modo que una GPU de 16GB puede ejecutar el pase final de alta resolución.
>
> **v0.7.125** restringió las direcciones de servidor de Local LLM, los enlaces de Easy Model Download Helper y el guardado de imágenes de Ideogram Director. Los ID de nodo, las entradas y los workflows guardados no cambian. Consulta el [CHANGELOG](../CHANGELOG.md).

## Inicio rápido

Empieza con una instalación de ComfyUI que ya funcione.

1. Abre **ComfyUI Manager**, busca `Deno Custom Nodes` e instala el paquete.
2. Reinicia ComfyUI y actualiza la página del navegador.
3. Haz doble clic en una zona vacía del canvas, busca `(Deno) Resize Box` y añádelo.
4. Añade un nodo estándar `Load Image` y elige una imagen. Conéctalo a Resize Box y conecta la salida `image` de Resize Box a `Preview Image`. Elige un tamaño y ejecuta el workflow para ver la imagen redimensionada.

Este primer ejemplo no necesita ningún modelo de generación. Cada nodo de modelo y RTX indica más abajo sus propios requisitos. Si no usas Manager, consulta la [instalación manual](#instalación).

La mayoría de los nodos Deno incluyen un pequeño botón verde `i` en la esquina superior derecha para ver información rápida del nodo sin salir del canvas. Cuando hay una versión más reciente de Deno Custom Nodes, el botón se vuelve amarillo y muestra una pequeña insignia `!`.

## Mapa de workflows

<p align="center">
  <img src="images/readme/workflow-map.webp" alt="Mapa de workflows: Preparar, Generar, Comparar, Finalizar, Organizar" width="920">
</p>

Cada nodo Deno pertenece a un paso del ciclo de producción de ComfyUI. Empieza por el paso en el que estás trabajando.

### 01 · Preparar

Deja a punto cada imagen, referencia y tamaño antes de que se ejecute el modelo.

<p align="center">
  <img src="images/readme/multi-image-loader.webp" alt="Multi Image Loader con seis imágenes, una desactivada" width="370">&nbsp;&nbsp;
  <img src="images/readme/h3-reference-loader.webp" alt="MiniMax H3 Multi Reference Image Loader con tres imágenes y dos referencias de audio" width="370">
</p>

| Nodo | Qué hace | Requisitos |
| --- | --- | --- |
| [Resize Box](#deno-resize-box) | Redimensionado por proporción, megapíxeles y recorte, con vista previa de recorte en vivo y arrastrable | — |
| [Multi Image Loader](#deno-multi-image-loader) | Una galería ordenada y un solo cable; haz clic en una tarjeta para omitirla sin borrarla | — |
| [Advanced Image Source Loader](#deno-advanced-image-source-loader) | Subida de carpetas, lotes encadenados y salida `image_list` con tamaños mixtos | — |
| [MiniMax H3 Multi Reference Image Loader](#deno-minimax-h3-multi-reference-image-loader) | Hasta 9 imágenes y 3 archivos de audio, cada uno con su propio tamaño | ComfyUI 0.30.0+ |

### 02 · Generar

Dirige el modelo con layouts, referencias, prompts y LoRAs que se mantienen legibles en el canvas.

<p align="center">
  <img src="images/readme/ideogram-director.webp" alt="Tablero de Ideogram Director con cajas de título, sujeto, coche y eslogan sobre el póster generado" width="640">
</p>

| Nodo | Qué hace | Requisitos |
| --- | --- | --- |
| [Ideogram Director](#deno-ideogram-director) | Dibuja layouts bbox y crea captions JSON de Ideogram 4 listos para el modelo | Un workflow de Ideogram 4 |
| [MiniMax H3 Acc LoRA Loader](#deno-minimax-h3-acc-lora-loader) | Carga sin conversión los Acc-LoRAs oficiales de 8 pasos de Alibaba para H3 | Pesos oficiales de Acc-LoRA |
| [MiniMax H3 Tiled Sampler](#deno-minimax-h3-tiled-sampler) | Termina por mosaicos superpuestos el video H3 ampliado en una GPU de 16GB | ComfyUI 0.30.0+ con H3 nativo |
| [MiniMax H3 R2V Audio Reference workflow](#minimax-h3-r2v-audio-reference-workflow) | `(Deno) Audio Transcript` y `(Deno) Audio Analysis Finalizer` convierten el audio de origen en dirección para el prompt | VideoHelperSuite, LM Studio |
| [LTX Model Loader](#deno-ltx-model-loader) | Patrones de carga de checkpoint, KJ y GGUF en un nodo compacto | KJNodes o ComfyUI-GGUF para esos modos |
| [LTX Sequencer](#deno-ltx-sequencer) | Secuenciación de guías con varias imágenes, con frame y strength por imagen | — |
| [LTX Multi LoRA Loader](#deno-ltx-multi-lora-loader) | Filas al estilo Power-LoRA con strength de video y de audio por separado | — |
| [LTX Prompt Guide](#deno-ltx-prompt-guide) | Codificación de prompts LTX con una duración mínima calculada a partir del diálogo entre comillas | — |
| [LTX Tiled Spatial Upscaler](#deno-ltx-tiled-spatial-upscaler) | Amplía latents de video en mosaicos espaciales superpuestos | Un upscaler de latents LTX |
| [LTX High resolution Tiled Sampler](#deno-ltx-high-resolution-tiled-sampler) | Refinamiento LTX AV de alta resolución mediante mosaicos espaciales fusionados | — |
| [Bernini Prompt Guide](#deno-bernini-prompt-guide) | Prompts positive y negative en estilo instrucción dentro de un solo nodo | Conditioning nativo de Bernini |
| [Multi LoRA Loader](#deno-multi-lora-loader) | Hasta 64 LoRAs con interruptores, strengths y notas por slot | — |
| [Easy Model Download Helper](#deno-easy-model-download-helper) | Enlaces oficiales de modelos y verificación de la ruta de destino exacta | — |
| [Text Encoder Unload](#deno-text-encoder-unload) | Un punto opcional de liberación de VRAM tras la codificación del prompt | — |
| [Prompt Text](#deno-prompt-text) | Una fuente STRING multilínea y legible para prompts largos | — |
| [Local LLM Loader and Reviewer](#deno-local-llm-loader-and-deno-local-llm-reviewer) | Prompts con LLM locales desde ComfyUI y puertas de revisión antes de guardar | Un servidor de LLM local |

### 03 · Comparar

Mira la diferencia en el canvas antes de guardar nada.

<p align="center">
  <img src="images/readme/video-compare.webp" alt="Slider de Video Compare entre un video de un lago nítido y otro de baja resolución" width="370">&nbsp;&nbsp;
  <img src="images/readme/image-compare.webp" alt="Slider de Image Compare entre una imagen de ciudad nítida y otra pixelada" width="370">
</p>

| Nodo | Qué hace | Requisitos |
| --- | --- | --- |
| [Image Compare](#deno-image-compare) | Vistas de slider, lado a lado, diferencia y toggle dentro del nodo | — |
| [Video Compare](#deno-video-compare) | Reproducción A/B de video con precisión de fotograma, con audio y una salida de comparación sin pérdida | — |
| [Video Preview](#deno-video-preview) | Vista previa H.264 en línea y a resolución completa en cualquier punto del grafo | PyAV (incluido en el ComfyUI actual) |

### 04 · Finalizar

Define el aspecto final y la resolución.

<p align="center">
  <img src="images/readme/film-grain.webp" alt="Controles de Film Grain junto al retrato con grano" width="370">&nbsp;&nbsp;
  <img src="images/readme/rtx-vsr.webp" alt="Panel de RTX Video Super Resolution" width="370">
</p>

| Nodo | Qué hace | Requisitos |
| --- | --- | --- |
| [Film Grain](#deno-film-grain) | Grano de película por CPU para fotos y video, ajustado a la resolución | — |
| [RTX Video Super Resolution](#deno-rtx-video-super-resolution) | VSR, High Bitrate, Denoise y Deblur de NVIDIA con opciones de redimensionado claras | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |
| [RTX Video Super Resolution (2 Pass)](#deno-rtx-video-super-resolution-2-pass) | Un pase de limpieza y un pase de ampliación para workflows de video completos | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |

### 05 · Organizar

Mantén legibles los grafos grandes.

<p align="center">
  <img src="images/readme/visual-fold.webp" alt="Visual Fold: tres nodos seleccionados se pliegan en una sola píldora Folded · 3" width="880">
</p>

| Herramienta | Qué hace | Requisitos |
| --- | --- | --- |
| [Visual Fold](#deno-visual-fold) | Pliega los nodos seleccionados o un grupo en una sola píldora compacta, sin subgrafo | — |
| [Floating Tools](#deno-floating-tools) | Liberar VRAM, estado de actualización de ComfyUI Stable y Error Help listo para GPT/Gemini | Desactivado por defecto |
| [Node info button](#node-info-button) | Ayuda rápida y notas de actualización en cada nodo Deno | — |

## Herramientas web

Úsalas directamente en el navegador. No hay nada que instalar.

- [Deno Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - compara dos videos renderizados con vistas de slider, lado a lado, diferencia y toggle, y guarda la comparación como MP4.
- [Deno Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - recorta, ajusta el tamaño y exporta clips cortos como GIF o como WebP más ligero.
- [Deno Discord Media Compressor](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - comprime videos o imágenes para compartirlos en Discord, con el objetivo de que pesen menos de 10 MB cuando sea posible. La interfaz de esta herramienta está solo en coreano.

## Nodos incluidos

La referencia completa, en el orden del workflow. Cada sección empieza con lo que hace el nodo; abre **Detalles** para ver casos límite y notas de compatibilidad.

### 01 · Preparar

#### `(Deno) Resize Box`

Nodo auxiliar de resolución y redimensionado de imágenes para ComfyUI.

<img src="images/readme/resize-box.webp" alt="Resize Box en modo Crop Position con el cuadro de recorte sobre el origen y la vista previa del resultado" width="652">

Funciones principales:

- modos `Preset Ratio` y `Manual Input`
- presets de proporciones habituales
- cálculo de tamaño basado en megapíxeles
- alineación `divisible_by`
- modos de redimensionado `Center Crop (Fill)`, `Crop Position (Fill)` con proporción bloqueada y zoom, y `Fit (Letterbox/Pillarbox)`
- interpolación `lanczos` por defecto
- vista previa de proporción en vivo; `Crop Position (Fill)` muestra el origen conectado completo, permite arrastrar el cuadro de recorte para reposicionarlo y arrastrar cualquier esquina para hacer zoom, manteniendo fijos la proporción y los megapíxeles de salida
- salidas: `image`, `width`, `height`

#### `(Deno) Multi Image Loader`

Cargador de varias imágenes diseñado para workflows de guía por lotes. Inspirado en las ideas originales de workflow de **WhatDreamsCost**, adaptado y refinado al estilo de trabajo de Deno.

<img src="images/readme/multi-image-loader.webp" alt="Galería de Multi Image Loader con tarjetas numeradas y una tarjeta desactivada" width="452">

Funciones principales:

- galería con desplazamiento y altura fija, en lugar de un nodo que crece sin límite
- reordenación por arrastre con inserción estable del marcador
- haz clic en las miniaturas para desactivar/activar imágenes sin borrarlas; solo salen las imágenes activadas, numeradas 1, 2, 3… en el orden de las tarjetas, y los recuentos y números se actualizan al instante
- las imágenes desactivadas y sus posiciones se guardan con el workflow; activa al menos una imagen para ejecutar
- botón de subida, subida por arrastrar y soltar, y compatibilidad con pegar imágenes
- explorador `Input Folder` para reutilizar imágenes que ya están en `input` de ComfyUI
- modo de tamaño `Keep Input Ratio`, `Preset Ratio` o `Manual Input`, con preset de proporción, megapíxeles, tamaño divisible por un valor o control directo de ancho/alto
- selección de método de redimensionado e interpolación, con recorte o ajuste opcional al exportar
- salidas: `multi_output`, `width`, `height`

<details>
<summary>Detalles</summary>

- exploración de subcarpetas de input con mosaicos de carpeta, navegación con doble clic y un botón `Parent`
- se pueden añadir imágenes de input anidadas conservando sus rutas de subcarpeta de ComfyUI
- los enlaces simbólicos o junctions externos que salen de la carpeta `input` de ComfyUI se omiten por seguridad; sube esas imágenes a `input`
- orden de imágenes de input con las más recientes primero, según la fecha de modificación del archivo
- miniaturas adaptables en la carpeta de input para navegar con más fluidez cuando hay muchas imágenes

</details>

#### `(Deno) Advanced Image Source Loader`

Cargador avanzado de fuentes de imagen para imágenes subidas, carpetas `input` de ComfyUI, lotes IMAGE conectados y salida de lista de imágenes de tamaños mixtos. El estándar `(Deno) Multi Image Loader` sigue siendo la opción más sencilla y recomendada para los workflows normales con la carpeta `input` de ComfyUI.

<img src="images/readme/advanced-loader.webp" alt="Advanced Image Source Loader con botones de subida, pegado, carpeta y ruta sobre una galería masonry" width="612">

Funciones principales:

- mantiene el flujo de galería habitual de los cargadores de imágenes Deno
- admite explorar carpetas existentes de `input` de ComfyUI y entradas relativas en `Input Path`
- `Upload Folder` importa a input una carpeta elegida en el navegador
- admite subida, arrastrar y soltar, pegado y subida de carpetas desde el navegador donde este lo permita, además de un botón `Paste` visible y el pegado normal de imágenes con Ctrl+V
- haz clic en las miniaturas para desactivar/activar fuentes sin borrarlas; solo las tarjetas activadas reciben números de salida consecutivos
- arrastra las tarjetas de miniatura para reordenar la secuencia de salida
- la entrada opcional `images` puede encadenar un lote/lista de imágenes anterior en el mismo flujo de salida
- ofrece como salida un tensor `batch` redimensionado para los workflows normales por lotes y `image_list` para el tratamiento imagen por imagen
- salidas: `batch`, `image_list`, `width`, `height`, `image_count`

<details>
<summary>Detalles</summary>

**Migración desde 0.7.120 o anterior:** las carpetas externas y las URL de imagen ya no se leen ni se descargan. Usa `Upload` o `Upload Folder` y sustituye cada fuente heredada activa por la ruta de input subida. Se conservan las fuentes, el orden, los estados de activación y las conexiones guardados. Las fuentes heredadas desactivadas no bloquean la ejecución. `DENO_EXTERNAL_IMAGE_ROOTS` ya no concede acceso. Las rutas absolutas guardadas dentro del input de ComfyUI siguen ejecutándose; selecciona su ruta relativa de input para recuperar las miniaturas.

- admite mosaicos de carpeta, navegación por carpetas anidadas y un botón `Parent`
- usa `Refresh previews` para reintentar las miniaturas sin cambiar fuentes, estado de activación ni orden; pasa el cursor sobre una vista previa fallida para ver ayuda
- las fuentes desactivadas siguen siendo legibles y permanecen guardadas con el workflow hasta que se reactiven o se eliminen; al activar/desactivar o reordenar, los números de salida se actualizan al instante
- la galería sigue la altura disponible del nodo tanto en el canvas clásico como en Nodes 2.0
- las miniaturas usan un flujo tipo masonry para que las referencias mixtas en vertical y horizontal sean más fáciles de revisar
- opción `recursive_folders` para cargar imágenes de carpetas anidadas
- modo de tamaño `Keep Input Ratio`, `Preset Ratio` o `Manual Input`, con preset de proporción, megapíxeles, tamaño divisible por un valor o control directo de ancho/alto
- selección de método de redimensionado e interpolación, incluidos los modos de relleno con recorte centrado, superior o inferior
- el modo de lista `Original Size` puede conservar en `image_list` las resoluciones de origen mixtas
- el modo de lista `Match Batch Size` hace que `image_list` coincida con las dimensiones del lote redimensionado

</details>

#### `(Deno) MiniMax H3 Multi Reference Image Loader`

Cargador de referencias para workflows de MiniMax H3, con imágenes por un solo cable y salidas de audio individuales.

<img src="images/readme/h3-reference-loader.webp" alt="Cargador de referencias de MiniMax H3 con tres referencias y dos filas de audio con formas de onda" width="483">

Funciones principales:

- el mismo flujo de subida, pegado, arrastrar y soltar, Input Folder, reordenación de tarjetas y borrado que `(Deno) Multi Image Loader`
- hasta 9 imágenes de referencia ordenadas por un único socket dedicado
- conserva las dimensiones y la proporción propias de cada imagen decodificada, sin redimensionado, recorte, relleno ni letterbox
- muestra cada tarjeta de vista previa con la proporción propia de la imagen de origen, de modo que las referencias mixtas en horizontal y vertical se ven completas, sin recorte en la vista previa
- haz clic en las miniaturas para desactivar/activar referencias; las tarjetas activadas se renumeran al instante para coincidir con `<Picture 1>`, `<Picture 2>`, etc., y solo esas imágenes llegan a ambas salidas
- las imágenes desactivadas permanecen guardadas en la posición de su tarjeta y siguen ocupando uno de los 9 slots de la galería; activa al menos una imagen o referencia de audio para ejecutar
- se conecta a la única entrada `ref_images` de `(Deno) MiniMax H3 Reference to Video`
- también expone las mismas fuentes ordenadas como una salida `image_list` que se conecta directamente a la entrada `image` de `(Deno) Local LLM Loader`
- el nodo H3 conserva las entradas Autogrow nativas de ComfyUI para video de referencia, audio asociado al video y audio independiente

La sección de audio plegable bajo la galería de imágenes acepta hasta 3 archivos de audio mediante `Add audio`, Input Folder o al soltar un archivo. Cada archivo tiene una forma de onda, duración medida, reproducción de vista previa, un interruptor Use independiente, un asa para reordenar y un control para quitarlo. La reproducción no cambia si el archivo se usa en la generación. Este cargador no acepta archivos de video.

Estos dos nodos MiniMax H3 requieren ComfyUI 0.30.0 o posterior. Consulta el [workflow MiniMax H3 con múltiples referencias](workflows/minimax-h3-multi-reference.json), portátil, con el pipeline H3 nativo completo en el que los dos nodos estándar `Load Image` se sustituyen por el cargador Deno de un solo cable.

<details>
<summary>Detalles</summary>

Cada audio registrado añade una salida `AUDIO` individual después de las dos salidas de imagen existentes. Conecta esas salidas a las entradas de audio independiente de `(Deno) MiniMax H3 Reference to Video`, que crecen automáticamente, y conecta `audio_vae` para codificar el sonido. Solo las tarjetas de audio activadas reciben `<Audio 1>`, `<Audio 2>`, etc., en el orden de las tarjetas. Por ejemplo, con tres archivos registrados y los dos primeros desactivados, el tercer archivo se muestra y se codifica como `<Audio 1>`. Los archivos desactivados y sus cables permanecen guardados; sus ramas de audio normales aguas abajo se omiten. Reordenar mantiene cada cable unido al mismo archivo, y quitar un archivo elimina solo el cable de audio de ese archivo. También se admite cargar solo audio.

El nodo crece automáticamente al añadir archivos de audio para que todas las filas de audio permanezcan visibles sin barra de desplazamiento interna. Quitar archivos o plegar la sección de audio libera ese espacio. La altura y el ancho añadidos manualmente se conservan, y al reabrir un workflow compacto antiguo el nodo se amplía lo suficiente para mostrar sus filas de audio guardadas.

Para que las etiquetas mostradas y las referencias de H3 sean idénticas, conecta todas las salidas de audio activadas de un mismo cargador DENO al mismo nodo H3 de DENO. Desactiva los archivos que no quieras conectar. Al usar estas salidas de audio de DENO, deben estar desconectadas de ese nodo H3 las demás fuentes de audio independiente y las bandas sonoras de video de referencia; el nodo explica el conflicto de numeración en lugar de asignar etiquetas distintas en silencio. Los workflows existentes que solo usan otros cargadores de audio conservan el comportamiento de entrada estándar.

Los archivos de audio se leen de la carpeta input de ComfyUI. Las extensiones admitidas son WAV, MP3, FLAC, OGG/OGA, Opus, M4A, AAC, AIF y AIFF, según el decodificador PyAV instalado. La carga está limitada a 256 MiB por archivo, 128 MiB de PCM decodificado y 30 segundos de decodificación por CPU. Los fallos de vista previa ofrecen una acción Retry y no cambian los archivos guardados ni sus conexiones.

El socket H3 dedicado es intencionado: un lote `IMAGE` normal de ComfyUI exige un mismo ancho y alto para todas las imágenes, así que no puede conservar tamaños de referencia mixtos. La `image_list` adicional es una salida de lista y no un lote de tamaño uniforme, por lo que las dimensiones originales, el orden y las proporciones se mantienen por separado cuando la reutilizan nodos compatibles con listas. MiniMax H3 aún puede reducir las referencias durante su procesamiento normal de `ref_image_size`, conservando su proporción.

En las versiones de ComfyUI que admiten VAE opcionales en H3, `(Deno) MiniMax H3 Reference to Video` también acepta una entrada `vae` o `audio_vae` sin conectar. Conectar ambas mantiene el comportamiento actual de codificación de referencias.

- Sin `vae`, las imágenes y los videos de referencia siguen llegando al codificador de texto/visión, pero se omiten sus latents de referencia codificados con VAE.
- Sin `audio_vae`, el sonido de referencia real no se codifica. El codificador de texto conserva etiquetas como `<Audio 1>`, no la forma de onda; conecta `audio_vae` para referenciar una voz o un sonido. Omitirlo no desactiva el audio generado.

El audio asociado a un video de referencia (`ref_video_audio`) necesita conectar `vae` y `audio_vae` para codificar el video de referencia y su sonido; el audio de referencia independiente (`ref_audio`) solo necesita `audio_vae`.

Estas opciones se aplican únicamente a la codificación de referencias de este nodo. Conserva los VAE que necesiten los nodos posteriores de decodificación de video y audio. Las versiones antiguas de ComfyUI cuyo nodo H3 nativo exige ambos VAE siguen necesitando ambas conexiones; actualiza ComfyUI para usar la codificación de referencias opcional.

</details>

### 02 · Generar

#### `(Deno) Ideogram Director`

Constructor visual de prompts de Ideogram 4 para captions JSON estructurados y trabajo de layouts bbox. [Mira la demostración del workflow de Ideogram Director](https://youtu.be/Z8s27skkIDM).

<img src="images/readme/ideogram-director.webp" alt="Tablero de Ideogram Director con cuatro cajas de layout sobre un póster generado a partir del mismo layout" width="640">

El fondo de arriba es un resultado local de Ideogram 4 generado a partir de esas mismas cuatro cajas.

Funciones principales:

- dibuja y edita regiones bbox directamente en el canvas de ComfyUI
- desactiva temporalmente elementos bbox individuales sin borrarlos ni reordenarlos
- haz doble clic en un bbox para editarlo junto al puntero, o `Alt`+clic repetido sobre una superposición para recorrer las cajas que hay debajo
- importa prompts JSON desde un Local LLM Loader u otra fuente STRING
- opcionalmente, conecta las entradas STRING Summary y Background para sustituir esos dos campos del tablero durante una ejecución; las entradas sin conectar siguen usando el texto guardado en el tablero
- pregunta antes de sustituir un tablero existente, o cambia a sustituir siempre
- rechaza con claridad un JSON mal formado en lugar de pasar texto de prompt roto aguas abajo
- galerías de presets de estilo y layout con miniaturas de vista previa ligeras
- vista Language para leer y editar las descripciones del tablero en tu idioma mientras la salida final sigue siendo inglés listo para el modelo. Las palabras literales de las cajas TEXT, como carteles, logos y titulares, se conservan exactamente
- salidas: `prompt`, `width`, `height`, `seed`, `bboxes`

<details>
<summary>Detalles</summary>

La salida `bboxes` existente se conecta tanto a consumidores `BBOX` estándar como a entradas `BOUNDING_BOX` como `Ideogram4_MultiLora_BoundingBoxNode_Fedor`; el número de filas de región de ese nodo sigue las cajas activas del Director sin añadir campos guardados al Director. Su sincronización actual, que solo cuenta cajas, no sigue la identidad de cada caja, así que revisa las asignaciones de filas LoRA tras borrar o reordenar una caja intermedia.

La traducción usa únicamente los servicios integrados Google, MyMemory y LibreTranslate. Consulta [acceso a archivos y traducción](SECURITY_CONFIGURATION.md).

</details>

#### `(Deno) MiniMax H3 Acc LoRA Loader`

Carga directamente los [MiniMax-H3-Acc-LoRAs](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs) oficiales de Alibaba PAI, sin convertir ni duplicar el archivo safetensors.

1. Descarga el archivo oficial `Acc-8Step.safetensors` de FL2VA o Ref2VA y colócalo en la carpeta habitual `ComfyUI/models/loras/` o en la dedicada `ComfyUI/models/minimax_h3_acc_loras/`.
2. Conecta a `model` un modelo de difusión nativo de MiniMax H3 compatible; se admiten las variantes completas y las `*_pruned_*` de Comfy-Org.
3. Selecciona el Acc-LoRA correspondiente: FL2VA para FL2VA/T2VA, o Ref2VA para Ref2VA.
4. Conecta la única salida `model` de este nodo a la ruta normal del guider.
5. Construye la ruta de muestreo con nodos estándar de ComfyUI. El punto de partida recomendado es `BasicScheduler: simple, steps: 8` y `KSamplerSelect: euler`, conectados a `SamplerCustomAdvanced`.

Los pesos LoRA y los workflows no se incluyen con Deno Custom Nodes. Descarga los pesos de Alibaba y crea o adapta tu propio workflow nativo de ComfyUI.

<details>
<summary>Detalles</summary>

El nodo aplica los pesos LoRA estáticos y las 32 cabezas de salida PDD dependientes del tiempo del checkpoint. Durante el muestreo lee los límites sigma reales que suministra ComfyUI y fusiona automáticamente las cabezas PDD para esos intervalos. Así, los controles de sampler, scheduler y pasos siguen en los nodos normales de ComfyUI. La configuración oficial Simple/Euler de 8 pasos sigue siendo la recomendada y la usada en el entrenamiento; puedes elegir cualquier número de pasos de Simple Scheduler entre 4 y 12 sin cambiar este cargador, y otros schedules descendentes o pases sigma divididos para workflows de ampliación de latents siguen disponibles como experimento, no como mejoras de calidad garantizadas. Mantén los desplazamientos sigma nativos de video/audio de MiniMax H3 en `12.0 / 3.0` y la fuerza LoRA en `1.0`.

Los modelos completos sin poda, incluidas las variantes INT8 nativas de ComfyUI, aplican el adaptador completo mediante la ruta LoRA normal de ComfyUI compatible con cuantización. Para un modelo curve-pruned, el cargador busca un checkpoint MiniMax H3 completo compatible ya presente en `models/diffusion_models/`, lee únicamente su pequeña sección FP32 time-embedder y calcula en memoria un puente que reajusta las 50 actualizaciones AdaLN LoRA de ancho completo a la curva podada de ancho 8. Nunca carga el checkpoint completo para este cálculo. Si no hay ningún checkpoint completo compatible instalado, el cargador sigue funcionando en modo de compatibilidad: avisa una vez, omite esas 50 actualizaciones AdaLN y aplica todas las demás actualizaciones LoRA y las cabezas PDD.

Los workflows de UI activos estándar guardados con el cargador de tres salidas de v0.7.92–v0.7.94 se migran al cargarlos en el canvas de ComfyUI. Los enlaces de modelo existentes se mantienen, y los antiguos enlaces de sampler y sigmas pasan a nodos estándar editables `KSamplerSelect: euler` y `BasicScheduler: simple, steps: 8`. Guarda el workflow de UI una vez después de abrirlo. Los workflows actuales de una sola salida no se modifican. Los nodos silenciados o en bypass, las disposiciones personalizadas desconocidas y los grafos mal formados se dejan intactos en lugar de adivinar. El JSON de prompts API sin procesar no ejecuta esta migración del frontend; expórtalo de nuevo desde el workflow de UI migrado. Si un archivo ya se guardó después de que desaparecieran sus antiguos enlaces de sampler/sigmas, vuelve a conectar manualmente esos nodos estándar.

</details>

#### `(Deno) MiniMax H3 Tiled Sampler`

Termina por mosaicos superpuestos un latent de video+audio de MiniMax H3 ya ampliado, de modo que una GPU de 16GB puede ejecutar el pase final de alta resolución. En cada paso todos los mosaicos leen el mismo fotograma, sus predicciones se mezclan con pesos coseno en las zonas de solape y después se aplica una única actualización compartida. El modelo se carga una sola vez para todos los mosaicos, y el latent de audio original pasa sin cambios.

<img src="images/readme/h3-tiled-sampler.webp" alt="MiniMax H3 Tiled Sampler con ajustes de mosaico y solape" width="375">

Lugar habitual en un grafo H3 nativo:

```text
First pass: SamplerCustomAdvanced with SplitSigmas high_sigmas
-> MiniMax H3 Latent Upscale With Model (ComfyUI 0.44.0+) or another H3 latent upscaler
-> (Deno) MiniMax H3 Tiled Sampler with SplitSigmas low_sigmas
-> VAE Decode for video, audio decode for sound
```

- `model`: el modelo H3 tras los LoRAs, el desplazamiento sigma y cualquier nodo de atención o memoria. La atención dispersa y la optimización de memoria de H3-Optimizations funcionan antes de este nodo. Por ahora se rechaza con un mensaje el `BlockSparseAttention` del núcleo de ComfyUI.
- `positive`: el mismo conditioning positive que en el primer pase. Las imágenes de referencia R2V siguen siendo globales. El conditioning de keyframes se recorta para cada mosaico y se prepara por mosaico. El conditioning regional y ControlNet se rechazan.
- `latent`: el latent H3 ampliado, sin máscara de ruido.
- `sigmas`: solo los últimos 1-3 pasos del schedule del primer pase, por ejemplo `low_sigmas` de `SplitSigmas`. Otros schedules se rechazan con una indicación.
- `seed`: el ruido que lleva el latent ampliado de vuelta al primero de esos sigmas.
- `Tile width`, `Tile height`, `Overlap X`, `Overlap Y`: tamaños en píxeles, en múltiplos de 32. Los solapes deben ser menores que el mosaico. El número de mosaicos se deduce del tamaño del fotograma. Un mosaico igual o mayor que el fotograma lo ejecuta de una sola pieza.

Los valores por defecto (mosaicos de 896 x 704, con un solape de al menos 256 x 320) son la configuración probada para 16GB. En una GPU de 16GB con 32GB de RAM del sistema, un clip de 15 segundos a 1920 x 1088 se ejecutó en 6 mosaicos, y su único paso final tardó unos 520 segundos. Los mosaicos más grandes repiten menos trabajo de solape, pero necesitan más VRAM. DENO aún no ha medido tamaños superiores a estos valores por defecto.

Cada ejecución imprime en la consola el número de mosaicos, la cuadrícula, los tamaños, los segundos por mosaico y el pico de memoria de PyTorch, y añade el mismo informe al texto de salida del nodo, para que tú o un agente podáis elegir los siguientes tamaños. Requiere ComfyUI con compatibilidad nativa con MiniMax H3 (0.30.0 o posterior); probado en ComfyUI 0.41.3 a 0.44.0.

#### MiniMax H3 R2V Audio Reference workflow

El [workflow de referencia de audio para principiantes](workflows/minimax-h3-r2v-audio-reference.json) mantiene la ruta de audio de referencia estándar de MiniMax H3 de ComfyUI y añade una línea automática de dirección del prompt:

- `(Deno) Audio Transcript` usa OpenAI Whisper en local para obtener letras o diálogo, tiempos por segmento, idioma detectado y un resumen de confianza. Si el usuario introduce letras opcionales, esas siguen mandando en cuanto al texto.
- `(Deno) Audio Analysis Finalizer` conserva solo los campos de análisis acústico documentados del resultado de `TextGenerate` de ComfyUI y puede descargar ese modelo CLIP después del análisis.
- `(Deno) Local LLM Loader` recibe la transcripción y el informe acústico mediante su entrada STRING opcional `audio_context`. El AUDIO sin procesar no se envía al LLM local, y el análisis anterior se trata como datos y no como instrucciones.
- La sección de audio de origen seleccionada es a la vez la referencia `<Audio 1>` de H3 y el audio que se incorpora al MP4 final. El audio generado internamente por H3 no se decodifica en este workflow.

Requisitos:

- ComfyUI Stable actual con MiniMax H3 y compatibilidad de `TextGenerate` con audio
- [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) para `Load Audio (Upload)`
- `gemma4_e4b_it_fp8_scaled.safetensors` en `ComfyUI/models/text_encoders/` para el análisis acústico
- LM Studio con `google/gemma-4-12b-qat` cargado y su Local Server en marcha para el paso final de dirección del prompt

`openai-whisper` se instala como dependencia del nodo. El checkpoint de Whisper elegido se descarga de OpenAI en la primera ejecución de `(Deno) Audio Transcript`, el cargador oficial de Whisper valida su checksum y se guarda en caché en `ComfyUI/models/stt/whisper/`.

#### `(Deno) LTX Model Loader`

Un cargador compacto para los patrones habituales de carga de modelos LTX 2.3.

<img src="images/readme/ltx-model-loader.webp" alt="LTX Model Loader con los botones Checkpoint, KJ Style y GGUF Style" width="372">

Funciones principales:

- modos `Checkpoint Style`, `KJ Style` y `GGUF Style`
- salidas: `model`, `clip`, `video_vae`, `audio_vae`
- usa las rutas de carga integradas de ComfyUI para checkpoint / diffusion / DualCLIP siempre que es posible
- usa `VAELoaderKJ` de KJNodes para los workflows con VAE de video/audio separados
- usa la carga de UNet de ComfyUI-GGUF para los workflows GGUF; ambos paquetes se usan solo después de que ComfyUI los haya cargado, y un paquete instalado pero sin cargar se indica con claridad
- incluye errores de dependencias más claros y un respaldo de compatibilidad del VAE de audio para entornos mixtos de ComfyUI/KJNodes

#### `(Deno) LTX Sequencer`

Secuenciador de guías LTX ajustado a los workflows con varias imágenes. Inspirado en el enfoque de workflow LTX de **WhatDreamsCost**, con ajustes del lado de Deno centrados en la facilidad de uso diaria.

<img src="images/readme/ltx-sequencer.webp" alt="Multi Image Loader conectado a LTX Sequencer con filas de frame y strength por imagen" width="720">

Funciones principales:

- funciona con la salida batch de `(Deno) Multi Image Loader`
- rellena automáticamente `num_images` desde el cargador conectado cuando es posible
- mantiene el flujo de trabajo sincronizado existente
- permite que solo los valores de `strength` pasen a control manual cuando hace falta
- el interruptor `bypass` pasa `positive`, `negative` y `latent` sin cambios para hacer pruebas A/B rápidas

#### `(Deno) LTX Multi LoRA Loader`

Cargador multi LoRA al estilo Power-LoRA para workflows LTX.

<img src="images/readme/ltx-multi-lora.webp" alt="LTX Multi LoRA Loader con columnas de strength, video y audio" width="502">

Funciones principales:

- añade varios LoRAs en un nodo compacto
- interruptor de activación por slot
- controles de strength `strength`, `video` y `audio` por slot
- editor de trigger words y de notas del LoRA por slot
- copia las trigger words guardadas desde la fila del LoRA
- salidas: `model` y `clip` parcheados
- diseñado para mantenerse cerca del conocido workflow de Power LoRA Loader, añadiendo controles A/V pensados para LTX y notas de referencia ligeras sobre los LoRAs

#### `(Deno) LTX Prompt Guide`

Ayudante de prompts que combina la codificación de prompts LTX, el manejo opcional del prompt negative, el conditioning LTX integrado y la planificación de la duración del diálogo.

<img src="images/readme/ltx-prompt-guide.webp" alt="LTX Prompt Guide mostrando la duración mínima del video calculada a partir del diálogo entre comillas" width="572">

Funciones principales:

- codificación del texto del prompt positive
- prompt negative opcional y plegable
- conditioning LTX integrado con `frame_rate`
- estima la duración mínima del video a partir del diálogo entre comillas
- admite estimaciones de diálogo en Auto, coreano, inglés, japonés y chino
- salidas: `positive`, `negative`, `frame_rate`

#### `(Deno) LTX Tiled Spatial Upscaler`

Ayudante para los segundos pases de alta resolución de latents de video LTX. Divide cada fotograma en mosaicos espaciales superpuestos, ejecuta el upscaler espacial de latents de LTX en cada mosaico y mezcla el resultado de nuevo en un solo latent.

Úsalo con latents LTX solo de video. Si tu workflow lleva latents combinados de video/audio, separa primero la ruta de audio y vuelve a unirla después del pase de video por mosaicos.

#### `(Deno) LTX High resolution Tiled Sampler`

Sampler para pases de refinamiento LTX AV de alta resolución. Mantiene una única trayectoria global del sampler mientras las predicciones de video se evalúan en mosaicos espaciales superpuestos y se fusionan antes de la actualización del sampler.

El latent de audio completo se pasa a cada mosaico de video como contexto, mientras que el latent de audio devuelto se mantiene sin cambios en el modo `freeze`.

#### `(Deno) Bernini Prompt Guide`

Ayudante de prompts al estilo KJ para Bernini que combina la codificación de prompts positive y negative en un solo nodo apto para principiantes.

<img src="images/readme/bernini-prompt-guide.webp" alt="Bernini Prompt Guide en modo Image Edit con el preset negative Official Wan2.2" width="640">

El preset negative `Official Wan2.2` que se muestra arriba está escrito en chino.

Funciones principales:

- selector `System Prompt` con modos legibles como `Text to Video`, `Image to Video` y `Reference Video Edit`
- muestra el prefijo del system prompt activo directamente en la parte superior del nodo
- escribe los prompts en estilo instrucción, por ejemplo `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`
- los modos de referencia añaden automáticamente de forma interna una breve indicación de nombres `image0`, `image1`, `image2`
- sección de prompt negative plegable
- los presets negative rellenan el cuadro visible del prompt negative; edita ese cuadro directamente para cambiar el prompt negative final codificado
- salidas: `positive`, `negative`

Este nodo solo prepara el conditioning de texto. Conecta sus salidas `positive` y `negative` al nodo nativo `(Bernini) Conditioning` de ComfyUI Stable para el conditioning visual/context-latent de Bernini. El ComfyUI actual incluye el [backend nativo de Bernini ya integrado](https://github.com/Comfy-Org/ComfyUI/pull/14216), por lo que ya no hace falta el antiguo actualizador del backend de vista previa; actualiza ComfyUI Stable si falta el nodo de conditioning nativo.

#### `(Deno) Multi LoRA Loader`

Cargador multi LoRA de uso general para workflows de difusión normales de ComfyUI.

<img src="images/readme/multi-lora.webp" alt="Multi LoRA Loader con cuatro slots, uno desactivado" width="502">

Aplica hasta 64 LoRAs a un `MODEL` conectado y a un `CLIP` opcional, activa o desactiva cada slot guardado sin perder su selección, ajusta strengths separados para model y CLIP, guarda trigger words y notas junto a cada LoRA, reordena los slots y pasa aguas abajo los `model` y `clip` parcheados. Usa `+ Add LoRA` para añadir slots según los necesites. Los workflows y prompts API existentes de ocho slots conservan sus selecciones, strengths, trigger words, notas y conexiones guardadas.

#### `(Deno) Easy Model Download Helper`

Ayudante de configuración basado en presets para los conjuntos de archivos de modelo recomendados. Los presets integrados cubren el conjunto inicial GGUF de LTX 2.3 para 8GB de VRAM y el conjunto oficial de modelos LTX 2.5 Distilled INT8 de dos etapas.

<img src="images/readme/model-download-helper.webp" alt="Easy Model Download Helper con el preset LTX 2.3 de 8GB de VRAM y filas de archivos que faltan" width="612">

Funciones principales:

- abre enlaces oficiales de modelos en el navegador en lugar de descargar archivos desde Python
- incluye el modelo de difusión LTX 2.5, el text encoder Gemma 4 con proyección, los VAE de video y audio, y el spatial upscaler x2 que exige el workflow de dos etapas
- muestra las raíces de modelos de ComfyUI detectadas y permite copiar la raíz seleccionada
- admite presets de creador guardados dentro del workflow y los restaura desde el almacenamiento del navegador tras recargar la página
- admite enlaces directos de Hugging Face y enlaces de página/descarga de Civitai sin solicitudes de red desde Python
- comprueba las carpetas de modelos registradas en ComfyUI, incluidos los nombres de carpeta personalizados de `extra_model_paths`
- comprueba la ruta de destino exacta de cada preset dentro de esas carpetas de modelos registradas, sin escanear carpetas de proyecto anidadas no relacionadas
- muestra las subcarpetas de modelos de ComfyUI de destino para que se sepa exactamente dónde debe ir cada archivo

El repositorio de LTX 2.5 exige una cuenta de Hugging Face y pulsar **Agree and Access** antes de poder descargar sus archivos. El ayudante no elude esa barrera ni descarga archivos automáticamente. Revisa la [LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md), solicita acceso en el [repositorio oficial de LTX 2.5](https://huggingface.co/Lightricks/LTX-2.5) y usa después los enlaces del ayudante en el navegador y mueve cada archivo descargado a la carpeta de modelos de ComfyUI que se indica.

<details>
<summary>Guía de enlaces para presets de creador</summary>

- Hugging Face: haz clic con el botón derecho en el pequeño icono de descarga junto al archivo de destino, elige `Copy link address` y pega esa URL directa del archivo en el campo `URL` del preset.
- Civitai: copia la URL de la página del modelo desde la barra de direcciones del navegador, pégala en el campo `URL` del preset y pulsa el botón `Civitai` del editor para convertirla en un enlace de descarga directa del navegador. Si el nombre del archivo no se ve en la URL, introdúcelo manualmente con el nombre del archivo descargado.
- En las páginas de Civitai, no copies el enlace del botón azul `Download` salvo que quieras proporcionar deliberadamente una URL de descarga directa de la API.
- `File name` se usa solo para la comprobación de la ruta de destino. Debe coincidir con el archivo descargado en disco, especialmente con enlaces de Civitai/API.

![Guía del enlace de Hugging Face](images/easy-model-download-helper-huggingface-link.png)

[Ejemplo de página de modelo de Civitai (incluye texto del modelo en chino)](images/easy-model-download-helper-civitai-link.png).

![Guía del editor de presets de Civitai](images/easy-model-download-helper-civitai-node.png)

</details>

#### `(Deno) Text Encoder Unload`

Una barrera de VRAM en línea y opcional para el flujo habitual de prompts solo positive o positive/negative.

<img src="images/text-encoder-unload-workflow.png" alt="Text Encoder Unload colocado después de la codificación del prompt" width="720">

- conecta el conditioning positive mediante `Positive Conditioning`; es obligatorio y pasa sin cambios
- opcionalmente, conecta un prompt negative codificado o `Conditioning Zero Out` mediante `Negative Conditioning`; también pasa sin cambios
- conecta a `Text Encoder (CLIP)` el `CLIP` exacto que usan los text encoders anteriores
- deja `Negative Conditioning` vacío para un workflow de guider solo con positive
- descarga mediante la gestión de modelos de ComfyUI únicamente ese CLIP/text encoder, sus clones y sus componentes gestionados; los modelos de difusión, los VAE y los ControlNet no se descargan globalmente
- sigue el almacenamiento en caché normal de entradas de ComfyUI, de modo que el muestreo de vista previa sin cambios puede reutilizarse, mientras que un conditioning o una ruta de CLIP modificados siguen activando la descarga

<details>
<summary>Detalles</summary>

Dynamic VRAM mueve los pesos según la presión de memoria y puede dejar intencionadamente páginas del text encoder residentes. Este nodo ofrece un punto de liberación determinista y opcional, pero no puede hacer que todo el proceso use `0 MiB`: el contexto CUDA, los tensores de conditioning, otros modelos, las asignaciones de custom nodes y otras aplicaciones siguen siendo independientes. Tampoco mejora por sí solo la calidad del muestreo; crea margen de VRAM que puede reducir el offloading de modelos o evitar un error de falta de memoria. Una codificación de texto posterior debe volver a cargar el modelo, y `--gpu-only` no puede sacar el encoder de la VRAM.

</details>

#### `(Deno) Prompt Text`

Una pequeña fuente STRING multilínea para system prompts, user prompts, plantillas o texto JSON. Úsala cuando un prompt largo y reutilizable deba seguir siendo legible en su propio nodo y conectarse a Ideogram Director, Local LLM Loader u otra entrada STRING sin cambiar el texto.

<img src="images/readme/prompt-text.webp" alt="Nodo Prompt Text con un system prompt multilínea" width="472">

#### `(Deno) Local LLM Loader` and `(Deno) Local LLM Reviewer`

Ayudantes de workflow para llamar a modelos que ya se están ejecutando en tu PC y usar revisiones de texto para controlar qué se guarda.

<p>
  <img src="images/readme/local-llm.webp" alt="Local LLM Loader configurado con LM Studio y paneles Thinking y Result" width="370">&nbsp;&nbsp;
  <img src="images/readme/review-gate.webp" alt="Local LLM Reviewer con los controles Review, Pass y Approve Once" width="300">
</p>

Funciones principales:

- llama desde ComfyUI a modelos locales de Ollama, LM Studio, llama.cpp, vLLM, Custom compatible con OpenAI, llama-swap o Unsloth Studio
- seguridad del servidor con localhost por defecto: usa `127.0.0.1` o `localhost`, o permite explícitamente un único `IP:port` de LAN privada con `DENO_LOCAL_LLM_ALLOWED_HOSTS`
- actualiza desde el nodo las listas de modelos específicas de cada provider
- detiene una solicitud en curso al LLM local antes de descargar el modelo
- conecta lotes de prompts mediante una sola ejecución del nodo, de modo que el modelo local puede seguir cargado hasta que termine el lote
- opcionalmente adjunta una IMAGE a una llamada a un modelo local con capacidad de visión
- previsualiza el texto de Thinking y de Result directamente en el nodo
- incrusta el Result final del nodo en los metadatos de PNG/workflow guardados cada vez que se ejecuta el nodo Local LLM, de modo que al reabrir el archivo se restaura dentro del nodo; Thinking/razonamiento sigue siendo solo vista previa y no se guarda
- conserva presets de System Prompt con nombre en los datos de usuario de ComfyUI para que sobrevivan a la limpieza del perfil del navegador
- conecta un FLOAT positive a `video seconds` para añadir a cada user prompt del LLM una frase como `This is an 8-second video.` sin cambiar el texto de Prompt guardado
- usa `(Deno) Local LLM Reviewer` como puerta antes de los nodos Save: deja pasar o bloquea salidas IMAGE y AUDIO a partir del resultado de texto de una revisión, aprueba una vez el resultado revisado actual o vuelve a ejecutar la ruta anterior al reviewer

<details>
<summary>Direcciones de servidor, claves de API y notas de providers</summary>

Los campos de servidor de Custom, llama.cpp, vLLM, llama-swap y Unsloth aceptan solo una dirección de servidor y un puerto con un `/v1` opcional, por ejemplo `http://127.0.0.1:8000/v1`; las consultas y otras rutas se rechazan con una indicación. Refresh Models, Unload y Stop de Ollama y LM Studio usan siempre sus servidores locales fijos, los mismos con los que se ejecuta el nodo. Los errores del servidor muestran el mensaje de error JSON del servidor en lugar de su respuesta sin procesar.

- mantiene un único selector de modelo detectado entre actualizaciones repetidas y cambios de provider, y elimina los selectores duplicados conocidos de sesiones antiguas del frontend conservando el modelo seleccionado
- usa las API de estado en ejecución y de gestión en vivo de llama-swap para la descarga manual o posterior a la ejecución; cualquier timeout de servidor de llama-swap configurado sigue controlando la descarga automática
- usa el provider `Unsloth` solo con un servidor Unsloth Studio (por defecto `http://127.0.0.1:8888/v1`); si un GGUF de Unsloth se ejecuta dentro de LM Studio, selecciona `LM Studio`
- lista los modelos de Unsloth Studio, envía solicitudes de chat compatibles con OpenAI sin campos de definición de herramientas ni de elección de herramientas, y usa la API de gestión de Unsloth Studio para la descarga manual o posterior a la ejecución; `Keep for minutes` no programa una descarga temporizada de Unsloth
- los presets de System Prompt existentes del navegador pueden importarse una vez, y la copia del navegador queda intacta como respaldo
- muestra en el nodo y en el editor el nombre del preset de System Prompt realmente aplicado; el texto editado que no coincide con ninguno se muestra como `Custom`

La autenticación de API se lee del entorno del host de ComfyUI:

| Provider | Variable de entorno de la clave de API |
| --- | --- |
| LM Studio | `DENO_LOCAL_LLM_LM_STUDIO_API_KEY` opcional; recurre a `DENO_LOCAL_LLM_API_KEY` cuando la clave dedicada no está definida |
| llama.cpp, vLLM, Custom, llama-swap | `DENO_LOCAL_LLM_API_KEY` opcional |
| Unsloth | `DENO_LOCAL_LLM_UNSLOTH_API_KEY` obligatoria; no se usa la clave común |
| Ollama | La clave común no se envía |

Define la variable adecuada antes de iniciar ComfyUI y reinicia ComfyUI después de cambiarla. La clave se envía como token Bearer en la detección de modelos, el chat y las solicitudes de gestión que admita el provider, incluidos la descarga de LM Studio y la gestión de llama-swap. Los providers opcionales siguen funcionando sin cabecera de autenticación cuando no hay ninguna clave configurada. Las claves nunca se guardan en workflows ni en metadatos de PNG.

Para un servidor de LLM alojado en Docker en el mismo PC, publica el puerto del servidor en el loopback del host y usa la URL local correspondiente. La autenticación no cambia las reglas de URL de localhost/LAN privada; usa solo un servidor de confianza, porque la clave configurada se envía al provider compatible seleccionado.

Nota sobre LM Studio remoto: el provider dedicado `LM Studio` usa actualmente `http://127.0.0.1:1234/v1`. Para llamar a LM Studio en otro PC tuyo de la misma LAN de confianza, activa **Serve on Local Network** en ese PC, define una lista de permitidos exacta antes de iniciar ComfyUI (por ejemplo `DENO_LOCAL_LLM_ALLOWED_HOSTS=192.168.1.50:1234`), reinicia ComfyUI, selecciona después `Custom` y usa `http://192.168.1.50:1234/v1` como Custom Server URL. Si ese servidor exige autenticación, define también `DENO_LOCAL_LLM_API_KEY` en el host de ComfyUI antes de reiniciar. La lista de permitidos acepta solo pares exactos de IP privada y puerto, y nunca se guarda en workflows ni en metadatos de PNG. Custom no usa los ayudantes de descarga específicos de LM Studio, así que restringe el puerto del servidor al PC de ComfyUI con el firewall del host y gestiona el modelo remoto desde LM Studio.

Nota de compatibilidad con LM Studio: si LM Studio rechaza su campo opcional de control de razonamiento antes de que empiece a generarse salida, el nodo reintenta una vez sin ese campo. El servidor y el modelo seleccionados deciden entonces su comportamiento de razonamiento por defecto; el interruptor Thinking no puede forzar un modo de razonamiento que el servidor no expone.

Nota de audio: Local LLM Loader no envía AUDIO sin procesar a un modelo local. Su entrada STRING opcional `audio_context` puede llevar como datos una transcripción y un informe acústico anteriores, conservando el prompt del usuario. El Reviewer puede controlar AUDIO cuando otro nodo de generación de texto, incluida la generación de texto de ComfyUI con capacidad de audio, crea el texto de la revisión.

</details>

### 03 · Comparar

#### `(Deno) Image Compare`

Nodo de comparación visual A/B para revisar rápidamente dos imágenes en el canvas de ComfyUI.

<img src="images/readme/image-compare.webp" alt="Slider de Image Compare entre una imagen de ciudad nítida y otra pixelada" width="640">

Funciones principales:

- compara `image_a` e `image_b` directamente dentro del nodo
- modos: `Slider`, `Side by Side`, `Difference` y `Toggle`
- interacción de slider al mover el cursor, para inspeccionar rápido el antes/después
- etiquetas A/B visibles y un botón `Swap` para comprobar en cualquier dirección
- el área de vista previa interna cambia de tamaño con el nodo, de modo que las imágenes verticales y horizontales siguen siendo legibles
- nodo solo visual, sin conexión de salida, que mantiene el grafo más limpio cuando la comparación es solo para inspección

#### `(Deno) Video Compare`

Nodo de comparación visual A/B para videos, pensado para revisar resultados de ampliación e interpolación de FPS directamente en el canvas de ComfyUI.

<img src="images/readme/video-compare.webp" alt="Video Compare con slider, botones de modo y controles de reproducción" width="720">

Funciones principales:

- `video_a` / `video_b` (lotes IMAGE) y `audio_a` / `audio_b` opcionales (AUDIO, p. ej. de *Load Video* de VHS)
- modos: `Slider`, `Side by Side`, `Difference`, `Toggle` (cambio A/B con fotograma congelado), más `Swap`
- slider al mover el cursor, clic = reproducir/pausar, barra de desplazamiento, avance por fotograma, velocidad, bucle; pasa el cursor sobre la vista previa para oír el lado seleccionado
- el nodo se ajusta a la proporción del clip; la rueda y el arrastre con el botón central se pasan al canvas de ComfyUI
- interruptor `🏷 Output Badges`: añade opcionalmente insignias A/B y de resolución a la salida guardada (desactivado por defecto; la vista previa dentro del nodo siempre las muestra)
- `comparison`: salida IMAGE **sin pérdida** a resolución completa del modo elegido (Slider / Side by Side / Difference / Toggle), lista para conectarse a un nodo de guardado/codificación como *Video Combine* de VHS con los FPS seleccionados. `Toggle` ofrece como salida el lado A/B seleccionado a lo largo de toda la secuencia.

¿Es demasiado pesado ejecutar el nodo? Usa la herramienta de navegador sin instalación: **https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/** (también enlazada al pie del nodo).

<details>
<summary>Detalles y la herramienta de navegador</summary>

Toda la composición es trabajo puro con tensores, sin codificador externo. El reproductor del nodo dibuja en un `<canvas>` una secuencia de fotogramas WebP reducidos con un reloj virtual (de modo que A/B se mantienen exactos al fotograma) y reproduce el audio con WebAudio; los archivos se escriben en el directorio temporal de ComfyUI y los sirve la ruta `/view` existente, y se borran automáticamente al reiniciar.

Línea de tiempo compartida: el número de fotogramas de la entrada A y los FPS seleccionados definen la duración (se usa B si falta A). Ambos lados de la vista previa y la salida guardada usan esta duración, también tras `Swap`; B se muestrea a lo largo de toda su secuencia para igualar el número de fotogramas de salida de A. Un resultado de interpolación de FPS puede seguir viéndose más fluido en la vista previa con la misma duración.

En la herramienta de navegador, pasa el cursor sobre el nombre de un archivo cargado para ver su nombre completo. Elige **Side by Side** y después **Left / Right** o **Top / Bottom** para previsualizar la disposición combinada. **Save MP4** exporta ambos videos completos como MP4 H.264 a 24, 30 (por defecto) o 60 fps, usando el orden actual de Swap, el modo Sync y el audio A/B seleccionado (o silencio). Ambos videos se ajustan a una altura común en la salida horizontal, o a un ancho común en la vertical, conservando sus proporciones sin recorte. La salida usa la duración completa de A: Time sync mantiene el último fotograma de B si B termina antes; Ratio sync ajusta toda la duración de B a la de A, incluido el audio de B cuando está seleccionado. El zoom y la velocidad de reproducción de la vista previa no afectan al video guardado.

El guardado se ejecuta en local en tu navegador; los archivos nunca se suben. El motor de video descarga unos 30 MB la primera vez que se usa, por lo que hace falta conexión a internet para prepararlo. Los videos grandes o largos pueden tardar y consumir memoria del navegador; **Cancel** detiene la exportación, y un MP4 completado puede volver a descargarse desde el diálogo de guardado.

</details>

#### `(Deno) Video Preview`

Vista previa lista para usar y a resolución completa para revisar la salida codificada real en cualquier punto de un grafo. Codifica el video H.264 real a la resolución original dentro del proceso con PyAV (sin lanzar ningún proceso externo) usando `+faststart` para que el navegador lo reproduzca en línea de forma fiable, y después pasa las imágenes directamente, de modo que puedes insertarlo **en línea en varios puntos de muestreo** sin ramificar el cable.

<img src="images/readme/video-preview.webp" alt="Video Preview reproduciendo un clip codificado con su insignia de resolución, FPS y número de fotogramas" width="692">

Funciones principales:

- entrada `images` (lote IMAGE), salida directa `images`, `frame_rate` y una entrada opcional `audio` que se incorpora a la vista previa como AAC (tolera AUDIO en forma de dict / objeto / `(waveform, sr)` y formas `[C,N]` / `[N,C]`; si el audio no se puede usar, se registra en el log y el video se previsualiza igualmente)
- reproductor en bucle automático dentro del nodo, limpio como la vista previa de VHS: sin controles superpuestos, **pasa el cursor para oír el audio**, **clic = reproducir/pausar**, un botón **Full screen**, y la rueda se pasa al canvas de ComfyUI
- una insignia de información compacta arriba a la izquierda muestra la resolución, los FPS, el número de fotogramas y la duración de la vista previa actual
- el nodo se ajusta a la proporción del clip y se mantiene ajustado al cambiar su tamaño
- cada nodo reutiliza un único archivo temporal, sobrescrito en cada ejecución, de modo que las iteraciones intensivas nunca acumulan almacenamiento temporal
- necesita PyAV (`pip install av`); si falta, el nodo muestra una indicación clara de instalación en una línea en lugar de hacer fallar el grafo

### 04 · Finalizar

#### `(Deno) Film Grain`

Añade grano de película monocromo a una foto o a un lote `IMAGE` de video decodificado mediante procesamiento por CPU. No hace falta ningún modelo ni instalar paquetes adicionales. El valor por defecto mezcla grano fino y grueso en proporción 75:25, suaviza las partículas extremas y reduce el grano cerca del negro y el blanco puros. Solo se desenfoca el patrón de grano; el detalle de la imagen se conserva.

<img src="images/readme/film-grain.webp" alt="Controles de Film Grain junto a la vista previa del retrato con grano" width="720">

Conéctalo al final de la cadena de procesamiento de imagen:

- Foto: imagen final / redimensionado → **Film Grain** → **Save Image**.
- Video nativo: fotogramas decodificados / redimensionado final → **Film Grain** → **Create Video** → **Save Video**. Mantén conectados a Create Video el audio y la frecuencia de fotogramas originales.
- Video Helper Suite: fotogramas decodificados → **Film Grain** → **Video Combine**. Mantén sus ajustes de audio y de frecuencia de fotogramas.

El panel usa controles en inglés y el estilo verde compacto de los demás nodos Deno, sea cual sea el idioma de ComfyUI. Muestra **Strength**, **Grain size**, **Roughness**, **Tone protection** y una opción **Processing**. **Strength va de 0 a 1**: el valor por defecto seleccionado `0.50` equivale a la cantidad `6` del código, mientras que `1.00` equivale a la cantidad `12`. **Low RAM** (por defecto) procesa un fotograma cada vez, **Balanced** usa dos y **Faster** usa cuatro. El grano resultante es idéntico; un procesamiento más rápido puede usar más RAM temporal.

<details>
<summary>Ajustes, adaptación a la resolución y memoria</summary>

**Frames at once**, en **Advanced**, ofrece el valor exacto de 1 a 4, incluido un valor personalizado de 3 que se conserva. El procesamiento usa la CPU y no cambia la VRAM de la generación anterior ni divide el video guardado en clips. El lote completo de fotogramas de salida sigue necesitando RAM; consulta el tooltip de Processing. Los ajustes de seed y de fragmentos de video también están en Advanced.

Los workflows existentes conservan sus valores y cables guardados. Una cantidad guardada por encima del nuevo máximo del panel permanece intacta hasta que ajustes el slider deliberadamente. Los parámetros conectados controlan sus respectivos ajustes; el panel desactiva esos controles y mantiene visibles sus sockets nativos.

Los nodos nuevos usan por defecto **Advanced → Grain scale → Match resolution**. El tamaño del grano es relativo al fotograma: el nodo crea el grano original en una cuadrícula con la misma proporción y **1536px en el lado más corto** (la referencia seleccionada de 2752×1536), y después remuestrea solo ese grano monocromo al tamaño de entrada. La intensidad y la mezcla fino/grueso no cambian. A 2752×1536 el resultado es exactamente el preset original. Los workflows guardados existentes conservan **Fixed pixels** y su resultado anterior; elige Match resolution para activar el nuevo comportamiento. Los prompts API antiguos que omiten `grain_scale_mode` también conservan el resultado basado en píxeles.

El patrón de referencia se filtra al muestrearse en fotogramas más pequeños, en lugar de amplificarse de nuevo hasta la misma varianza por píxel. Esto mantiene más coherentes el tamaño de las partículas y la intensidad visible cuando se ven distintas resoluciones al mismo tamaño en pantalla. El grano muy fino, la compresión del códec y el escalado de reproducción aún pueden diferir; no se garantiza una apariencia idéntica en todos los reproductores. Las entradas extremadamente estiradas cuya cuadrícula de referencia supera los 16.777.216 píxeles fallan antes de reservarla y pueden usar Fixed pixels.

| Ajuste | Por defecto | Efecto |
| --- | --- | --- |
| `enabled` | on | Desactivado, pasa la entrada original sin copiarla. |
| `amount` | `6` | Intensidad almacenada/de API en unidades de brillo de 8 bits. La strength del panel `0.5` = amount `6`, `1` = amount `12`; `0` pasa sin cambios. El rango mayor del backend conserva los workflows antiguos. |
| `grain_size` | `1` | Tamaño relativo fino/grueso en Match resolution; sigma original `0.45 / 1.15 px` en la referencia de 1536px. Fixed pixels usa estos sigmas a la resolución de entrada. |
| `roughness` | `0.25` | Proporción de grano grueso; mezcla fino/grueso por defecto `75:25`. |
| `tone_weighted` | on | Da más peso a los medios tonos oscuros y protege los extremos más claros y más oscuros. |
| `temporal_mode` | `changing` | Varía el patrón en cada fotograma. `fixed` repite un patrón para comparar. |
| `seed` | `2026100701` | Reproduce el mismo patrón y la misma secuencia de fotogramas. |
| `frame_offset` | `0` | Índice global del primer fotograma al procesar fragmentos de video por separado. |
| `processing_batch_size` | `1` | Fotogramas procesados juntos en la CPU, de 1 a 4. 1 minimiza la RAM temporal. |
| `grain_scale_mode` | `resolution` para nodos nuevos | Match resolution muestrea el grano de referencia en el fotograma. `pixels` conserva el grano original basado en píxeles; si se omite en prompts API antiguos, se usa `pixels`. |

Para comparar ajustes con el mismo patrón entre ejecuciones, mantén `seed` sin cambios y pon el **control after generate** del seed de ComfyUI en `fixed`.

La memoria temporal se limita al grupo de procesamiento seleccionado (1–4 fotogramas), y la salida activada se almacena en la CPU en lugar de reservar un segundo lote completo en la VRAM. Match resolution también necesita la cuadrícula de grano de referencia, por lo que los fotogramas de menor resolución pueden usar más RAM temporal que Fixed pixels; Low RAM limita este trabajo a un fotograma cada vez. **El lote IMAGE de salida completo sigue necesitando RAM**, además de la entrada anterior y las cachés de ComfyUI. Para RGB float32, esta salida usa `frames × width × height × 12` bytes: unos **23,7 MiB por fotograma 1080p**, o **2,78 GiB para 120 fotogramas**. Este nodo no transmite por streaming un archivo de video completo ni elimina la memoria de caché anterior; usa lotes más cortos para clips largos o de alta resolución. Las ejecuciones desactivadas o con strength cero devuelven el mismo objeto de entrada.

El tamaño, el número de canales y el dtype se conservan; el alfa RGBA no cambia. El nodo opera sobre píxeles, mientras que Save Image/Save Video conservan la responsabilidad de los metadatos del workflow, la codificación y la creación del archivo. Un socket nativo `VIDEO` se conecta después de Create Video, no directamente a este nodo. La compresión de video puede suavizar el grano fino o aumentar el tamaño del archivo guardado.

</details>

#### `(Deno) RTX Video Super Resolution`

Nodo auxiliar opcional de NVIDIA RTX Video Super Resolution para Windows/NVIDIA RTX, para quien quiera probar NVIDIA VFX dentro de ComfyUI sin tener que buscar manualmente el entorno de Python adecuado.

<img src="images/readme/rtx-vsr.webp" alt="Panel de RTX Video Super Resolution con controles de efecto, calidad y redimensionado" width="612">

Este nodo está separado a propósito de los nodos Deno principales. Solo importa NVIDIA VFX durante la ejecución de la ampliación, por lo que las instalaciones normales de nodos Deno no requieren NVIDIA VFX. ComfyUI Manager instala el paquete de nodos sin instalar automáticamente NVIDIA VFX.

| Si tu imagen es... | Usa |
| --- | --- |
| pequeña, de baja resolución o comprimida | `VSR` |
| ya limpia, pero necesita una salida más grande y nítida | `High Bitrate` |
| con ruido o grano | `Denoise` |
| suave, desenfocada o ligeramente borrosa | `Deblur` |

Flujo de instalación para principiantes:

1. Instala o actualiza `deno-custom-nodes` y después inicia ComfyUI.
2. Añade `(Deno) RTX Video Super Resolution` y ejecútalo una vez con una imagen.
3. Haz clic en el botón `How to install` del nodo si falta NVIDIA VFX o quieres actualizar una instalación antigua.
4. Cierra todas las ventanas/procesos de ComfyUI antes de ejecutar el instalador.
5. Sigue la guía de instalación web visual: descarga el ZIP de esa página, muévelo a `ComfyUI\custom_nodes\deno-custom-nodes\tools`, elige `Extract All` con la carpeta de destino establecida en esa misma carpeta `tools` y ejecuta `tools\install_rtx_vfx.bat`. Si Windows creó una subcarpeta `install_rtx_vfx_bat`, mueve `install_rtx_vfx.bat` y `README_RTX_VFX_EASY_INSTALL.md` directamente a `tools` antes de ejecutar el BAT.
6. Si el BAT pregunta `Install RTX VFX here?`, escribe `Y` solo cuando la ruta de Windows que se muestra esté dentro de la aplicación ComfyUI que acabas de cerrar. Si no parece correcta, escribe `N` y detente.
7. Espera al mensaje verde `INSTALL COMPLETE`.
8. Reinicia ComfyUI por completo y vuelve a usar `(Deno) RTX Video Super Resolution`.

Para ver el recorrido visual completo y apto para principiantes, abre la [página de instalación de Deno RTX VFX](https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/).
Si un video tutorial te dice que abras la carpeta `tools` después de instalar desde ComfyUI Manager, abre `tools/OPEN_INSTALL_GUIDE.txt`; remite a la misma página de instalación actual.

<details>
<summary>Requisitos de runtime, actualizaciones y todas las funciones</summary>

Runtime de NVIDIA recomendado: `nvidia-vfx 0.2.0.0` o posterior (VFX SDK 1.3); el instalador actual exige al menos esta versión. En nuestra comparación en Windows, `0.2.0.0` evitó la acumulación repetida de procesos de comprobación de actualizaciones de NVIDIA que se veía con `0.1.0.1`. Es un resultado del entorno probado, no una garantía para todos los PC.

Para el runtime actual, usa Windows 10/11 x64, una GPU NVIDIA RTX compatible y Python 3.10 o posterior. Se recomienda PyTorch con CUDA 13 o posterior, igual que los [nodos NVIDIA actuales de Comfy Org](https://github.com/Comfy-Org/ComfyUI_Nvidia_VFX_Nodes#requirements). El mínimo de driver de NVIDIA para Windows x64 es 570.65 (595 para dispositivos TCC). El instalador comprueba el efecto de NVIDIA en tu entorno real de ComfyUI y no sustituye automáticamente PyTorch ni actualiza tu driver; sigue sus instrucciones si la verificación falla. El paquete de NVIDIA incluye su runtime VFX, por lo que no necesitas un instalador de VFX SDK aparte ni el CUDA Toolkit para esta instalación.

¿Ya usas `nvidia-vfx 0.1.x`? Actualizar solo DENO Custom Nodes no actualiza esta biblioteca opcional de NVIDIA. Cierra ComfyUI por completo y vuelve a ejecutar el instalador más reciente de la misma guía anterior. Las conexiones y los ajustes del workflow existente se mantienen, pero los resultados del procesamiento de NVIDIA pueden diferir tras la actualización de la biblioteca. Conserva tu entorno anterior si necesitas reproducir exactamente un render anterior.

Referencias oficiales de NVIDIA:

- [Filtro Video Super Resolution](https://docs.nvidia.com/maxine/vfx/latest/Filters/VideoSuperResolution.html)
- [Bindings de Python de NVIDIA VFX](https://docs.nvidia.com/maxine/vfx-python/latest/index.html)
- [Requisitos actuales del paquete de NVIDIA e historial de versiones](https://pypi.org/project/nvidia-vfx/)
- [Requisitos actuales de VFX SDK para Windows](https://docs.nvidia.com/maxine/vfx/latest/WindowsVFXSDK/GetStartedonWindows.html)
- [API de Python de VideoSuperRes](https://docs.nvidia.com/maxine/vfx-python/latest/api.html)

Funciones principales:

- usa la ruta oficial del paquete `nvidia-vfx` / `nvvfx.VideoSuperRes` de NVIDIA
- enlaza desde la interfaz del nodo con la documentación oficial de Video Super Resolution de NVIDIA
- muestra un panel RTX compacto con botones de efecto, un selector de calidad independiente, una línea de guía del modo y solo los controles de redimensionado que se aplican al efecto seleccionado
- los paneles RTX de un pase y de 2 pases pasan el desplazamiento de la rueda del ratón al canvas de ComfyUI, de modo que el zoom normal del canvas sigue funcionando mientras el puntero está sobre el nodo
- el instalador apunta al Python que usa la instalación actual de ComfyUI
- el instalador se niega a continuar si ComfyUI sigue ejecutándose con ese Python
- el instalador pregunta antes de instalar en el Python detectado
- el instalador se detiene si no se detecta ninguna GPU NVIDIA, salvo que el usuario anule explícitamente la comprobación
- el instalador reinstala `nvidia-vfx >= 0.2.0.0` de forma limpia cuando el usuario confirma el Python de destino, incluidas las actualizaciones desde instalaciones antiguas `0.1.x`
- el instalador verifica primero la ruta normal del paquete `nvvfx` que usa el Python actual de ComfyUI
- el instalador usa el respaldo de runtime de Windows en ASCII solo cuando falla la verificación de la ruta normal de `nvvfx`
- el arranque del nodo prefiere la ruta de respaldo ASCII registrada solo cuando ese respaldo se seleccionó realmente
- si ya hay cargado otro módulo nativo de NVIDIA VFX desde una ruta en conflicto, el nodo se detiene y pide un reinicio completo de ComfyUI en lugar de intentar recargar la extensión nativa
- el instalador verifica que el efecto `VideoSuperRes` de NVIDIA pueda crearse realmente tras la instalación
- si NVIDIA VFX informa de una función de runtime no compatible, el nodo muestra un mensaje legible sobre la GPU/driver/ruta del runtime en lugar de un stack trace sin procesar
- si ya hay cargadas DLL de NVIDIA Broadcast/NGX VFX de otro nodo RTX, el nodo informa de ese conflicto de runtime nativo por separado de la compatibilidad de GPU/driver
- si otro nodo RTX basado en Broadcast funciona mientras Deno falla, trátalo como un conflicto de runtime nativo, no como prueba de que la instalación de Deno esté rota
- mantiene el BAT del instalador y el ZIP en GitHub en lugar de dentro del paquete de Manager, mientras que la interfaz del nodo ofrece un botón `How to install` que abre la página web de instalación visual y un ayudante `Copy steps`
- mantiene un pequeño archivo `tools/OPEN_INSTALL_GUIDE.txt` en las instalaciones de Manager para que la carpeta `tools` siga existiendo para quienes siguen videos tutoriales antiguos
- ofrece cuatro botones de efecto claros: Video SR, High Bitrate, Denoise y Deblur
- muestra una línea compacta de guía del modo que explica en lenguaje sencillo el efecto seleccionado
- mantiene la calidad Low, Medium, High y Ultra como un selector independiente
- para Video SR y High Bitrate, admite las opciones de redimensionado `Scale`, `Keep Ratio`, `Manual` y `Preset Ratio`
- `Keep Ratio` y `Preset Ratio` usan megapíxeles objetivo; `Manual` usa ancho y alto
- ofrece la alineación `divisible_by` para los modos redimensionables, con `1` por defecto para que los tamaños de video estándar como 1920x1080 se mantengan exactos
- los valores de alineación más altos, como `32`, siguen disponibles cuando un workflow necesita específicamente una salida forzada a múltiplos de N
- muestra `Center Crop (Fill)` / `Fit (Letterbox/Pillarbox)` cuando un redimensionado manual, con proporción preestablecida o con proporción mantenida y alineada puede cambiar la proporción
- `Denoise` y `Deblur` conservan el tamaño original y ocultan los controles de redimensionado, igual que los modos VSR del mismo tamaño de NVIDIA
- salida de Easy Upscale: `images`
- El nodo solo muestra controles. Conecta su salida `images` a Preview Image o a Image Compare para ver el resultado procesado.

</details>

#### `(Deno) RTX Video Super Resolution (2 Pass)`

Nodo de acabado RTX de dos pasadas para workflows de video completos. Puede ejecutar primero un pase opcional de `Denoise` o `Deblur` del mismo tamaño y después un pase de ampliación opcional de `VSR` o `High Bitrate`.

<img src="images/readme/rtx-2pass.webp" alt="Panel de RTX Video Super Resolution 2 Pass con un pase de limpieza y un pase de ampliación" width="632">

Workflow de ejemplo: [workflow de ampliación RTX de 2 pases](workflows/deno-rtx-lowram-metabatch.json)

Funciones principales:

- incluye las rutas `Low System Memory` y `High System Memory` en el workflow de ejemplo
- la ruta de poca memoria usa VHS Meta Batch para procesar videos más largos en fragmentos de fotogramas más pequeños
- usa `VHS_VideoInfoSource` para llevar los FPS de origen a `VHS_VideoCombine`
- conserva el audio de origen a través de la ruta de carga/combinación de VHS
- útil para terminar salidas de video codificadas reales, no solo para probar un lote de imágenes
- salida: `images`

### 05 · Organizar

#### Deno Visual Fold

Deno Visual Fold es un ayudante de limpieza solo visual para grafos grandes de ComfyUI. Se activa automáticamente al instalar o actualizar el último paquete de Deno Custom Nodes.

<img src="images/readme/visual-fold.webp" alt="Nodos seleccionados con la insignia verde Fold, plegados en una sola píldora Folded · 3" width="880">

Selecciona dos o más nodos y la barra de selección nativa de ComfyUI mostrará una insignia verde `Fold` legible. Haz clic para colapsar los nodos seleccionados en un único grupo visual compacto; usa `Unfold` para restaurarlos.

También puedes seleccionar un grupo normal de ComfyUI y usar `Fold Group` para colapsar los nodos de ese grupo sin tocar la lógica del workflow. Cuando hay dos o más grupos seleccionados, la misma barra añade insignias `Align` legibles para alinear a la izquierda/derecha/arriba/abajo y para espaciar horizontal/verticalmente.

Esto es distinto de ComfyUI Subgraph. Subgraph mueve los nodos a un grafo hijo, lo cual puede ser potente, pero puede no ser lo ideal cuando un workflow depende de mantener visibles en el grafo principal los nodos `Get` / `Set` o la estructura padre-hijo del grafo. Visual Fold está pensado solo para una organización visual sencilla. No convierte los nodos seleccionados en un subgrafo ni cambia la lógica del workflow.

#### Deno Floating Tools

Deno Floating Tools es un ayudante opcional en `Settings > DENO > Tools`. Está desactivado por defecto.

Al activarlo, añade a la pantalla de ComfyUI un pequeño icono Deno arrastrable. El panel puede liberar VRAM de ComfyUI mediante el endpoint integrado de limpieza de memoria de ComfyUI, mostrar en modo de solo lectura el estado actual/más reciente de la versión del núcleo de ComfyUI Stable y abrir un informe de Error Help cuando falla una ejecución.

Error Help crea un informe listo para GPT/Gemini con el workflow actual, el ejecutable de Python y el tipo de entorno, las versiones de paquetes, los detalles de la GPU, el contexto reciente de traceback/log y un resumen de custom nodes. Es de solo lectura, abre primero una ventana de informe y copia únicamente cuando haces clic en `Copy Report`. Los secretos habituales, como tokens, cookies, contraseñas, claves privadas y credenciales de URL, se enmascaran antes de copiar.

Floating Tools no instala, actualiza, reinicia, repara ni modifica workflows. Se engancha a las funciones de solicitud de ComfyUI solo mientras las herramientas están activadas.

#### Node info button

La mayoría de los nodos Deno llevan un pequeño botón verde `i` en la esquina superior derecha. Haz clic para ver el propósito del nodo, sus ajustes clave y las notas de la versión actual sin salir del canvas. Cuando hay una versión más reciente de Deno Custom Nodes, el botón se vuelve amarillo y muestra una pequeña insignia `!`.

<img src="images/readme/node-help.webp" alt="Ventana de información del nodo Resize Box con la versión y las notas de la versión" width="720">

## Seguridad y privacidad

Deno Custom Nodes mantiene por defecto un manejo restringido de archivos, red y secretos.

- **Archivos:** los cargadores de imágenes leen solo la carpeta `input` de ComfyUI. Sube las imágenes externas antes de reabrir workflows que usaban rutas o URL externas. El Save Image de Ideogram Director copia solo archivos de imagen.
- **Local LLM:** los servidores son localhost por defecto. Un servidor de LAN privada solo funciona mediante una lista de permitidos exacta en `DENO_LOCAL_LLM_ALLOWED_HOSTS`, y las claves de API se leen del entorno del host de ComfyUI, nunca se guardan en workflows ni en metadatos de PNG.
- **Traducción:** la traducción de Ideogram usa solo los servicios integrados Google, MyMemory y LibreTranslate.
- **Enlaces de modelos:** Easy Model Download Helper abre enlaces web oficiales en tu navegador y nunca descarga archivos desde Python.
- **Informes:** Error Help es de solo lectura, muestra el informe antes de copiarlo y enmascara secretos habituales como tokens, cookies, contraseñas y claves privadas.

Consulta [acceso a archivos y traducción](SECURITY_CONFIGURATION.md) para ver las reglas exactas.

## Por qué existe

Estos nodos se crean para reducir la fricción repetida de configuración en el trabajo real con ComfyUI. El objetivo no es perseguir enormes listas de funciones. El objetivo es que los workflows que la gente repite cada día resulten más rápidos, más limpios y más fáciles de enseñar.

## Consejos de búsqueda

- En ComfyUI Manager o en Registry, busca `Deno Custom Nodes`.
- En el canvas, busca `(Deno)` o el nombre del nodo, como `Resize Box`.
- Usa el [Mapa de workflows](#mapa-de-workflows) para encontrar la herramienta y sus requisitos.

## Instalación

Para la instalación recomendada con Manager, sigue el [Inicio rápido](#inicio-rápido).

<details>
<summary>Instalación y actualización manual</summary>

Para una instalación manual, clona el repositorio dentro de tu carpeta `custom_nodes` e instala las dependencias con el mismo ejecutable de Python que inicia ComfyUI:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
cd comfyui-deno-custom-nodes
python -m pip install -r requirements.txt
```

Para actualizar manualmente, ejecuta `git pull --ff-only`, vuelve a instalar `requirements.txt` con ese mismo Python y reinicia ComfyUI. Las instalaciones con Manager/Registry gestionan automáticamente las dependencias del paquete.

</details>

## Licencia

Los nodos, documentos, ejemplos, workflows y recursos locales del proyecto que pertenecen a Deno en este repositorio se publican bajo GNU GPL v3.0 (`GPL-3.0-only`). Puedes usarlos, estudiarlos, modificarlos y redistribuirlos, también con fines comerciales, bajo los [términos de GPL-3.0](../LICENSE). Las versiones modificadas que se distribuyan deben seguir GPL-3.0 y conservar los avisos de licencia y copyright requeridos.

Los modelos, checkpoints, LoRAs, bibliotecas, herramientas y servicios de terceros mantienen sus propias licencias y condiciones. Consulta la licencia aplicable antes de usar, compartir o vender resultados de un modelo o recurso concreto.

## Notas de versión

Consulta la [última versión](https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest) y [CHANGELOG.md](../CHANGELOG.md) para ver las novedades.

## Enlaces

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
