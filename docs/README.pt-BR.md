# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

Deno Custom Nodes é um pacote de nós personalizados para ComfyUI, feito para deixar fluxos reais de imagem, vídeo, LTX, RTX e preparação de modelos mais rápidos, claros e práticos no uso diário. A maioria dos nós Deno inclui um pequeno botão verde `i` para abrir uma ajuda rápida sem sair do canvas do ComfyUI.

## Release Notes

As atualizações públicas ficam registradas em [CHANGELOG.md](../CHANGELOG.md) em formato curto.

## Web Tools

Ferramentas que rodam direto no navegador.

- [DENO Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - compara dois vídeos renderizados com slider, lado a lado, diferença e toggle.
- [DENO Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - corta, recorta, redimensiona e exporta clipes curtos como GIF ou WebP menor.

## DENO Visual Fold

![DENO Visual Fold](images/deno-visual-fold.webp)

DENO Visual Fold é uma ajuda visual para organizar grafos grandes do ComfyUI. Dobrar nós ou grupos não muda a lógica do workflow.

Ao selecionar dois ou mais nós, aparece um botão verde `Fold` perto do canto superior direito do canvas. Ao clicar, os nós selecionados ficam compactados em um grupo visual e podem voltar com `Unfold`. Ao selecionar um grupo comum do ComfyUI, `Fold Group` dobra os nós dentro do grupo; com vários grupos selecionados também aparecem ações de alinhamento.

Diferente do Subgraph, o Visual Fold não move nós para um grafo filho. Ele serve apenas para organização visual, útil quando você quer manter nós `Get` / `Set` ou a estrutura pai-filho visível no grafo principal.

## Included Nodes

### `(Deno) Ideogram Director`

Visual Ideogram 4 prompt builder for structured JSON captions and bbox layout work.

![Deno Ideogram Director](images/ideogram-director.png)

Main features: draw and edit bbox regions, import JSON prompts from Local LLM Loader or another STRING source, ask before replacing an existing board, reject malformed JSON clearly, use style/layout preset galleries, and optionally output model-ready English while preserving literal TEXT box words.

### `(Deno) Resize Box`

Nó de resolução e redimensionamento de imagem para ComfyUI.

![Deno Resize Box](images/resize-box.jpg)

Principais recursos: presets de proporção, entrada manual, cálculo por megapixels, alinhamento `divisible_by`, modos Center Crop e Fit, preview de proporção dentro do nó, saídas `image`, `width`, `height`.

### `(Deno) Multi Image Loader`

Carregador de várias imagens pensado para workflows de guia em lote.

![Deno Multi Image Loader](images/multi-image-loader.jpg)

Principais recursos: galeria de altura fixa, reordenação por arrastar, upload, drag-and-drop, colar imagem, navegação pela pasta `input`, subpastas, ordenação por data recente, redimensionamento por proporção/preset/manual, saídas `multi_output`, `width`, `height`.

### `(Deno) Advanced Image Source Loader`

Carregador avançado para workflows que usam pastas externas, caminhos locais, URLs de imagem e listas com tamanhos mistos.

![Deno Advanced Image Source Loader](images/advanced-image-source-loader.png)

Principais recursos: suporte a `input` e pastas locais externas, entrada URL/Path, upload e paste, ativar/desativar miniaturas, reordenar, galeria estilo masonry, pastas recursivas, saída batch tensor e `image_list`.

### `(Deno) Image Compare`

Nó de comparação A/B para verificar duas imagens diretamente no canvas do ComfyUI.

![Deno Image Compare](images/image-compare.jpg)

Principais recursos: compara `image_a` e `image_b`, modos Slider/Side by Side/Difference/Toggle, slider por hover, etiquetas A/B, botão Swap e preview interno redimensionável.

### `(Deno) Video Compare`

Nó de comparação A/B para revisar resultados de upscale e interpolação FPS dentro do canvas do ComfyUI.

Principais recursos: `video_a`, `video_b`, áudio opcional, modos Slider/Side by Side/Difference/Toggle, play/pause, scrub, frame step, velocidade, loop, badges opcionais e saída `comparison`.

Se o nó for pesado para o seu fluxo, use a ferramenta web: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/

![Deno Video Compare - Slider](images/video-compare.png)

![Deno Video Compare - Side by Side](images/video-compare-sbs.png)

![Deno Video Compare - Difference](images/video-compare-diff.png)

### `(Deno) Video Preview`

Preview de vídeo em resolução completa para conferir uma saída codificada real em qualquer ponto do grafo.

![Deno Video Preview](images/video-preview.jpg)

Principais recursos: entrada IMAGE batch e saída direta, áudio opcional, hover para ouvir, clique para play/pause, botão Full screen, badge de resolução/FPS/frames/duração e aviso claro se faltar PyAV.

### `(Deno) RTX Video Super Resolution`

Nó opcional para Windows/NVIDIA RTX que permite testar NVIDIA RTX Video Super Resolution dentro do ComfyUI.

![Deno RTX Video Super Resolution](images/rtx-vfx-easy-upscale-node.png)

Fluxo para iniciantes: instale ou atualize `deno-custom-nodes`, inicie o ComfyUI, adicione o nó e execute uma vez. Se faltar NVIDIA VFX, feche o ComfyUI completamente, abra `How to install`, siga o guia, confirme que o caminho mostrado pelo BAT pertence ao ComfyUI certo e reinicie o ComfyUI no final.

Links oficiais da NVIDIA: [NVIDIA Maxine Windows Getting Started](https://docs.nvidia.com/deeplearning/maxine/vfx-sdk-programming-guide/index.html), [RTX Video FAQ](https://nvidia.custhelp.com/app/answers/detail/a_id/5448/~/rtx-video-faq).

### `(Deno) RTX Video Super Resolution (2 Pass)`

Nó RTX de duas passagens para acabamento de vídeo. Ele pode executar primeiro `Denoise` ou `Deblur` no mesmo tamanho, e depois um upscale `VSR` ou `High Bitrate`.

Workflow de exemplo: [RTX 2-pass upscale workflow](workflows/deno-rtx-lowram-metabatch.json)

Principais recursos: rotas Low System Memory e High System Memory, processamento em chunks com VHS Meta Batch, preservação de FPS e áudio, pensado para saídas reais de vídeo.

### `(Deno) LTX Sequencer`

Sequenciador de guias para workflows LTX com várias imagens.

![Deno LTX Sequencer](images/ltx-sequencer.jpg)

Principais recursos: trabalha com a saída batch do `(Deno) Multi Image Loader`, pode preencher `num_images`, mantém o fluxo sync, permite controle manual de strength quando necessário e inclui bypass para A/B rápido.

### `(Deno) LTX Model Loader`

Carregador compacto para padrões comuns de modelos LTX 2.3.

![Deno LTX Model Loader](images/ltx-model-loader.jpg)

Principais recursos: Checkpoint Style, KJ Style e GGUF Style, saídas `model`, `clip`, `video_vae`, `audio_vae`, compatível com loaders do ComfyUI, KJNodes e ComfyUI-GGUF.

### `(Deno) Easy Model Download Helper`

Assistente baseado em presets para instalar conjuntos recomendados de arquivos de modelo.

![Deno Easy Model Download Helper](images/easy-model-download-helper.png)

Principais recursos: abre links oficiais no navegador em vez de baixar via Python, mostra raízes de modelos do ComfyUI, salva creator presets no workflow, suporta Hugging Face e Civitai, e verifica se os arquivos estão na pasta correta.

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

### `(Deno) LTX Multi LoRA Loader`

Carregador multi LoRA estilo Power-LoRA para workflows LTX.

![Deno LTX Multi LoRA Loader](images/ltx-multi-lora-loader.png)

Principais recursos: vários LoRAs em um nó, ativação por slot, strength/video/audio strength, trigger word e notas por LoRA, copiar trigger words, saídas `model` e `clip` corrigidas.

### `(Deno) LTX Prompt Guide`

Assistente que combina prompt encoding para LTX, negative prompt opcional, conditioning LTX e planejamento de duração de diálogo.

![Deno LTX Prompt Guide](images/ltx-prompt-guide.png)

Principais recursos: positive prompt encoding, negative prompt dobrável, LTX conditioning com `frame_rate`, estimativa de duração a partir de diálogos entre aspas e suporte Auto/Korean/English/Japanese/Chinese.

### `(Deno) Bernini Prompt Guide`

Assistente de prompts para prefixos KJ-style Bernini. Ele junta positive e negative prompt encoding em um nó mais fácil para iniciantes e mostra no topo o system prompt correspondente ao modo `System Prompt` escolhido.

![Deno Bernini Prompt Guide](images/bernini-prompt-guide.jpg)

Principais recursos: seletor `System Prompt` com modos legíveis como `Text to Video`, `Image to Video` e `Reference Video Edit`, hint automático de nomes `image0` / `image1` em modos de referência, negative prompt dobrável, preenchimento automático do preset negativo Official Wan2.2 e saídas `positive` / `negative`.

O negative preset não é um modo de saída. Ele apenas preenche a caixa de negative prompt; depois você pode editar essa caixa diretamente e o texto final será codificado como negative conditioning.

Escreva o prompt como uma instrução para um chatbot, não como uma lista de tags. Exemplo: `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`

Nota: este nó prepara apenas text conditioning. Bernini visual conditioning ainda precisa de um backend ComfyUI/KJ que suporte Bernini context latents.
Enquanto esse suporte ainda estiver como draft PR do ComfyUI, use `tools/DENO_Bernini_Preview_Backend_Update.bat` apenas em uma pasta portable ComfyUI copiada para testes.

## Why This Exists

Esses nós reduzem atritos repetidos no trabalho real com ComfyUI. O objetivo não é ter uma lista enorme de recursos, mas tornar os workflows diários mais rápidos, limpos e fáceis de ensinar.

## Search Tips

Você pode pesquisar por `deno custom nodes`, `ideogram`, `ideogram 4`, `ideogram director`, `json prompt`, `bbox`, `bounding boxes`, `layout prompt`, `rtx video super resolution`, `nvidia vfx`, `image compare`, `video compare`, `video preview`, `video to gif`, `gif webp`, `ltx 2.3`, `ltx model loader`, `ltx multi lora`, `prompt guide`, `system prompt`, `local llm loader`, `local llm prompt`, `local llm reviewer`, `prompt only`, `final prompt`, `bernini`, `bernini prompt guide`, `reference video edit`, `wan2.2`, `visual fold`.

## Install

Clone dentro da pasta `custom_nodes` do ComfyUI:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

Depois reinicie o ComfyUI.

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
