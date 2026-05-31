# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

Deno Custom Nodes é um conjunto de nós personalizados para ComfyUI, criado para tornar fluxos reais de imagem, vídeo, LTX, RTX e preparação de modelos mais rápidos e fáceis de usar.

Esta página é um guia rápido em português europeu. Os detalhes completos de cada nó continuam no [README](../README.md) em inglês.

![DENO Visual Fold](images/deno-visual-fold.webp)

## Ligações Rápidas

- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- ComfyUI Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
- YouTube: https://www.youtube.com/@Denoise-AI
- Video Compare: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/
- Video to GIF/WebP: https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/
- Guia de instalação RTX VFX: https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/

## Instalação

A forma mais simples é instalar `deno-custom-nodes` através do ComfyUI Manager ou do Registry.

Para instalar manualmente, executa este comando dentro da pasta `custom_nodes` do ComfyUI e reinicia o ComfyUI.

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

## Funcionalidades Principais

- DENO Visual Fold: dobra visualmente nós ou grupos grandes sem alterar a lógica do workflow.
- Video Compare Web Tool: compara dois vídeos no navegador com slider, lado a lado e diferença.
- Video to GIF/WebP Web Tool: corta clips curtos e exporta GIF ou WebP mais pequeno.
- RTX Video Super Resolution Node: permite testar NVIDIA RTX VFX dentro do ComfyUI.
- LTX Tools: organiza carregamento de modelos LTX 2.3, sequências, LoRA e prompts.
- Image Loader and Compare Nodes: carrega várias imagens, ajusta tamanho e compara resultados no canvas.

## Resumo dos Nós

- `(Deno) Resize Box`: organiza resolução, proporções, megapíxeis e modos crop/fit.
- `(Deno) Multi Image Loader`: carrega várias imagens com upload, colar e navegação por pastas.
- `(Deno) Advanced Image Source Loader`: trabalha com pastas externas, caminhos locais, URLs de imagens e listas com tamanhos mistos.
- `(Deno) Image Compare`: compara duas imagens diretamente no canvas do ComfyUI.
- `(Deno) Video Compare`: compara dois batches de vídeo frame a frame e gera uma imagem de comparação.
- `(Deno) Video Preview`: pré-visualiza resultados de vídeo intermédios no estado realmente codificado.
- `(Deno) RTX Video Super Resolution`: executa upscale com NVIDIA VFX de forma simples.
- `(Deno) RTX Video Super Resolution (2 Pass)`: separa Denoise/Deblur e upscale em duas passagens.
- `(Deno) LTX Sequencer`: organiza o fluxo de strength em workflows LTX com várias imagens.
- `(Deno) LTX Model Loader`: junta padrões de carregamento Checkpoint, KJ e GGUF para LTX 2.3.
- `(Deno) Easy Model Download Helper`: guia a instalação de ficheiros de modelo recomendados com ligações e pastas claras.
- `(Deno) LTX Multi LoRA Loader`: gere vários LoRA LTX e trigger words num só nó.
- `(Deno) LTX Prompt Guide`: organiza prompts LTX, negative prompts e estimativa de duração de diálogo.

## Para Iniciantes

- Se algo falhar, partilha a mensagem de erro e uma captura do ecrã do ComfyUI.
- Esconde tokens, palavras-passe e códigos de verificação antes de partilhar capturas.
- Para problemas de RTX VFX, fecha completamente o ComfyUI e segue o guia de instalação passo a passo.
- Consulta o [README](../README.md) em inglês para todas as opções e capturas dos nós.
