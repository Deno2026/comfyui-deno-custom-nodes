# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

![Deno Custom Nodes banner](images/deno-custom-nodes-banner.jpg)

Deno Custom Nodes é um conjunto de nós personalizados para ComfyUI, criado para tornar workflows reais de imagem, vídeo, LTX, RTX e preparação de modelos mais rápidos, claros e práticos no dia a dia. A maioria dos nós Deno inclui um pequeno botão verde `i` para consultar ajuda rápida sem sair do canvas do ComfyUI. Se existir uma nova versão do Deno Custom Nodes, o botão fica amarelo e mostra um pequeno emblema `!`.

## Release Notes

As atualizações públicas são registadas em [CHANGELOG.md](../CHANGELOG.md) num formato curto.

## Web Tools

Ferramentas que podes executar diretamente no navegador.

- [DENO Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - compara dois vídeos renderizados com slider, lado a lado, diferença e toggle.
- [DENO Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - corta, recorta, redimensiona e exporta clips curtos como GIF ou WebP mais leve.

## DENO Visual Fold

![DENO Visual Fold](images/deno-visual-fold.webp)

DENO Visual Fold é uma ajuda visual para organizar grandes grafos do ComfyUI. Dobrar nós ou grupos não altera a lógica do workflow.

Ao selecionar dois ou mais nós, aparece um botão verde `Fold` perto do canto superior direito do canvas. Ao clicar, os nós selecionados ficam compactados num grupo visual e podem ser restaurados com `Unfold`. Ao selecionar um grupo normal do ComfyUI, `Fold Group` dobra os nós dentro desse grupo; com vários grupos selecionados aparecem também ações de alinhamento.

Ao contrário do Subgraph, Visual Fold não move os nós para um grafo filho. É apenas organização visual, útil quando queres manter nós `Get` / `Set` ou a estrutura pai-filho visível no grafo principal.

## Included Nodes

### `(Deno) Ideogram Director`

Visual Ideogram 4 prompt builder for structured JSON captions and bbox layout work.

![Deno Ideogram Director](images/ideogram-director.png)

Main features: draw and edit bbox regions, import JSON prompts from Local LLM Loader or another STRING source, ask before replacing an existing board, reject malformed JSON clearly, use style/layout preset galleries, and use Language view to read/edit board descriptions in your language while final output stays model-ready English and literal TEXT box words stay exact.

### `(Deno) Resize Box`

Nó de resolução e redimensionamento de imagem para ComfyUI.

![Deno Resize Box](images/resize-box.jpg)

Funcionalidades principais: presets de proporção, entrada manual, cálculo por megapíxeis, alinhamento `divisible_by`, modos Center Crop e Fit, preview de proporção dentro do nó, saídas `image`, `width`, `height`.

### `(Deno) Multi Image Loader`

Carregador de várias imagens pensado para workflows de guia por batch.

![Deno Multi Image Loader](images/multi-image-loader.jpg)

Funcionalidades principais: galeria de altura fixa, reordenação por arrastar, upload, drag-and-drop, colar imagem, navegação pela pasta `input`, suporte a subpastas, ordenação por data recente, redimensionamento por proporção/preset/manual, saídas `multi_output`, `width`, `height`.

### `(Deno) Advanced Image Source Loader`

Carregador avançado para workflows que precisam de pastas externas, caminhos locais, URLs de imagens e listas com tamanhos mistos.

![Deno Advanced Image Source Loader](images/advanced-image-source-loader.png)

Funcionalidades principais: suporte a `input` e pastas locais externas, entrada URL/Path, upload e paste, ativar/desativar miniaturas, reordenação, galeria estilo masonry, pastas recursivas, saída batch tensor e `image_list`.

### `(Deno) Image Compare`

Nó de comparação A/B para verificar duas imagens diretamente no canvas do ComfyUI.

![Deno Image Compare](images/image-compare.jpg)

Funcionalidades principais: compara `image_a` e `image_b`, modos Slider/Side by Side/Difference/Toggle, slider por hover, etiquetas A/B, botão Swap e preview interno redimensionável.

### `(Deno) Video Compare`

Nó de comparação A/B para verificar resultados de upscale e interpolação FPS dentro do canvas do ComfyUI.

Funcionalidades principais: `video_a`, `video_b`, áudio opcional, modos Slider/Side by Side/Difference/Toggle, play/pause, scrub, frame step, velocidade, loop, badges opcionais e saída `comparison`.

Se o nó for pesado para o teu fluxo, usa a ferramenta web: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/

![Deno Video Compare - Slider](images/video-compare.png)

![Deno Video Compare - Side by Side](images/video-compare-sbs.png)

![Deno Video Compare - Difference](images/video-compare-diff.png)

### `(Deno) Video Preview`

Preview de vídeo em resolução completa para verificar uma saída codificada real em qualquer ponto do grafo.

![Deno Video Preview](images/video-preview.jpg)

Funcionalidades principais: entrada IMAGE batch e saída direta, áudio opcional, hover para ouvir, clique para play/pause, botão Full screen, badge de resolução/FPS/frames/duração e aviso claro se faltar PyAV.

### `(Deno) RTX Video Super Resolution`

Nó opcional para Windows/NVIDIA RTX que permite experimentar NVIDIA RTX Video Super Resolution dentro do ComfyUI.

![Deno RTX Video Super Resolution](images/rtx-vfx-easy-upscale-node.png)

Fluxo para iniciantes: instala ou atualiza `deno-custom-nodes`, inicia o ComfyUI, adiciona o nó e executa uma vez. Se faltar NVIDIA VFX, fecha completamente o ComfyUI, abre `How to install`, segue o guia, confirma que o caminho mostrado pelo BAT pertence ao ComfyUI correto e reinicia o ComfyUI no final.

Ligações oficiais NVIDIA: [NVIDIA Maxine Windows Getting Started](https://docs.nvidia.com/deeplearning/maxine/vfx-sdk-programming-guide/index.html), [RTX Video FAQ](https://nvidia.custhelp.com/app/answers/detail/a_id/5448/~/rtx-video-faq).

### `(Deno) RTX Video Super Resolution (2 Pass)`

Nó RTX de duas passagens para acabamento de vídeo. Pode executar primeiro `Denoise` ou `Deblur` no mesmo tamanho, e depois um upscale `VSR` ou `High Bitrate`.

Workflow de exemplo: [RTX 2-pass upscale workflow](workflows/deno-rtx-lowram-metabatch.json)

Funcionalidades principais: rotas Low System Memory e High System Memory, processamento em chunks com VHS Meta Batch, preservação de FPS e áudio, pensado para saídas reais de vídeo.

### `(Deno) LTX Sequencer`

Sequenciador de guias para workflows LTX com várias imagens.

![Deno LTX Sequencer](images/ltx-sequencer.jpg)

Funcionalidades principais: trabalha com a saída batch do `(Deno) Multi Image Loader`, pode preencher `num_images`, mantém o fluxo sync, permite controlo manual de strength quando necessário e inclui bypass para A/B rápido.

### `(Deno) LTX Model Loader`

Carregador compacto para padrões comuns de modelos LTX 2.3.

![Deno LTX Model Loader](images/ltx-model-loader.jpg)

Funcionalidades principais: Checkpoint Style, KJ Style e GGUF Style, saídas `model`, `clip`, `video_vae`, `audio_vae`, compatível com loaders do ComfyUI, KJNodes e ComfyUI-GGUF.

### `(Deno) Easy Model Download Helper`

Assistente baseado em presets para instalar conjuntos recomendados de ficheiros de modelo.

![Deno Easy Model Download Helper](images/easy-model-download-helper.png)

Funcionalidades principais: abre ligações oficiais no navegador em vez de descarregar via Python, mostra raízes de modelos do ComfyUI, guarda creator presets no workflow, suporta Hugging Face e Civitai, e verifica se os ficheiros estão na pasta correta.

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

### `(Deno) LTX Multi LoRA Loader`

Carregador multi LoRA estilo Power-LoRA para workflows LTX.

![Deno LTX Multi LoRA Loader](images/ltx-multi-lora-loader.png)

Funcionalidades principais: vários LoRA num só nó, ativação por slot, strength/video/audio strength, trigger word e notas por LoRA, cópia de trigger words, saídas `model` e `clip` corrigidas.

### `(Deno) LTX Prompt Guide`

Assistente que combina prompt encoding para LTX, negative prompt opcional, conditioning LTX e planeamento de duração de diálogo.

![Deno LTX Prompt Guide](images/ltx-prompt-guide.png)

Funcionalidades principais: positive prompt encoding, negative prompt dobrável, LTX conditioning com `frame_rate`, estimativa de duração a partir de diálogo entre aspas e suporte Auto/Korean/English/Japanese/Chinese.

### `(Deno) Bernini Prompt Guide`

Assistente de prompts para prefixos KJ-style Bernini. Junta positive e negative prompt encoding num nó mais fácil para iniciantes e mostra no topo o system prompt correspondente ao modo `System Prompt` escolhido.

![Deno Bernini Prompt Guide](images/bernini-prompt-guide.jpg)

Funcionalidades principais: seletor `System Prompt` com modos legíveis como `Text to Video`, `Image to Video` e `Reference Video Edit`, hint automático de nomes `image0` / `image1` em modos de referência, negative prompt dobrável, preenchimento automático do preset negativo Official Wan2.2 e saídas `positive` / `negative`.

O negative preset não é um modo de saída. Apenas preenche a caixa de negative prompt; depois podes editar essa caixa diretamente e o texto final será codificado como negative conditioning.

Escreve o prompt como uma instrução para um chatbot, não como uma lista de tags. Exemplo: `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`

Nota: este nó prepara apenas text conditioning. Bernini visual conditioning ainda precisa de um backend ComfyUI/KJ que suporte Bernini context latents.
Enquanto esse suporte ainda estiver como draft PR do ComfyUI, usa `tools/DENO_Bernini_Preview_Backend_Update.bat` apenas numa pasta portable ComfyUI copiada para testes.

## Why This Exists

Estes nós reduzem fricções repetidas no trabalho real com ComfyUI. O objetivo não é ter uma lista enorme de funcionalidades, mas tornar os workflows diários mais rápidos, limpos e fáceis de ensinar.

## Search Tips

Podes procurar por `deno custom nodes`, `ideogram`, `ideogram 4`, `ideogram director`, `json prompt`, `bbox`, `bounding boxes`, `layout prompt`, `rtx video super resolution`, `nvidia vfx`, `image compare`, `video compare`, `video preview`, `video to gif`, `gif webp`, `ltx 2.3`, `ltx model loader`, `ltx multi lora`, `prompt guide`, `system prompt`, `local llm loader`, `local llm prompt`, `local llm reviewer`, `prompt only`, `final prompt`, `bernini`, `bernini prompt guide`, `reference video edit`, `wan2.2`, `visual fold`.

## Install

Clona dentro da pasta `custom_nodes` do ComfyUI:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

Depois reinicia o ComfyUI.

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
