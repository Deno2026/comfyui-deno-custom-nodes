# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

Deno Custom Nodes é um pacote de nós personalizados para ComfyUI, feito para deixar fluxos reais de imagem, vídeo, LTX, RTX e preparação de modelos mais rápidos e fáceis de usar.

Esta página é um guia rápido em português do Brasil. Os detalhes completos de cada nó continuam no [README](../README.md) em inglês.

![DENO Visual Fold](images/deno-visual-fold.webp)

## Links Rápidos

- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- ComfyUI Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
- YouTube: https://www.youtube.com/@Denoise-AI
- Video Compare: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/
- Video to GIF/WebP: https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/
- Guia de instalação RTX VFX: https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/

## Instalação

O jeito mais simples é instalar `deno-custom-nodes` pelo ComfyUI Manager ou pelo Registry.

Para instalar manualmente, rode este comando dentro da pasta `custom_nodes` do ComfyUI e reinicie o ComfyUI.

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

## Principais Recursos

- DENO Visual Fold: dobra visualmente nós ou grupos grandes sem mudar a lógica do workflow.
- Video Compare Web Tool: compara dois vídeos no navegador com slider, lado a lado e diferença.
- Video to GIF/WebP Web Tool: corta clipes curtos e exporta GIF ou WebP menor.
- RTX Video Super Resolution Node: permite testar NVIDIA RTX VFX dentro do ComfyUI.
- LTX Tools: organiza carregamento de modelos LTX 2.3, sequências, LoRA e prompts.
- Image Loader and Compare Nodes: carrega várias imagens, ajusta tamanho e compara resultados no canvas.

## Resumo dos Nós

- `(Deno) Resize Box`: organiza resolução, proporção, megapixels e modos crop/fit.
- `(Deno) Multi Image Loader`: carrega várias imagens com upload, colar e navegação por pastas.
- `(Deno) Advanced Image Source Loader`: trabalha com pastas externas, caminhos locais, URLs de imagem e listas com tamanhos mistos.
- `(Deno) Image Compare`: compara duas imagens diretamente no canvas do ComfyUI.
- `(Deno) Video Compare`: compara dois lotes de vídeo por frame e gera uma imagem de comparação.
- `(Deno) Video Preview`: pré-visualiza resultados intermediários de vídeo no estado realmente codificado.
- `(Deno) RTX Video Super Resolution`: executa upscale com NVIDIA VFX de forma simples.
- `(Deno) RTX Video Super Resolution (2 Pass)`: separa Denoise/Deblur e upscale em duas passagens.
- `(Deno) LTX Sequencer`: organiza o fluxo de strength em workflows LTX com várias imagens.
- `(Deno) LTX Model Loader`: junta padrões de carregamento Checkpoint, KJ e GGUF para LTX 2.3.
- `(Deno) Easy Model Download Helper`: guia a instalação de modelos recomendados com links e pastas claras.
- `(Deno) LTX Multi LoRA Loader`: gerencia vários LoRAs LTX e trigger words em um só nó.
- `(Deno) LTX Prompt Guide`: organiza prompts LTX, negative prompts e estimativa de duração de diálogo.

## Para Iniciantes

- Se algo der errado, compartilhe a mensagem de erro e uma captura da tela do ComfyUI.
- Esconda tokens, senhas e códigos de verificação antes de compartilhar capturas.
- Para problemas de RTX VFX, feche o ComfyUI completamente e siga o guia de instalação passo a passo.
- Veja o [README](../README.md) em inglês para todas as opções e capturas dos nós.
