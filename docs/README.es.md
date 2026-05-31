# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

Deno Custom Nodes es un conjunto de nodos personalizados para ComfyUI, pensado para mejorar flujos reales de imagen, video, LTX, RTX y preparación de modelos.

Esta página es una guía rápida en español. Los detalles completos de cada nodo se mantienen en el [README](../README.md) en inglés.

![DENO Visual Fold](images/deno-visual-fold.webp)

## Enlaces Rápidos

- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- ComfyUI Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
- YouTube: https://www.youtube.com/@Denoise-AI
- Video Compare: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/
- Video to GIF/WebP: https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/
- Guía de instalación RTX VFX: https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/

## Instalación

La forma más sencilla es instalar `deno-custom-nodes` desde ComfyUI Manager o desde Registry.

Para instalar manualmente, ejecuta este comando dentro de la carpeta `custom_nodes` de ComfyUI y reinicia ComfyUI.

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

## Funciones Principales

- DENO Visual Fold: pliega visualmente nodos o grupos grandes sin cambiar la lógica del workflow.
- Video Compare Web Tool: compara dos videos en el navegador con slider, vista lado a lado y diferencia.
- Video to GIF/WebP Web Tool: recorta clips cortos y exporta GIF o WebP más pequeño.
- RTX Video Super Resolution Node: permite probar NVIDIA RTX VFX dentro de ComfyUI.
- LTX Tools: organiza carga de modelos LTX 2.3, secuencias, LoRA y prompts.
- Image Loader and Compare Nodes: carga varias imágenes, ajusta tamaño y compara resultados en el canvas.

## Resumen de Nodos

- `(Deno) Resize Box`: organiza resolución, proporciones, megapíxeles y modos crop/fit.
- `(Deno) Multi Image Loader`: carga varias imágenes con upload, paste y navegación de carpetas.
- `(Deno) Advanced Image Source Loader`: trabaja con carpetas externas, rutas locales, URL de imágenes y listas de tamaños mixtos.
- `(Deno) Image Compare`: compara dos imágenes directamente en el canvas de ComfyUI.
- `(Deno) Video Compare`: compara dos lotes de video por frame y genera una salida de comparación.
- `(Deno) Video Preview`: previsualiza resultados de video intermedios en estado codificado real.
- `(Deno) RTX Video Super Resolution`: ejecuta upscale con NVIDIA VFX de forma sencilla.
- `(Deno) RTX Video Super Resolution (2 Pass)`: separa Denoise/Deblur y upscale en dos pasadas.
- `(Deno) LTX Sequencer`: ordena el flujo de strength en workflows LTX con múltiples imágenes.
- `(Deno) LTX Model Loader`: reúne patrones de carga Checkpoint, KJ y GGUF para LTX 2.3.
- `(Deno) Easy Model Download Helper`: guía la instalación de modelos recomendados con enlaces y rutas claras.
- `(Deno) LTX Multi LoRA Loader`: gestiona varios LoRA de LTX y sus trigger words en un nodo.
- `(Deno) LTX Prompt Guide`: organiza prompts LTX, negative prompts y estimación de duración de diálogos.

## Para Principiantes

- Si algo falla, comparte el mensaje de error y una captura de la pantalla de ComfyUI.
- Oculta tokens, contraseñas y códigos de verificación antes de compartir capturas.
- Para problemas de RTX VFX, cierra ComfyUI por completo y sigue la guía de instalación paso a paso.
- Consulta el [README](../README.md) en inglés para todas las opciones y capturas de nodos.
