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
  <b>Nós práticos de ComfyUI para todo o ciclo de produção.</b><br>
  Prepara as entradas, dirige o modelo, compara resultados, finaliza o aspeto e mantém os grafos grandes legíveis.
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja.md">日本語</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.es.md">Español</a> · Português (PT) · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.id.md">Bahasa Indonesia</a>
</p>

<p align="center">
  <a href="#início-rápido">Início rápido</a> · <a href="#mapa-de-workflows">Mapa de workflows</a> · <a href="#ferramentas-web">Ferramentas web</a> · <a href="#nós-incluídos">Referência dos nós</a> · <a href="#segurança-e-privacidade">Segurança</a> · <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest">Última versão</a>
</p>

> [!NOTE]
> **Novidade na v0.7.126:** o [`(Deno) MiniMax H3 Tiled Sampler`](#deno-minimax-h3-tiled-sampler) finaliza um latent de vídeo+áudio MiniMax H3 ampliado em tiles sobrepostos, para que uma GPU de 16GB consiga executar a passagem final em alta resolução.
>
> A **v0.7.125** restringiu os endereços de servidor do Local LLM, as ligações do Easy Model Download Helper e a gravação de imagens do Ideogram Director. Os IDs dos nós, as entradas e os workflows guardados não mudam. Consulta o [CHANGELOG](../CHANGELOG.md).

## Início rápido

Começa com uma instalação do ComfyUI a funcionar.

1. Abre o **ComfyUI Manager**, procura `Deno Custom Nodes` e instala o pacote.
2. Reinicia o ComfyUI e atualiza a página no navegador.
3. Faz duplo clique numa zona vazia do canvas, procura `(Deno) Resize Box` e adiciona-o.
4. Adiciona um nó `Load Image` padrão e escolhe uma imagem. Liga-o ao Resize Box e liga a saída `image` do Resize Box a `Preview Image`. Escolhe um tamanho e executa o workflow para ver a imagem redimensionada.

Este primeiro exemplo não precisa de nenhum modelo de geração. Cada nó de modelo ou RTX indica abaixo os seus próprios requisitos. Se não usas o Manager, consulta a [instalação manual](#instalação).

A maioria dos nós Deno inclui um pequeno botão verde `i` no canto superior direito, para consultar rapidamente a informação do nó sem sair do canvas. Quando existe uma versão mais recente do Deno Custom Nodes, o botão fica amarelo e mostra um pequeno emblema `!`.

## Mapa de workflows

<p align="center">
  <img src="images/readme/workflow-map.webp" alt="Mapa de workflows: Preparar, Gerar, Comparar, Finalizar, Organizar" width="920">
</p>

Cada nó Deno pertence a uma etapa do ciclo de produção do ComfyUI. Começa pela etapa em que estás a trabalhar.

### 01 · Preparar

Acerta em todas as imagens, referências e tamanhos antes de o modelo correr.

<p align="center">
  <img src="images/readme/multi-image-loader.webp" alt="Multi Image Loader com seis imagens, uma desativada" width="370">&nbsp;&nbsp;
  <img src="images/readme/h3-reference-loader.webp" alt="MiniMax H3 Multi Reference Image Loader com três imagens e duas referências de áudio" width="370">
</p>

| Nó | O que faz | Requisitos |
| --- | --- | --- |
| [Resize Box](#deno-resize-box) | Redimensionamento por proporção, megapíxeis e recorte, com pré-visualização de recorte em direto e arrastável | — |
| [Multi Image Loader](#deno-multi-image-loader) | Uma galeria ordenada e um só cabo; clica num cartão para o ignorar sem o eliminar | — |
| [Advanced Image Source Loader](#deno-advanced-image-source-loader) | Upload de pastas, lotes encadeados e saída `image_list` com tamanhos mistos | — |
| [MiniMax H3 Multi Reference Image Loader](#deno-minimax-h3-multi-reference-image-loader) | Até 9 imagens e 3 ficheiros de áudio, cada um mantido no seu próprio tamanho | ComfyUI 0.30.0+ |

### 02 · Gerar

Dirige o modelo com layouts, referências, prompts e LoRAs que se mantêm legíveis no canvas.

<p align="center">
  <img src="images/readme/ideogram-director.webp" alt="Board do Ideogram Director com caixas de título, sujeito, carro e slogan sobre o cartaz gerado" width="640">
</p>

| Nó | O que faz | Requisitos |
| --- | --- | --- |
| [Ideogram Director](#deno-ideogram-director) | Desenha layouts bbox e cria captions JSON do Ideogram 4 prontos para o modelo | Um workflow Ideogram 4 |
| [MiniMax H3 Acc LoRA Loader](#deno-minimax-h3-acc-lora-loader) | Carrega os Acc-LoRAs H3 oficiais de 8 passos da Alibaba sem conversão | Pesos Acc-LoRA oficiais |
| [MiniMax H3 Tiled Sampler](#deno-minimax-h3-tiled-sampler) | Finaliza vídeo H3 ampliado em tiles sobrepostos numa GPU de 16GB | ComfyUI 0.30.0+ com H3 nativo |
| [MiniMax H3 R2V Audio Reference workflow](#minimax-h3-r2v-audio-reference-workflow) | `(Deno) Audio Transcript` e `(Deno) Audio Analysis Finalizer` transformam o áudio de origem em direção para o prompt | VideoHelperSuite, LM Studio |
| [LTX Model Loader](#deno-ltx-model-loader) | Padrões de carregamento Checkpoint, KJ e GGUF num só nó compacto | KJNodes ou ComfyUI-GGUF para esses modos |
| [LTX Sequencer](#deno-ltx-sequencer) | Sequenciação de guias com várias imagens, com frame e strength por imagem | — |
| [LTX Multi LoRA Loader](#deno-ltx-multi-lora-loader) | Linhas ao estilo Power-LoRA com strength de vídeo e de áudio separadas | — |
| [LTX Prompt Guide](#deno-ltx-prompt-guide) | Codificação de prompts LTX com um mínimo de duração calculado a partir do diálogo entre aspas | — |
| [LTX Tiled Spatial Upscaler](#deno-ltx-tiled-spatial-upscaler) | Amplia video latents em tiles espaciais sobrepostos | Um upscaler de latents LTX |
| [LTX High resolution Tiled Sampler](#deno-ltx-high-resolution-tiled-sampler) | Refinamento LTX AV em alta resolução através de tiles espaciais fundidos | — |
| [Bernini Prompt Guide](#deno-bernini-prompt-guide) | Prompts positive e negative em estilo de instrução num só nó | Conditioning Bernini nativo |
| [Multi LoRA Loader](#deno-multi-lora-loader) | Até 64 LoRAs com interruptores, strengths e notas por slot | — |
| [Easy Model Download Helper](#deno-easy-model-download-helper) | Ligações oficiais de modelos e verificação exata do caminho de destino | — |
| [Text Encoder Unload](#deno-text-encoder-unload) | Um ponto opcional de libertação de VRAM depois da codificação do prompt | — |
| [Prompt Text](#deno-prompt-text) | Uma fonte STRING multilinha legível para prompts longos | — |
| [Local LLM Loader e Reviewer](#deno-local-llm-loader-and-deno-local-llm-reviewer) | Prompts de LLM local a partir do ComfyUI e portas de revisão antes de guardar | Um servidor LLM local |

### 03 · Comparar

Vê a diferença no canvas antes de guardares seja o que for.

<p align="center">
  <img src="images/readme/video-compare.webp" alt="Slider do Video Compare entre um vídeo nítido e um vídeo de baixa resolução de um lago" width="370">&nbsp;&nbsp;
  <img src="images/readme/image-compare.webp" alt="Slider do Image Compare entre uma imagem nítida e uma imagem pixelizada de uma cidade" width="370">
</p>

| Nó | O que faz | Requisitos |
| --- | --- | --- |
| [Image Compare](#deno-image-compare) | Vistas slider, lado a lado, diferença e toggle dentro do nó | — |
| [Video Compare](#deno-video-compare) | Reprodução A/B de vídeo com precisão ao frame, com áudio e uma saída de comparação sem perdas | — |
| [Video Preview](#deno-video-preview) | Pré-visualização H.264 inline em resolução completa em qualquer ponto do grafo | PyAV (incluído no ComfyUI atual) |

### 04 · Finalizar

Define o aspeto e a resolução finais.

<p align="center">
  <img src="images/readme/film-grain.webp" alt="Controlos do Film Grain junto ao retrato com grão" width="370">&nbsp;&nbsp;
  <img src="images/readme/rtx-vsr.webp" alt="Painel do RTX Video Super Resolution" width="370">
</p>

| Nó | O que faz | Requisitos |
| --- | --- | --- |
| [Film Grain](#deno-film-grain) | Grão de película por CPU para fotos e vídeo, ajustado à resolução | — |
| [RTX Video Super Resolution](#deno-rtx-video-super-resolution) | NVIDIA VSR, High Bitrate, Denoise e Deblur com opções de redimensionamento claras | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |
| [RTX Video Super Resolution (2 Pass)](#deno-rtx-video-super-resolution-2-pass) | Uma passagem de limpeza e uma de ampliação para workflows de vídeo completos | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |

### 05 · Organizar

Mantém os grafos grandes legíveis.

<p align="center">
  <img src="images/readme/visual-fold.webp" alt="Visual Fold: três nós selecionados dobram-se numa só pílula Folded · 3" width="880">
</p>

| Ferramenta | O que faz | Requisitos |
| --- | --- | --- |
| [Visual Fold](#deno-visual-fold) | Dobra nós selecionados ou um grupo numa pílula compacta, sem subgraph | — |
| [Floating Tools](#deno-floating-tools) | Libertar VRAM, estado do ComfyUI Stable e Error Help pronto para GPT/Gemini | Desativado por predefinição |
| [Node info button](#node-info-button) | Ajuda rápida e notas de atualização em cada nó Deno | — |

## Ferramentas web

Executa-as diretamente no navegador. Não há nada para instalar.

- [Deno Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - compara dois vídeos renderizados com vistas slider, lado a lado, diferença e toggle, e guarda a comparação em MP4.
- [Deno Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - corta, recorta, redimensiona e exporta clips curtos como GIF ou como ficheiros WebP mais pequenos.
- [Deno Discord Media Compressor](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - comprime vídeos ou imagens para partilhar no Discord, procurando, quando possível, ficheiros abaixo de 10 MB. A interface desta ferramenta está apenas em coreano.

## Nós incluídos

A referência completa, pela ordem do workflow. Cada secção começa com o que o nó faz; abre **Detalhes** para casos limite e notas de compatibilidade.

### 01 · Preparar

#### `(Deno) Resize Box`

Nó auxiliar de resolução e de redimensionamento de imagem para o ComfyUI.

<img src="images/readme/resize-box.webp" alt="Resize Box no modo Crop Position, com a caixa de recorte sobre a origem e a pré-visualização do resultado" width="652">

Funcionalidades principais:

- modos `Preset Ratio` e `Manual Input`
- presets de proporção comuns
- cálculo de tamanho por megapíxeis
- alinhamento `divisible_by`
- modos de redimensionamento `Center Crop (Fill)`, `Crop Position (Fill)` com zoom e proporção fixa, e `Fit (Letterbox/Pillarbox)`
- interpolação `lanczos` por predefinição
- pré-visualização da proporção em direto; `Crop Position (Fill)` mostra toda a origem ligada, permite arrastar a caixa de recorte para a reposicionar e arrastar qualquer canto para ajustar o zoom, mantendo fixos a proporção e os megapíxeis de saída
- saídas: `image`, `width`, `height`

#### `(Deno) Multi Image Loader`

Carregador de várias imagens pensado para workflows de guia por batch. Inspirado nas ideias originais de workflow de **WhatDreamsCost**, e depois adaptado e refinado para o estilo de workflow Deno.

<img src="images/readme/multi-image-loader.webp" alt="Galeria do Multi Image Loader com cartões numerados e um cartão desativado" width="452">

Funcionalidades principais:

- galeria de altura fixa com scroll, em vez de um nó cuja altura cresce sem parar
- reordenação por arrastar, com inserção estável do marcador de posição
- clica nas miniaturas para desativar/ativar imagens sem as eliminar; só as imagens ativas são enviadas para a saída, numeradas 1, 2, 3… pela ordem dos cartões, e as contagens e os números atualizam-se de imediato
- as imagens desativadas e as suas posições continuam guardadas no workflow; ativa pelo menos uma imagem para executar
- botão de upload, upload por drag-and-drop e suporte para colar imagens
- navegador `Input Folder` para reutilizar imagens já existentes na pasta `input` do ComfyUI
- modo de tamanho `Keep Input Ratio`, `Preset Ratio` ou `Manual Input`, com preset de proporção, megapíxeis, tamanho com divisível por ou controlo direto de largura/altura
- seleção do método de redimensionamento e da interpolação, com recorte ou ajuste opcionais na exportação
- saídas: `multi_output`, `width`, `height`

<details>
<summary>Detalhes</summary>

- navegação em subpastas de input com mosaicos de pasta, navegação por duplo clique e um botão `Parent`
- é possível adicionar imagens de input em subpastas mantendo os seus caminhos de subpasta do ComfyUI
- symlinks ou junctions externos que saem da pasta `input` do ComfyUI são ignorados por segurança; carrega essas imagens para dentro de `input`
- ordenação das imagens de input da mais recente para a mais antiga, com base na data de modificação do ficheiro
- miniaturas adaptáveis na pasta de input, para uma navegação mais fluida com muitas imagens

</details>

#### `(Deno) Advanced Image Source Loader`

Carregador avançado de fontes de imagem para imagens carregadas, pastas `input` do ComfyUI, batches IMAGE ligados e saída de lista de imagens de tamanhos mistos. O `(Deno) Multi Image Loader` padrão continua a ser a opção mais simples e recomendada para os workflows normais com a pasta `input` do ComfyUI.

<img src="images/readme/advanced-loader.webp" alt="Advanced Image Source Loader com botões de upload, colar, pasta e caminho sobre uma galeria em masonry" width="612">

Funcionalidades principais:

- mantém o fluxo de galeria já familiar dos carregadores de imagem Deno
- suporta a navegação na pasta `input` do ComfyUI e entradas `Input Path` relativas
- `Upload Folder` importa para o input do ComfyUI uma pasta escolhida no navegador
- suporta upload, drag-and-drop, colar e upload de pastas pelo navegador onde este o permita, mais um botão `Paste` visível e o Ctrl+V normal para colar imagens
- clica nas miniaturas para desativar/ativar fontes sem as eliminar; só os cartões ativos recebem números sequenciais de saída
- arrasta os cartões das miniaturas para reordenar a sequência de saída
- a entrada opcional `images` pode encadear um batch/lista de imagens anterior na mesma corrente de saída
- devolve um tensor `batch` redimensionado para os workflows de batch normais e `image_list` para o tratamento imagem a imagem
- saídas: `batch`, `image_list`, `width`, `height`, `image_count`

<details>
<summary>Detalhes</summary>

**Migração da versão 0.7.120 ou anterior:** as pastas externas e os URLs de imagens deixaram de ser lidos ou transferidos. Usa `Upload` ou `Upload Folder` e depois substitui cada fonte antiga ativa pelo caminho de input carregado. As fontes, a ordem, os estados ativos e as ligações guardados são preservados. As fontes antigas desativadas não impedem a execução. `DENO_EXTERNAL_IMAGE_ROOTS` já não concede acesso. Os caminhos absolutos guardados dentro do input do ComfyUI continuam a executar; seleciona o respetivo caminho relativo de input para restaurar as miniaturas.

- suporta mosaicos de pasta, navegação em pastas aninhadas e um botão `Parent`
- usa `Refresh previews` para repetir as miniaturas sem alterar fontes, estado ativo ou ordem; passa o rato sobre uma pré-visualização falhada para ver ajuda
- as fontes desativadas continuam legíveis e guardadas no workflow até serem reativadas ou removidas; ativar/desativar ou reordenar atualiza os números de saída de imediato
- a galeria acompanha a altura disponível do nó, tanto no canvas clássico como no Nodes 2.0
- as miniaturas usam um fluxo ao estilo masonry, para que referências mistas em vertical/horizontal sejam mais fáceis de percorrer
- opção `recursive_folders` para carregar imagens de pastas aninhadas
- modo de tamanho `Keep Input Ratio`, `Preset Ratio` ou `Manual Input`, com preset de proporção, megapíxeis, tamanho com divisível por ou controlo direto de largura/altura
- seleção do método de redimensionamento e da interpolação, incluindo modos de preenchimento com recorte ao centro, ao topo ou à base
- o modo de lista `Original Size` pode preservar resoluções de origem mistas em `image_list`
- o modo de lista `Match Batch Size` faz com que `image_list` corresponda às dimensões do batch redimensionado

</details>

#### `(Deno) MiniMax H3 Multi Reference Image Loader`

Carregador de referências para workflows MiniMax H3, com imagens num só cabo e saídas de áudio individuais.

<img src="images/readme/h3-reference-loader.webp" alt="Carregador de referências MiniMax H3 com três referências e duas linhas de áudio com formas de onda" width="483">

Funcionalidades principais:

- o mesmo fluxo de upload, colar, drag-and-drop, Input Folder, reordenação de cartões e limpeza do `(Deno) Multi Image Loader`
- até 9 imagens de referência ordenadas através de um único socket dedicado
- mantém as dimensões e a proporção de cada imagem descodificada, sem processamento de resize, crop, pad ou letterbox
- mostra cada cartão de pré-visualização com a proporção própria da imagem de origem, para que referências mistas em horizontal e vertical fiquem totalmente visíveis, sem recorte na pré-visualização
- clica nas miniaturas para desativar/ativar referências; os cartões ativos são renumerados de imediato para corresponderem a `<Picture 1>`, `<Picture 2>`, etc., e só essas imagens chegam às duas saídas
- as imagens desativadas continuam guardadas nas posições dos seus cartões e ocupam na mesma um dos 9 slots da galeria; ativa pelo menos uma referência de imagem ou de áudio para executar
- liga-se à única entrada `ref_images` do `(Deno) MiniMax H3 Reference to Video`
- expõe também as mesmas fontes ordenadas como saída `image_list`, que se liga diretamente à entrada `image` do `(Deno) Local LLM Loader`
- o nó H3 mantém as entradas Autogrow nativas do ComfyUI para vídeo de referência, áudio associado ao vídeo e áudio independente

A secção de áudio dobrável, abaixo da galeria de imagens, aceita até 3 ficheiros de áudio através de `Add audio`, Input Folder ou largando ficheiros. Cada ficheiro tem forma de onda, duração medida, reprodução de pré-visualização, um interruptor Use separado, uma pega de reordenação e um controlo de remoção. A reprodução não altera se um ficheiro é usado na geração. Os ficheiros de vídeo não são aceites por este carregador.

Estes dois nós MiniMax H3 exigem o ComfyUI 0.30.0 ou posterior. Consulta o [workflow MiniMax H3 com várias referências](workflows/minimax-h3-multi-reference.json), portátil, para ver o pipeline H3 nativo completo com os dois nós `Load Image` padrão substituídos pelo carregador Deno de um só cabo.

<details>
<summary>Detalhes</summary>

Cada áudio registado acrescenta uma saída `AUDIO` individual a seguir às duas saídas de imagem existentes. Liga essas saídas às entradas de áudio independente crescentes do `(Deno) MiniMax H3 Reference to Video` e liga `audio_vae` para codificar o som. Só os cartões de áudio ativos recebem `<Audio 1>`, `<Audio 2>`, etc., pela ordem dos cartões. Por exemplo, com três ficheiros registados e os dois primeiros desativados, o terceiro ficheiro é mostrado e codificado como `<Audio 1>`. Os ficheiros desativados e os seus cabos continuam guardados; os ramos de áudio normais a jusante deles são ignorados. Reordenar mantém cada cabo ligado ao mesmo ficheiro, e remover um ficheiro remove apenas o cabo de áudio desse ficheiro. O carregamento só de áudio também é suportado.

O nó cresce automaticamente à medida que se adicionam ficheiros de áudio, para que todas as linhas de áudio fiquem visíveis sem barra de scroll interna. Remover ficheiros ou dobrar a secção de áudio liberta esse espaço. A altura e a largura acrescentadas manualmente são preservadas, e ao reabrir um workflow compacto mais antigo o nó expande-se o suficiente para mostrar as suas linhas de áudio guardadas.

Para manter idênticas as etiquetas apresentadas e as referências H3, liga todas as saídas de áudio ativas de um mesmo carregador DENO ao mesmo nó DENO H3. Desativa os ficheiros que não queres ligar. Ao usar estas saídas de áudio DENO, as outras fontes de áudio independente e as bandas sonoras de vídeos de referência têm de estar desligadas desse nó H3; o nó explica o conflito de numeração em vez de atribuir em silêncio etiquetas diferentes. Os workflows existentes que usam apenas outros carregadores de áudio mantêm o comportamento de entrada original.

Os ficheiros de áudio são lidos da pasta input do ComfyUI. As extensões suportadas são WAV, MP3, FLAC, OGG/OGA, Opus, M4A, AAC, AIF e AIFF, consoante o descodificador PyAV instalado. O carregamento está limitado a 256 MiB por ficheiro, 128 MiB de PCM descodificado e 30 segundos de descodificação por CPU. Quando a pré-visualização falha, existe uma ação Retry, que não altera os ficheiros guardados nem as suas ligações.

O socket H3 dedicado é intencional: um batch `IMAGE` normal do ComfyUI exige a mesma largura e altura para todas as imagens, por isso não consegue preservar tamanhos de referência mistos. O `image_list` adicional é uma saída de lista e não um batch de tamanho único, pelo que as dimensões originais, a ordem e as proporções se mantêm separadas quando é reutilizado por nós que aceitam listas. O MiniMax H3 pode, ainda assim, reduzir as referências no seu processamento normal de `ref_image_size`, preservando a proporção.

Nas versões do ComfyUI que suportam VAEs H3 opcionais, o `(Deno) MiniMax H3 Reference to Video` aceita também uma entrada `vae` ou `audio_vae` não ligada. Ligar ambas mantém o comportamento de codificação de referências existente.

- Sem `vae`, as imagens e os vídeos de referência continuam a chegar ao codificador de texto/visão, mas os seus latents de referência codificados por VAE são omitidos.
- Sem `audio_vae`, o som de referência real não é codificado. O codificador de texto mantém etiquetas como `<Audio 1>`, e não a forma de onda do áudio; liga `audio_vae` para referenciar uma voz ou um som. Omiti-lo não desativa o áudio gerado.

O áudio associado a um vídeo de referência (`ref_video_audio`) precisa de `vae` e `audio_vae` ligados para codificar o vídeo de referência e o seu som; o áudio de referência independente (`ref_audio`) precisa apenas de `audio_vae`.

Estas opções aplicam-se apenas à codificação de referências neste nó. Mantém os VAEs necessários para os nós de descodificação de vídeo e áudio a jusante. As versões mais antigas do ComfyUI cujo nó H3 nativo exige ambos os VAEs continuam a exigir as duas ligações; atualiza o ComfyUI para usar a codificação de referências opcional.

</details>

### 02 · Gerar

#### `(Deno) Ideogram Director`

Construtor visual de prompts Ideogram 4 para captions JSON estruturados e trabalho de layout com bbox. [Vê a demonstração do workflow do Ideogram Director](https://youtu.be/Z8s27skkIDM).

<img src="images/readme/ideogram-director.webp" alt="Board do Ideogram Director com quatro caixas de layout sobre um cartaz gerado a partir do mesmo layout" width="640">

O fundo acima é um resultado local do Ideogram 4 gerado a partir das mesmas quatro caixas.

Funcionalidades principais:

- desenha e edita regiões bbox diretamente no canvas do ComfyUI
- desativa temporariamente elementos bbox individuais sem os eliminar nem reordenar
- faz duplo clique numa bbox para a editar junto ao ponteiro, ou usa `Alt`+clique repetidamente numa sobreposição para percorrer as caixas por baixo
- importa prompts JSON de um Local LLM Loader ou de outra fonte STRING
- liga opcionalmente entradas STRING Summary e Background para substituir esses dois campos do board durante uma execução; as entradas desligadas continuam a usar o texto guardado no board
- pergunta antes de substituir um board existente, ou muda para substituir sempre
- rejeita JSON malformado de forma clara, em vez de passar texto de prompt estragado a jusante
- galerias de presets de estilo e de layout com miniaturas de pré-visualização leves
- vista Language para ler e editar as descrições do board no teu idioma, enquanto a saída final se mantém em inglês pronto para o modelo. As palavras literais das caixas TEXT, como letreiros, logótipos e títulos, são preservadas exatamente
- saídas: `prompt`, `width`, `height`, `seed`, `bboxes`

<details>
<summary>Detalhes</summary>

A saída `bboxes` existente liga-se tanto a consumidores `BBOX` padrão como a entradas `BOUNDING_BOX`, como `Ideogram4_MultiLora_BoundingBoxNode_Fedor`; o número de linhas de região desse nó acompanha as caixas ativas do Director sem acrescentar campos guardados ao Director. A sua sincronização atual, apenas por contagem, não acompanha a identidade das caixas: revê as atribuições das linhas LoRA depois de eliminares ou reordenares uma caixa do meio.

A tradução usa apenas os serviços integrados Google, MyMemory e LibreTranslate. Consulta [acesso a ficheiros e tradução](SECURITY_CONFIGURATION.md).

</details>

#### `(Deno) MiniMax H3 Acc LoRA Loader`

Carrega diretamente os [MiniMax-H3-Acc-LoRAs](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs) oficiais da Alibaba PAI, sem converter nem duplicar o ficheiro safetensors.

1. Descarrega o ficheiro oficial `Acc-8Step.safetensors` de FL2VA ou Ref2VA e coloca-o na pasta normal `ComfyUI/models/loras/` ou na pasta dedicada `ComfyUI/models/minimax_h3_acc_loras/`.
2. Liga a `model` um modelo de difusão MiniMax H3 nativo compatível; são aceites as variantes completas e as variantes `*_pruned_*` da Comfy-Org.
3. Seleciona o Acc-LoRA correspondente: FL2VA para FL2VA/T2VA, ou Ref2VA para Ref2VA.
4. Liga a única saída `model` deste nó ao caminho normal do guider.
5. Constrói a via de amostragem com nós padrão do ComfyUI. O ponto de partida recomendado é `BasicScheduler: simple, steps: 8` e `KSamplerSelect: euler`, ligados a `SamplerCustomAdvanced`.

Os pesos LoRA e os workflows não estão incluídos no Deno Custom Nodes. Descarrega os pesos da Alibaba e cria ou adapta o teu próprio workflow nativo do ComfyUI.

<details>
<summary>Detalhes</summary>

O nó aplica os pesos LoRA estáticos e as 32 cabeças de saída PDD do checkpoint, dependentes do tempo. Durante a amostragem, lê os limites sigma reais fornecidos pelo ComfyUI e funde automaticamente as cabeças PDD para esses intervalos. Assim, os controlos de sampler, scheduler e passos ficam nos nós normais do ComfyUI. A configuração oficial Simple/Euler de 8 passos continua a ser a recomendada e a usada no treino; podes escolher qualquer número de passos do Simple Scheduler de 4 a 12 sem alterar este loader, e outros schedules descendentes ou passagens sigma divididas para workflows de ampliação de latents continuam disponíveis para experimentação, sem garantia de melhoria de qualidade. Mantém os desvios sigma de vídeo/áudio do MiniMax H3 nativo em `12.0 / 3.0` e a força do LoRA em `1.0`.

Os modelos completos sem poda, incluindo as variantes INT8 nativas do ComfyUI, aplicam o adaptador completo através do caminho LoRA normal do ComfyUI, compatível com quantização. Para um modelo curve-pruned, o loader procura um checkpoint MiniMax H3 completo compatível já presente em `models/diffusion_models/`, lê apenas a sua pequena secção FP32 do time-embedder e deriva em memória uma ponte que reajusta todas as 50 atualizações LoRA AdaLN de largura completa para a curva podada de largura 8. Nunca carrega o checkpoint completo para este cálculo. Se não houver nenhum checkpoint completo compatível instalado, o loader continua utilizável em modo de compatibilidade: avisa uma vez, ignora essas 50 atualizações AdaLN e aplica todas as outras atualizações LoRA e as cabeças PDD.

Os workflows de UI padrão ativos guardados com o loader de três saídas das v0.7.92-v0.7.94 são migrados quando carregados no canvas do ComfyUI. As ligações de model existentes mantêm-se, e as antigas ligações de sampler e sigmas passam para nós padrão editáveis `KSamplerSelect: euler` e `BasicScheduler: simple, steps: 8`. Guarda o workflow de UI uma vez depois de ele abrir. Os workflows atuais de uma só saída não são alterados. Nós silenciados/em bypass, disposições personalizadas desconhecidas e grafos malformados ficam intactos, em vez de serem adivinhados. O JSON de prompt API em bruto não executa esta migração do frontend; exporta-o de novo a partir do workflow de UI migrado. Se um ficheiro já tiver sido guardado depois de as antigas ligações de sampler/sigmas terem desaparecido, volta a ligar manualmente esses nós padrão.

</details>

#### `(Deno) MiniMax H3 Tiled Sampler`

Finaliza um latent de vídeo+áudio MiniMax H3 ampliado em tiles sobrepostos, para que uma GPU de 16GB consiga executar a passagem final em alta resolução. Em cada passo, todos os tiles leem o mesmo frame, as suas predições são combinadas com pesos de cosseno nas sobreposições e segue-se uma única atualização partilhada. O modelo é carregado uma só vez para todos os tiles, e o latent de áudio original passa sem alterações.

<img src="images/readme/h3-tiled-sampler.webp" alt="MiniMax H3 Tiled Sampler com as definições de tile e de sobreposição" width="375">

Posição típica num grafo H3 nativo:

```text
First pass: SamplerCustomAdvanced with SplitSigmas high_sigmas
-> MiniMax H3 Latent Upscale With Model (ComfyUI 0.44.0+) or another H3 latent upscaler
-> (Deno) MiniMax H3 Tiled Sampler with SplitSigmas low_sigmas
-> VAE Decode for video, audio decode for sound
```

- `model`: o modelo H3 depois dos LoRAs, do sigma shift e de quaisquer nós de atenção ou de memória. A atenção esparsa e a otimização de memória do H3-Optimizations funcionam antes deste nó. O `BlockSparseAttention` do núcleo do ComfyUI é, por agora, rejeitado com uma mensagem.
- `positive`: o mesmo conditioning positive da primeira passagem. As imagens de referência R2V permanecem globais. O conditioning de keyframes é recortado para cada tile e preparado por tile. O conditioning regional e o ControlNet são rejeitados.
- `latent`: o latent H3 ampliado, sem máscara de ruído.
- `sigmas`: apenas os últimos 1-3 passos do schedule da primeira passagem, por exemplo `low_sigmas` de `SplitSigmas`. Outros schedules são rejeitados com uma sugestão.
- `seed`: o ruído que leva o latent ampliado de volta ao primeiro desses sigmas.
- `Tile width`, `Tile height`, `Overlap X`, `Overlap Y`: tamanhos em píxeis, em múltiplos de 32. As sobreposições têm de ser menores do que o tile. O número de tiles resulta do tamanho do frame. Um tile igual ou maior do que o frame processa-o de uma só vez.

Os valores predefinidos (tiles de 896 x 704, com sobreposição de pelo menos 256 x 320) são a definição testada para 16GB. Numa GPU de 16GB com 32GB de RAM do sistema, um clip de 15 segundos em 1920 x 1088 correu como 6 tiles, e o seu único passo final demorou cerca de 520 segundos. Tiles maiores repetem menos trabalho de sobreposição, mas precisam de mais VRAM. Tamanhos acima destes valores predefinidos ainda não foram medidos pela DENO.

Cada execução imprime na consola o número de tiles, a grelha, os tamanhos, os segundos por tile e o pico de memória do PyTorch, e acrescenta o mesmo relatório ao texto de saída do nó, para que tu ou um agente possam escolher os tamanhos seguintes. Requer o ComfyUI com suporte nativo ao MiniMax H3 (0.30.0 ou posterior); testado no ComfyUI 0.41.3 a 0.44.0.

#### MiniMax H3 R2V Audio Reference workflow

O [workflow de referência de áudio para iniciantes](workflows/minimax-h3-r2v-audio-reference.json) mantém o caminho de áudio de referência do MiniMax H3 padrão do ComfyUI e acrescenta uma via automática de direção do prompt:

- `(Deno) Audio Transcript` usa o OpenAI Whisper local para obter letras ou diálogo, tempos dos segmentos, idioma detetado e um resumo de confiança. As letras opcionais introduzidas pelo utilizador continuam a ser a autoridade quanto à redação.
- `(Deno) Audio Analysis Finalizer` mantém apenas os campos documentados de análise acústica do resultado do `TextGenerate` do ComfyUI e pode descarregar esse modelo CLIP depois da análise.
- `(Deno) Local LLM Loader` recebe a transcrição e o relatório acústico através da sua entrada STRING opcional `audio_context`. O AUDIO em bruto não é enviado para o LLM local, e a análise anterior é tratada como dados e não como instruções.
- A secção de áudio de origem selecionada é, ao mesmo tempo, a referência `<Audio 1>` do H3 e o áudio multiplexado no MP4 final. O áudio gerado internamente pelo H3 não é descodificado neste workflow.

Requisitos:

- ComfyUI Stable atual, com MiniMax H3 e suporte de `TextGenerate` compatível com áudio
- [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) para `Load Audio (Upload)`
- `gemma4_e4b_it_fp8_scaled.safetensors` em `ComfyUI/models/text_encoders/` para a análise acústica
- LM Studio com `google/gemma-4-12b-qat` carregado e o seu Local Server a correr, para o passo final de direção do prompt

O `openai-whisper` é instalado como dependência do nó. O checkpoint Whisper selecionado é transferido da OpenAI na primeira execução do `(Deno) Audio Transcript`, validado por checksum pelo loader oficial do Whisper e guardado em cache em `ComfyUI/models/stt/whisper/`.

#### `(Deno) LTX Model Loader`

Um carregador compacto para os padrões comuns de carregamento de modelos LTX 2.3.

<img src="images/readme/ltx-model-loader.webp" alt="LTX Model Loader com botões Checkpoint, KJ Style e GGUF Style" width="372">

Funcionalidades principais:

- modos `Checkpoint Style`, `KJ Style` e `GGUF Style`
- saídas: `model`, `clip`, `video_vae`, `audio_vae`
- usa os caminhos de carregamento integrados do ComfyUI para checkpoint / diffusion / DualCLIP sempre que possível
- usa o `VAELoaderKJ` do KJNodes para workflows com VAEs de vídeo/áudio separados
- usa o carregamento UNet do ComfyUI-GGUF para workflows GGUF; ambos os pacotes só são usados depois de o ComfyUI os ter carregado, e um pacote instalado mas não carregado é indicado com clareza
- inclui erros de dependência mais claros e um fallback de compatibilidade do VAE de áudio para ambientes mistos ComfyUI/KJNodes

#### `(Deno) LTX Sequencer`

Sequenciador de guias LTX afinado para workflows com várias imagens. Inspirado na abordagem de workflow LTX de **WhatDreamsCost**, com ajustes do lado Deno focados na usabilidade do dia a dia.

<img src="images/readme/ltx-sequencer.webp" alt="Multi Image Loader ligado ao LTX Sequencer com linhas de frame e strength por imagem" width="720">

Funcionalidades principais:

- funciona com a saída batch do `(Deno) Multi Image Loader`
- preenche automaticamente `num_images` a partir do carregador ligado, quando possível
- mantém o fluxo de trabalho existente ao estilo sync
- permite que apenas os valores de `strength` passem a controlo manual quando necessário
- o interruptor `bypass` passa `positive`, `negative` e `latent` sem alterações, para testes A/B rápidos

#### `(Deno) LTX Multi LoRA Loader`

Carregador multi LoRA ao estilo Power-LoRA para workflows LTX.

<img src="images/readme/ltx-multi-lora.webp" alt="LTX Multi LoRA Loader com colunas de strength, vídeo e áudio" width="502">

Funcionalidades principais:

- adiciona vários LoRAs num só nó compacto
- interruptor de ativação por slot
- controlos de strength `strength`, `video` e `audio` por slot
- editor de trigger word e de nota do LoRA por slot
- copia as trigger words guardadas a partir da linha do LoRA
- saídas `model` e `clip` corrigidos
- pensado para ficar próximo do fluxo familiar do Power LoRA Loader, acrescentando controlos A/V adequados ao LTX e notas de referência de LoRA leves

#### `(Deno) LTX Prompt Guide`

Assistente de prompts que combina a codificação de prompts LTX, o tratamento opcional de negative prompt, o conditioning LTX integrado e o planeamento da duração do diálogo.

<img src="images/readme/ltx-prompt-guide.webp" alt="LTX Prompt Guide a mostrar a duração mínima do vídeo calculada a partir do diálogo entre aspas" width="572">

Funcionalidades principais:

- codificação do texto do positive prompt
- negative prompt dobrável opcional
- conditioning LTX integrado com `frame_rate`
- estima a duração mínima do vídeo a partir do diálogo entre aspas
- suporta estimativas de diálogo em Auto, coreano, inglês, japonês e chinês
- saídas: `positive`, `negative`, `frame_rate`

#### `(Deno) LTX Tiled Spatial Upscaler`

Auxiliar para segundas passagens de video latents LTX em alta resolução. Divide cada frame em tiles espaciais sobrepostos, executa o upscaler espacial de latents LTX por tile e junta o resultado de volta num único latent.

Usa-o em latents LTX só de vídeo. Se o teu workflow transportar latents combinados de vídeo/áudio, separa primeiro o caminho do áudio e volta a juntá-lo depois da passagem tiled de vídeo.

#### `(Deno) LTX High resolution Tiled Sampler`

Sampler para passagens de refinamento LTX AV em alta resolução. Mantém uma única trajetória global do sampler enquanto as predições de vídeo são avaliadas através de tiles espaciais sobrepostos e fundidas antes da atualização do sampler.

O latent de áudio completo é passado a cada tile de vídeo como contexto, enquanto o latent de áudio devolvido se mantém inalterado no modo `freeze`.

#### `(Deno) Bernini Prompt Guide`

Assistente de prompts Bernini ao estilo KJ que combina a codificação de prompts positive e negative num só nó, simples para iniciantes.

<img src="images/readme/bernini-prompt-guide.webp" alt="Bernini Prompt Guide no modo Image Edit com o preset negativo Official Wan2.2" width="640">

O preset negativo `Official Wan2.2` mostrado acima está escrito em chinês.

Funcionalidades principais:

- seletor `System Prompt` com modos legíveis como `Text to Video`, `Image to Video` e `Reference Video Edit`
- mostra o prefixo do system prompt ativo diretamente no topo do nó
- escreve os prompts em estilo de instrução, por exemplo `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`
- os modos de referência acrescentam automaticamente, por dentro, uma curta indicação de nomes `image0`, `image1`, `image2`
- secção de negative prompt dobrável
- os presets negativos preenchem a caixa de negative prompt visível; edita essa caixa diretamente para alterar o negative prompt final codificado
- saídas: `positive`, `negative`

Este nó prepara apenas o text conditioning. Liga as suas saídas `positive` e `negative` ao nó nativo `(Bernini) Conditioning` do ComfyUI Stable para o conditioning visual/context-latent do Bernini. O ComfyUI atual inclui o [backend Bernini nativo já integrado](https://github.com/Comfy-Org/ComfyUI/pull/14216), por isso o antigo updater do backend de preview já não é necessário; atualiza o ComfyUI Stable se o nó de conditioning nativo não aparecer.

#### `(Deno) Multi LoRA Loader`

Carregador multi LoRA de uso geral para workflows de difusão normais do ComfyUI.

<img src="images/readme/multi-lora.webp" alt="Multi LoRA Loader com quatro slots, um deles desligado" width="502">

Aplica até 64 LoRAs a um `MODEL` ligado e a um `CLIP` opcional, ativa ou desativa cada slot guardado sem perder a sua seleção, define strengths separadas para model e CLIP, mantém trigger words e notas junto de cada LoRA, reordena slots e envia a jusante o `model` e o `clip` corrigidos. Usa `+ Add LoRA` para adicionar slots conforme necessário. Os workflows e os prompts API existentes de oito slots mantêm as seleções, strengths, trigger words, notas e ligações guardadas.

#### `(Deno) Easy Model Download Helper`

Assistente baseado em presets para conjuntos de ficheiros de modelo recomendados. Os presets incluídos abrangem o conjunto inicial GGUF do LTX 2.3 para 8GB de VRAM e o conjunto oficial de modelos LTX 2.5 Distilled INT8 de duas etapas.

<img src="images/readme/model-download-helper.webp" alt="Easy Model Download Helper com o preset LTX 2.3 para 8GB de VRAM e linhas de ficheiros em falta" width="612">

Funcionalidades principais:

- abre ligações oficiais de modelos no navegador em vez de descarregar ficheiros em Python
- inclui o modelo de difusão LTX 2.5, o text encoder Gemma 4 com projeção, os VAEs de vídeo e áudio e o upscaler espacial x2 exigidos pelo workflow de duas etapas
- mostra as raízes de modelos do ComfyUI detetadas e permite copiar a raiz selecionada
- suporta presets de criador guardados no workflow e restaura-os a partir do armazenamento do navegador após recarregar a página
- suporta ligações diretas do Hugging Face e ligações de página/download do Civitai sem pedidos de rede feitos em Python
- verifica as pastas de modelos registadas no ComfyUI, incluindo nomes de pasta personalizados de `extra_model_paths`
- verifica o caminho de destino exato de cada preset dentro dessas pastas de modelos registadas, sem percorrer pastas de projeto aninhadas não relacionadas
- mostra as subpastas de modelos do ComfyUI de destino, para que quem vê saiba exatamente onde colocar os ficheiros

O repositório do LTX 2.5 exige uma conta Hugging Face e **Agree and Access** antes de os seus ficheiros poderem ser descarregados. O assistente não contorna essa restrição nem descarrega ficheiros automaticamente. Consulta a [LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md), pede acesso no [repositório oficial do LTX 2.5](https://huggingface.co/Lightricks/LTX-2.5) e usa depois as ligações do navegador do assistente e move cada ficheiro descarregado para a pasta de modelos do ComfyUI apresentada.

<details>
<summary>Guia de ligações dos presets de criador</summary>

- Hugging Face: clica com o botão direito no pequeno ícone de download junto ao ficheiro pretendido, escolhe `Copy link address` e cola essa ligação direta do ficheiro no campo `URL` do preset.
- Civitai: copia o URL da página do modelo a partir da barra de endereço do navegador, cola-o no campo `URL` do preset e prime o botão `Civitai` no editor para o converter numa ligação de download direta no navegador. Se o nome do ficheiro não estiver visível no URL, introduz manualmente o nome do ficheiro descarregado.
- Nas páginas do Civitai, não copies a ligação do botão azul `Download`, a menos que queiras mesmo fornecer um URL de download direto da API.
- `File name` é usado apenas na verificação do caminho de destino. Deve corresponder ao ficheiro descarregado no disco, sobretudo nas ligações do Civitai/API.

![Guia de ligações do Hugging Face](images/easy-model-download-helper-huggingface-link.png)

[Exemplo de página de modelo do Civitai (inclui texto do modelo em chinês)](images/easy-model-download-helper-civitai-link.png).

![Guia do editor de presets do Civitai](images/easy-model-download-helper-civitai-node.png)

</details>

#### `(Deno) Text Encoder Unload`

Uma barreira de VRAM inline opcional para o fluxo de prompts habitual, só positive ou positive/negative.

<img src="images/text-encoder-unload-workflow.png" alt="Text Encoder Unload colocado depois da codificação do prompt" width="720">

- liga o conditioning positive através de `Positive Conditioning`; é obrigatório e passa sem alterações
- opcionalmente, liga um negative prompt codificado ou `Conditioning Zero Out` através de `Negative Conditioning`; também passa sem alterações
- liga o `CLIP` exato usado pelos text encoders anteriores a `Text Encoder (CLIP)`
- deixa `Negative Conditioning` vazio num workflow de guider só positive
- descarrega apenas esse CLIP/text encoder, os seus clones e os seus componentes geridos através da gestão de modelos do ComfyUI; modelos de difusão, VAEs e ControlNets não são descarregados globalmente
- segue a cache normal de entradas do ComfyUI, pelo que a amostragem de pré-visualização inalterada pode ser reutilizada, enquanto um conditioning ou caminho de CLIP alterado continua a acionar a descarga

<details>
<summary>Detalhes</summary>

O Dynamic VRAM move pesos consoante a pressão de memória e pode deixar intencionalmente páginas do text encoder residentes. Este nó fornece um ponto de libertação determinístico e opcional, mas não consegue fazer o processo inteiro usar `0 MiB`: o contexto CUDA, os tensores de conditioning, outros modelos, as alocações de custom nodes e outras aplicações continuam a ser independentes. Também não melhora por si só a qualidade da amostragem; cria folga de VRAM que pode reduzir o offload de modelos ou evitar um erro de falta de memória. Uma codificação de texto posterior tem de voltar a carregar o modelo, e `--gpu-only` não consegue retirar o encoder da VRAM.

</details>

#### `(Deno) Prompt Text`

Uma pequena fonte STRING multilinha para system prompts, user prompts, templates ou texto JSON. Usa-a quando um prompt longo e reutilizável deve ficar legível no seu próprio nó e ligar-se ao Ideogram Director, ao Local LLM Loader ou a outra entrada STRING sem alterar o texto.

<img src="images/readme/prompt-text.webp" alt="Nó Prompt Text com um system prompt multilinha" width="472">

#### `(Deno) Local LLM Loader` and `(Deno) Local LLM Reviewer`

Auxiliares de workflow com LLM local, para chamar modelos que já estão a correr no teu PC e usar revisões de texto para controlar o que é guardado.

<p>
  <img src="images/readme/local-llm.webp" alt="Local LLM Loader definido para LM Studio com painéis Thinking e Result" width="370">&nbsp;&nbsp;
  <img src="images/readme/review-gate.webp" alt="Local LLM Reviewer com os controlos Review, Pass e Approve Once" width="300">
</p>

Funcionalidades principais:

- chama a partir do ComfyUI modelos locais Ollama, LM Studio, llama.cpp, vLLM, Custom compatível com OpenAI, llama-swap ou Unsloth Studio
- segurança de servidor localhost por predefinição: usa `127.0.0.1` ou `localhost`, ou permite explicitamente um único `IP:port` de LAN privada com `DENO_LOCAL_LLM_ALLOWED_HOSTS`
- atualiza, a partir do nó, as listas de modelos específicas de cada fornecedor
- interrompe um pedido de LLM local em curso antes de descarregar o modelo
- liga batches de prompts através de uma só execução do nó, para que o modelo local possa ficar carregado até o batch terminar
- anexa opcionalmente uma IMAGE a uma chamada a um modelo local com visão
- pré-visualiza o texto de Thinking e de Result diretamente no nó
- incorpora o Result final do nó nos metadados PNG/workflow guardados sempre que o nó Local LLM é executado, para que reabrir o ficheiro o restaure dentro do nó; o Thinking/reasoning continua a ser apenas pré-visualização e não é guardado
- mantém presets de System Prompt com nome nos dados de utilizador do ComfyUI, para que sobrevivam à limpeza do perfil do navegador
- liga um FLOAT positivo a `video seconds` para acrescentar a cada user prompt do LLM uma frase como `This is an 8-second video.` sem alterar o texto de Prompt guardado
- usa o `(Deno) Local LLM Reviewer` como porta antes dos nós Save: deixa passar ou bloqueia saídas IMAGE e AUDIO a partir de um resultado de texto de revisão, aprova uma vez o resultado revisto atual ou volta a executar o caminho anterior ao reviewer

<details>
<summary>Endereços de servidor, chaves API e notas por fornecedor</summary>

Os campos de servidor Custom, llama.cpp, vLLM, llama-swap e Unsloth aceitam apenas um endereço de servidor e uma porta com um `/v1` opcional, por exemplo `http://127.0.0.1:8000/v1`; queries e outros caminhos são rejeitados com uma sugestão. Refresh Models, Unload e Stop para Ollama e LM Studio usam sempre os seus servidores locais fixos, os mesmos com que o nó corre. Os erros do servidor mostram a mensagem de erro JSON do servidor em vez da sua resposta em bruto.

- mantém um único seletor de modelo detetado entre atualizações repetidas e mudanças de fornecedor, e remove seletores duplicados conhecidos de sessões antigas do frontend, preservando o modelo selecionado
- usa as APIs de estado em execução e de gestão do llama-swap para descarga manual ou posterior à execução; qualquer timeout de servidor llama-swap configurado continua a ser responsável pela descarga automática
- usa o fornecedor `Unsloth` apenas com um servidor Unsloth Studio (predefinição `http://127.0.0.1:8888/v1`); se um GGUF Unsloth estiver a correr dentro do LM Studio, seleciona antes `LM Studio`
- lista modelos do Unsloth Studio, envia pedidos de chat compatíveis com OpenAI sem campos de definição de ferramentas nem de escolha de ferramenta e usa a API de gestão do Unsloth Studio para descarga manual ou posterior à execução; `Keep for minutes` não agenda uma descarga temporizada do Unsloth
- os presets de System Prompt existentes no navegador podem ser importados uma vez, ficando a cópia do navegador intacta como cópia de segurança
- vê no nó e no editor o nome do preset de System Prompt efetivamente aplicado; o texto editado sem correspondência aparece como `Custom`

A autenticação da API é lida do ambiente do anfitrião do ComfyUI:

| Fornecedor | Variável de ambiente da chave API |
| --- | --- |
| LM Studio | `DENO_LOCAL_LLM_LM_STUDIO_API_KEY` opcional; recorre a `DENO_LOCAL_LLM_API_KEY` quando a chave dedicada não está definida |
| llama.cpp, vLLM, Custom, llama-swap | `DENO_LOCAL_LLM_API_KEY` opcional |
| Unsloth | `DENO_LOCAL_LLM_UNSLOTH_API_KEY` obrigatória; a chave comum não é usada |
| Ollama | A chave comum não é enviada |

Define a variável adequada antes de iniciar o ComfyUI e reinicia o ComfyUI depois de a alterares. A chave é enviada como token Bearer na descoberta de modelos, no chat e nos pedidos de gestão suportados pelo fornecedor, incluindo a descarga do LM Studio e a gestão do llama-swap. Os fornecedores opcionais continuam a funcionar sem cabeçalho de autenticação quando não há chave configurada. As chaves nunca são guardadas em workflows nem em metadados PNG.

Para um servidor LLM em Docker no mesmo PC, publica a porta do servidor no loopback do anfitrião e usa o URL local correspondente. A autenticação não altera as regras de URL de localhost/LAN privada; usa apenas um servidor de confiança, porque a chave configurada é enviada ao fornecedor suportado selecionado.

Nota sobre LM Studio remoto: o fornecedor dedicado `LM Studio` usa atualmente `http://127.0.0.1:1234/v1`. Para chamar o LM Studio noutro PC teu, na mesma LAN de confiança, ativa **Serve on Local Network** nesse PC, define uma allowlist exata antes de iniciar o ComfyUI (por exemplo `DENO_LOCAL_LLM_ALLOWED_HOSTS=192.168.1.50:1234`), reinicia o ComfyUI, seleciona `Custom` e usa `http://192.168.1.50:1234/v1` como Custom Server URL. Se esse servidor exigir autenticação, define também `DENO_LOCAL_LLM_API_KEY` no anfitrião do ComfyUI antes de reiniciar. A allowlist aceita apenas pares exatos de IP privado e porta e nunca é guardada em workflows nem em metadados PNG. O Custom não usa os auxiliares de descarga específicos do LM Studio, por isso restringe a porta do servidor ao PC do ComfyUI com a firewall do anfitrião e gere o modelo remoto a partir do LM Studio.

Nota de compatibilidade com o LM Studio: se o LM Studio rejeitar o seu campo opcional de controlo de reasoning antes de começar qualquer saída gerada, o nó tenta de novo uma vez sem esse campo. O servidor e o modelo selecionados decidem então o seu comportamento de reasoning predefinido; o interruptor Thinking não consegue forçar um modo de reasoning que o servidor não expõe.

Nota de áudio: o Local LLM Loader não envia AUDIO em bruto para um modelo local. A sua entrada STRING opcional `audio_context` pode transportar como dados uma transcrição e um relatório acústico anteriores, preservando o prompt do utilizador. O Reviewer pode controlar AUDIO quando outro nó de geração de texto, incluindo a geração de texto do ComfyUI compatível com áudio, cria o texto de revisão.

</details>

### 03 · Comparar

#### `(Deno) Image Compare`

Nó de comparação visual A/B para verificar rapidamente duas imagens no canvas do ComfyUI.

<img src="images/readme/image-compare.webp" alt="Slider do Image Compare entre uma imagem nítida e uma imagem pixelizada de uma cidade" width="640">

Funcionalidades principais:

- compara `image_a` e `image_b` diretamente dentro do nó
- modos: `Slider`, `Side by Side`, `Difference` e `Toggle`
- interação de slider ao passar o rato, para uma inspeção rápida de antes/depois
- etiquetas A/B visíveis e um botão `Swap` para verificar nos dois sentidos
- redimensiona a área de pré-visualização interna com o nó, para que imagens em vertical e em horizontal se mantenham legíveis
- nó apenas visual, sem ligação de saída, o que mantém o grafo mais limpo quando a comparação serve só para inspeção

#### `(Deno) Video Compare`

Nó de comparação visual A/B para vídeos, feito para verificar resultados de ampliação e de interpolação de FPS diretamente no canvas do ComfyUI.

<img src="images/readme/video-compare.webp" alt="Video Compare com slider, botões de modo e controlos de reprodução" width="720">

Funcionalidades principais:

- `video_a` / `video_b` (batches IMAGE) e `audio_a` / `audio_b` opcionais (AUDIO, por exemplo do VHS *Load Video*)
- modos: `Slider`, `Side by Side`, `Difference`, `Toggle` (alternância A/B em frame congelado), mais `Swap`
- slider ao passar o rato, clique = play/pausa, barra de scrub, avanço frame a frame, velocidade, loop; passa o rato sobre a pré-visualização para ouvir o lado selecionado
- o nó redimensiona-se segundo a proporção do clip; a roda do rato e o arrastar com o botão do meio são passados ao canvas do ComfyUI
- interruptor `🏷 Output Badges`: acrescenta opcionalmente emblemas A/B e de resolução à saída guardada (desativado por predefinição; a pré-visualização no nó mostra-os sempre)
- `comparison`: saída IMAGE **sem perdas** em resolução completa do modo escolhido (Slider / Side by Side / Difference / Toggle), pronta a ligar a um nó de guardar/codificar como o VHS *Video Combine*, ao FPS selecionado. O `Toggle` produz, ao longo de toda a sequência, o lado A/B selecionado.

O nó é pesado demais para correr? Usa a ferramenta de navegador sem instalação: **https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/** (também ligada no fundo do nó).

<details>
<summary>Detalhes e a ferramenta de navegador</summary>

Toda a composição é trabalho puro de tensores, sem codificador externo. O player no nó desenha, num `<canvas>`, uma sequência de frames WebP reduzidos, num relógio virtual (para que A/B se mantenham exatos ao frame), e reproduz o áudio via WebAudio; os ficheiros são escritos na pasta temp do ComfyUI e servidos pela rota `/view` existente, sendo depois limpos automaticamente ao reiniciar.

Linha temporal partilhada: o número de frames da entrada A e o FPS selecionado definem a duração (usa-se B se A não existir). Os dois lados da pré-visualização e a saída guardada usam esta duração, incluindo depois de `Swap`; B é amostrado ao longo de toda a sua sequência para corresponder ao número de frames de saída de A. Um resultado de interpolação de FPS pode, ainda assim, parecer mais suave na pré-visualização com a mesma duração.

Na ferramenta de navegador, passa o rato sobre o nome de um ficheiro carregado para ver o nome completo. Escolhe **Side by Side** e depois **Left / Right** ou **Top / Bottom** para pré-visualizar o layout combinado. **Save MP4** exporta os dois vídeos completos como MP4 H.264 a 24, 30 (predefinição) ou 60 fps, usando a ordem de Swap atual, o modo Sync e o áudio A/B selecionado (ou mute). Os dois vídeos são ajustados a uma altura comum na saída horizontal, ou a uma largura comum na saída vertical, preservando as suas proporções sem recorte. A saída usa a duração completa de A: o Time sync mantém o último frame de B se B terminar primeiro; o Ratio sync ajusta toda a duração de B a A, incluindo o áudio de B quando selecionado. O zoom e a velocidade de reprodução da pré-visualização não afetam o vídeo guardado.

A gravação corre localmente no teu navegador; os ficheiros nunca são enviados. O motor de vídeo transfere cerca de 30 MB na primeira utilização, por isso é preciso ligação à internet para o preparar. Vídeos grandes ou longos podem demorar e consumir memória do navegador; **Cancel** interrompe a exportação, e um MP4 concluído pode ser descarregado de novo a partir da caixa de diálogo de gravação.

</details>

#### `(Deno) Video Preview`

Pré-visualização direta em resolução completa para verificar a saída codificada real em qualquer ponto de um grafo. Codifica o vídeo H.264 real na resolução original, dentro do processo, com o PyAV (não é lançado nenhum processo externo) usando `+faststart` para que o navegador o reproduza inline de forma fiável, e depois passa as imagens diretamente, para que o possas inserir **inline em vários pontos de amostragem** sem ramificar o fio.

<img src="images/readme/video-preview.webp" alt="Video Preview a reproduzir um clip codificado com o emblema de resolução, FPS e número de frames" width="692">

Funcionalidades principais:

- `images` (batch IMAGE) à entrada, `images` direto à saída, `frame_rate` e uma entrada `audio` opcional que é multiplexada na pré-visualização como AAC (tolerante a AUDIO em dict / objeto / `(waveform, sr)` e a formas `[C,N]` / `[N,C]`; se o áudio não puder ser usado, é registado e o vídeo continua a ter pré-visualização)
- player limpo no nó, em loop automático, como a pré-visualização do VHS: sem controlos, **passa o rato para ouvir o áudio**, **clique = play/pausa**, um botão **Full screen**, e a roda do rato é passada ao canvas do ComfyUI
- um emblema de informação compacto, no canto superior esquerdo, mostra a resolução, o FPS, o número de frames e a duração da pré-visualização atual
- o nó ajusta-se à proporção do clip e mantém-se ajustado ao ser redimensionado
- cada nó reutiliza um único ficheiro temporário, sobrescrito em cada execução, pelo que a iteração intensiva nunca acumula armazenamento temporário
- precisa do PyAV (`pip install av`); se faltar, o nó mostra uma indicação de instalação clara, numa linha, em vez de falhar o grafo

### 04 · Finalizar

#### `(Deno) Film Grain`

Acrescenta grão de película monocromático a uma foto ou a um batch `IMAGE` de vídeo descodificado, usando processamento por CPU. Não é preciso nenhum modelo nem instalação de pacotes adicionais. A predefinição mistura grão fino e grosso a 75:25, suaviza as partículas extremas e reduz o grão perto do preto e do branco puros. Apenas o padrão do grão é desfocado; o detalhe da imagem é preservado.

<img src="images/readme/film-grain.webp" alt="Controlos do Film Grain junto à pré-visualização do retrato com grão" width="720">

Liga-o no fim da cadeia de processamento de imagem:

- Foto: imagem final / resize → **Film Grain** → **Save Image**.
- Vídeo nativo: frames descodificados / resize final → **Film Grain** → **Create Video** → **Save Video**. Mantém o áudio e a frame rate originais ligados ao Create Video.
- Video Helper Suite: frames descodificados → **Film Grain** → **Video Combine**. Mantém as suas definições de áudio e de frame rate.

O painel usa controlos em inglês e o estilo verde compacto dos outros nós Deno, independentemente do idioma do ComfyUI. Mostra **Strength**, **Grain size**, **Roughness**, **Tone protection** e uma escolha **Processing**. **Strength vai de 0 a 1**: o valor predefinido escolhido `0.50` corresponde à quantidade de código `6`, enquanto `1.00` corresponde à quantidade `12`. **Low RAM** (predefinição) processa um frame de cada vez, **Balanced** usa dois e **Faster** usa quatro. A saída do grão é idêntica; um processamento mais rápido pode usar mais RAM temporária.

<details>
<summary>Definições, ajuste à resolução e memória</summary>

**Frames at once**, em **Advanced**, indica o valor exato de 1–4, incluindo um valor personalizado preservado de 3. O processamento usa CPU e não altera a VRAM da geração a montante nem divide o vídeo guardado em clips. O batch completo de frames de saída continua a precisar de RAM; consulta a dica de Processing. As definições de seed e de chunk de vídeo também estão em Advanced.

Os workflows existentes mantêm os valores e os cabos guardados. Uma quantidade guardada acima do novo máximo do painel permanece intacta até ajustares deliberadamente o slider. As entradas de parâmetro ligadas controlam as respetivas definições; o painel desativa esses controlos e mantém visíveis os seus sockets nativos.

Os nós novos usam por predefinição **Advanced → Grain scale → Match resolution**. O tamanho do grão é relativo ao frame: o nó cria o grão original numa grelha com a proporção do frame e **1536px no lado mais curto** (a referência escolhida de 2752×1536) e depois reamostra apenas esse grão monocromático para o tamanho da entrada. A strength e a mistura fino/grosso não mudam. A 2752×1536, o resultado é exatamente o preset original. Os workflows guardados existentes mantêm **Fixed pixels** e o seu resultado anterior; escolhe Match resolution para ativar o novo comportamento. Os prompts API mais antigos que omitem `grain_scale_mode` também mantêm o resultado baseado em píxeis.

O padrão de referência é filtrado ao ser amostrado para frames mais pequenos, em vez de ser amplificado de volta à mesma variância por píxel. Isto mantém mais consistentes o tamanho das partículas e a força visível quando se veem resoluções diferentes ao mesmo tamanho de apresentação. O grão muito fino, a compressão do codec e a escala da reprodução podem ainda diferir; não se garante um aspeto idêntico em todos os players. As entradas extremamente esticadas cuja grelha de referência exceda 16 777 216 píxeis falham antes de a alocar e podem usar Fixed pixels.

| Definição | Predefinição | Efeito |
| --- | --- | --- |
| `enabled` | on | Desligado, passa a entrada original sem copiar. |
| `amount` | `6` | Strength guardada/API em unidades de brilho de 8 bits. A strength do painel `0.5` = amount `6`, `1` = amount `12`; `0` passa sem alterar. O intervalo maior do backend mantém os workflows mais antigos. |
| `grain_size` | `1` | Tamanho relativo fino/grosso em Match resolution; sigma original `0.45 / 1.15 px` na referência de 1536px. O Fixed pixels usa estes sigmas na resolução da entrada. |
| `roughness` | `0.25` | Proporção de grão grosso; mistura fino/grosso predefinida `75:25`. |
| `tone_weighted` | on | Realça os meios-tons mais escuros e protege as extremidades mais claras e mais escuras. |
| `temporal_mode` | `changing` | Varia o padrão por frame. `fixed` repete um padrão para comparação. |
| `seed` | `2026100701` | Reproduz o mesmo padrão e a mesma sequência de frames. |
| `frame_offset` | `0` | Índice global do primeiro frame ao processar chunks de vídeo em separado. |
| `processing_batch_size` | `1` | Frames processados em conjunto na CPU, de 1 a 4. 1 minimiza a RAM temporária. |
| `grain_scale_mode` | `resolution` nos nós novos | Match resolution amostra o grão de referência para dentro do frame. `pixels` preserva o grão original baseado em píxeis; a omissão em prompts API antigos usa `pixels`. |

Para comparar definições com o mesmo padrão entre execuções, mantém `seed` inalterada e define o **control after generate** da seed do ComfyUI como `fixed`.

A memória temporária fica limitada ao grupo de processamento selecionado (1–4 frames), e a saída ativada é guardada na CPU em vez de alocar um segundo batch completo na VRAM. O Match resolution também precisa da grelha de grão de referência, por isso frames de menor resolução podem usar mais RAM temporária do que o Fixed pixels; o Low RAM limita este trabalho a um frame de cada vez. **O batch IMAGE de saída completo continua a precisar de RAM**, além da entrada a montante e das caches do ComfyUI. Em float32 RGB, esta saída usa `frames × width × height × 12` bytes: cerca de **23,7 MiB por frame 1080p**, ou **2,78 GiB para 120 frames**. Este nó não faz streaming de um ficheiro de vídeo inteiro nem remove a memória de cache a montante; usa batches mais curtos para clips longos ou de alta resolução. As execuções desativadas/com strength zero devolvem o mesmo objeto de entrada.

O tamanho, o número de canais e o dtype são preservados; o alfa RGBA não é alterado. O nó opera sobre píxeis, enquanto o Save Image/Save Video continuam responsáveis pelos metadados do workflow, pela codificação e pela criação do ficheiro. Um socket nativo `VIDEO` liga-se depois do Create Video, não diretamente a este nó. A compressão de vídeo pode suavizar o grão fino ou aumentar o tamanho do ficheiro guardado.

</details>

#### `(Deno) RTX Video Super Resolution`

Nó auxiliar opcional de RTX Video Super Resolution para Windows/NVIDIA RTX, para quem quer experimentar o NVIDIA VFX dentro do ComfyUI sem andar à procura do ambiente Python certo.

<img src="images/readme/rtx-vsr.webp" alt="Painel do RTX Video Super Resolution com controlos de efeito, qualidade e redimensionamento" width="612">

Este nó é intencionalmente separado dos nós Deno principais. Só importa o NVIDIA VFX durante a execução da ampliação, pelo que as instalações normais dos nós Deno não precisam do NVIDIA VFX. O ComfyUI Manager instala o pacote de nós sem instalar automaticamente o NVIDIA VFX.

| Se a tua imagem é... | Usa |
| --- | --- |
| pequena, de baixa resolução ou comprimida | `VSR` |
| já limpa, mas precisa de uma saída maior e mais nítida | `High Bitrate` |
| com ruído ou grão | `Denoise` |
| desfocada, fora de foco ou ligeiramente desfocada | `Deblur` |

Fluxo de instalação para iniciantes:

1. Instala ou atualiza o `deno-custom-nodes` e inicia o ComfyUI.
2. Adiciona o `(Deno) RTX Video Super Resolution` e executa-o uma vez com uma imagem.
3. Clica no botão `How to install` do nó se o NVIDIA VFX estiver em falta ou se quiseres atualizar uma instalação mais antiga.
4. Fecha todas as janelas/processos do ComfyUI antes de executares o instalador.
5. Segue o guia de instalação visual na web: descarrega o ZIP dessa página, move-o para `ComfyUI\custom_nodes\deno-custom-nodes\tools`, escolhe `Extract All` com o destino definido para essa própria pasta `tools` e executa `tools\install_rtx_vfx.bat`. Se o Windows criou uma subpasta `install_rtx_vfx_bat`, move `install_rtx_vfx.bat` e `README_RTX_VFX_EASY_INSTALL.md` diretamente para `tools` antes de executar o BAT.
6. Se o BAT perguntar `Install RTX VFX here?`, escreve `Y` apenas se o caminho do Windows mostrado estiver dentro da aplicação ComfyUI que acabaste de fechar. Se parecer errado, escreve `N` e pára.
7. Espera pela mensagem verde `INSTALL COMPLETE`.
8. Reinicia o ComfyUI por completo e depois volta a usar o `(Deno) RTX Video Super Resolution`.

Para o guia visual completo e acessível a iniciantes, abre a [página de instalação do Deno RTX VFX](https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/).
Se um vídeo tutorial te disser para abrires a pasta `tools` depois de instalares pelo ComfyUI Manager, abre `tools/OPEN_INSTALL_GUIDE.txt`; aponta para a mesma página de instalação atual.

<details>
<summary>Requisitos de runtime, atualizações e todas as funcionalidades</summary>

Runtime NVIDIA recomendado: `nvidia-vfx 0.2.0.0` ou posterior (VFX SDK 1.3); o instalador atual exige pelo menos esta versão. Na nossa comparação em Windows, o `0.2.0.0` evitou a acumulação repetida de processos de verificação de atualizações da NVIDIA vista com o `0.1.0.1`. Este é um resultado do ambiente testado, não uma garantia para todos os PCs.

Para o runtime atual, usa Windows 10/11 x64, uma GPU NVIDIA RTX suportada e Python 3.10 ou posterior. Recomenda-se PyTorch com CUDA 13 ou posterior, de acordo com os [nós NVIDIA atuais da Comfy Org](https://github.com/Comfy-Org/ComfyUI_Nvidia_VFX_Nodes#requirements). O mínimo de driver NVIDIA x64 para Windows é 570.65 (595 para dispositivos TCC). O instalador verifica o efeito NVIDIA no teu ambiente ComfyUI real e não substitui automaticamente o PyTorch nem atualiza o teu driver; segue as suas instruções se a verificação falhar. O pacote da NVIDIA inclui o seu runtime VFX, por isso não precisas de um instalador separado do VFX SDK nem do CUDA Toolkit para esta instalação.

Já usas o `nvidia-vfx 0.1.x`? Atualizar apenas o DENO Custom Nodes não atualiza esta biblioteca NVIDIA opcional. Fecha totalmente o ComfyUI e volta a executar o instalador mais recente a partir do mesmo guia acima. As ligações e definições dos workflows existentes mantêm-se, mas os resultados do processamento NVIDIA podem diferir após a atualização da biblioteca. Mantém o teu ambiente anterior se precisares de reproduzir exatamente um render anterior.

Referências oficiais da NVIDIA:

- [Video Super Resolution filter](https://docs.nvidia.com/maxine/vfx/latest/Filters/VideoSuperResolution.html)
- [NVIDIA VFX Python bindings](https://docs.nvidia.com/maxine/vfx-python/latest/index.html)
- [Requisitos atuais do pacote NVIDIA e histórico de versões](https://pypi.org/project/nvidia-vfx/)
- [Requisitos atuais do VFX SDK para Windows](https://docs.nvidia.com/maxine/vfx/latest/WindowsVFXSDK/GetStartedonWindows.html)
- [API Python do VideoSuperRes](https://docs.nvidia.com/maxine/vfx-python/latest/api.html)

Funcionalidades principais:

- usa o caminho oficial do pacote `nvidia-vfx` / `nvvfx.VideoSuperRes` da NVIDIA
- liga, a partir da UI do nó, à documentação oficial Video Super Resolution da NVIDIA
- mostra um painel RTX compacto com botões de efeito, um seletor de qualidade separado, uma linha de orientação do modo e apenas os controlos de redimensionamento que se aplicam ao efeito selecionado
- os painéis RTX de passagem única e de 2 passagens passam o scroll da roda do rato para o canvas do ComfyUI, pelo que o zoom normal do canvas continua a funcionar enquanto o ponteiro está sobre o nó
- o instalador tem como alvo o Python usado pela instalação atual do ComfyUI
- o instalador recusa continuar se o ComfyUI ainda estiver a correr com esse Python
- o instalador pergunta antes de instalar no Python detetado
- o instalador pára se não for detetada nenhuma GPU NVIDIA, a menos que o utilizador anule explicitamente a verificação
- o instalador reinstala de forma limpa o `nvidia-vfx >= 0.2.0.0` quando o utilizador confirma o Python de destino, incluindo atualizações a partir de instalações `0.1.x` mais antigas
- o instalador verifica primeiro o caminho normal do pacote `nvvfx` usado pelo Python atual do ComfyUI
- o instalador só usa o fallback de runtime ASCII do Windows quando o caminho normal `nvvfx` falha a verificação
- o arranque do nó prefere o caminho de fallback ASCII registado apenas quando esse fallback foi realmente selecionado
- se outro módulo nativo do NVIDIA VFX já estiver carregado de um caminho em conflito, o nó pára e pede um reinício completo do ComfyUI, em vez de tentar recarregar a extensão nativa
- o instalador verifica que o efeito `VideoSuperRes` da NVIDIA pode realmente ser criado após a instalação
- se o NVIDIA VFX indicar uma funcionalidade de runtime não suportada, o nó mostra uma mensagem legível sobre GPU/driver/caminho do runtime em vez de um stack trace em bruto
- se DLLs NVIDIA Broadcast/NGX VFX de outro nó RTX já estiverem carregadas, o nó indica esse conflito de runtime nativo em separado do suporte de GPU/driver
- se outro nó RTX baseado em Broadcast funcionar enquanto o Deno falha, trata-o como um conflito de runtime nativo, não como prova de que a instalação do Deno está estragada
- mantém o BAT e o ZIP do instalador no GitHub em vez de dentro do pacote do Manager, enquanto a UI do nó oferece um botão `How to install` que abre a página de instalação visual na web, mais um auxiliar `Copy steps`
- mantém um pequeno ficheiro `tools/OPEN_INSTALL_GUIDE.txt` nas instalações pelo Manager, para que a pasta `tools` continue a existir para quem segue vídeos tutoriais mais antigos
- expõe quatro botões de efeito claros: Video SR, High Bitrate, Denoise e Deblur
- mostra uma linha compacta de orientação do modo que explica o efeito selecionado em linguagem simples
- mantém a qualidade Low, Medium, High e Ultra como um seletor separado
- para Video SR e High Bitrate, suporta as opções de redimensionamento `Scale`, `Keep Ratio`, `Manual` e `Preset Ratio`
- `Keep Ratio` e `Preset Ratio` usam megapíxeis de destino; `Manual` usa largura e altura
- expõe o alinhamento `divisible_by` nos modos redimensionáveis, com `1` por predefinição para que tamanhos de vídeo padrão como 1920x1080 se mantenham exatos
- valores de alinhamento mais altos, como `32`, continuam disponíveis quando um workflow precisa especificamente de uma saída forçada a múltiplos de N
- mostra `Center Crop (Fill)` / `Fit (Letterbox/Pillarbox)` quando um redimensionamento manual, por proporção predefinida ou por proporção mantida e alinhada pode alterar a proporção da imagem
- `Denoise` e `Deblur` mantêm o tamanho original e escondem os controlos de redimensionamento, em linha com os modos VSR do mesmo tamanho da NVIDIA
- Saídas do Easy Upscale: `images`
- O nó mostra apenas controlos. Liga a sua saída `images` ao Preview Image ou ao Image Compare para ver o resultado processado.

</details>

#### `(Deno) RTX Video Super Resolution (2 Pass)`

Nó RTX de acabamento em duas passagens para workflows de vídeo completos. Pode executar primeiro uma passagem opcional `Denoise` ou `Deblur` do mesmo tamanho e depois uma passagem opcional de ampliação `VSR` ou `High Bitrate`.

<img src="images/readme/rtx-2pass.webp" alt="Painel do RTX Video Super Resolution 2 Pass com uma passagem de limpeza e uma de ampliação" width="632">

Workflow de exemplo: [workflow de ampliação RTX em 2 passagens](workflows/deno-rtx-lowram-metabatch.json)

Funcionalidades principais:

- inclui as vias `Low System Memory` e `High System Memory` no workflow de exemplo
- a via de pouca memória usa o VHS Meta Batch para que vídeos mais longos possam ser processados em chunks de frames mais pequenos
- usa `VHS_VideoInfoSource` para levar o FPS de origem até ao `VHS_VideoCombine`
- preserva o áudio de origem através do caminho de carregamento/combinação do VHS
- útil para finalizar saídas de vídeo realmente codificadas, não apenas para testar um batch de imagens
- saídas: `images`

### 05 · Organizar

#### Deno Visual Fold

O Deno Visual Fold é um auxiliar de arrumação apenas visual para grafos grandes do ComfyUI. É ativado automaticamente quando o pacote Deno Custom Nodes mais recente é instalado ou atualizado.

<img src="images/readme/visual-fold.webp" alt="Nós selecionados com o emblema verde Fold, dobrados numa só pílula Folded · 3" width="880">

Seleciona dois ou mais nós e a barra de seleção nativa do ComfyUI mostra um emblema verde `Fold` legível. Clica nele para recolher os nós selecionados num só grupo visual compacto; usa `Unfold` para os restaurar.

Também podes selecionar um grupo normal do ComfyUI e usar `Fold Group` para recolher os nós dentro desse grupo, mantendo intacta a lógica do workflow. Quando dois ou mais grupos estão selecionados, a mesma barra acrescenta emblemas `Align` legíveis para alinhamento à esquerda/direita/topo/base e espaçamento horizontal/vertical.

Isto é diferente do Subgraph do ComfyUI. O Subgraph move os nós para um grafo filho, o que pode ser poderoso, mas pode não ser o ideal quando um workflow depende de manter visíveis no grafo principal os nós `Get` / `Set` ou a estrutura pai-filho do grafo. O Visual Fold destina-se apenas a uma organização visual simples. Não transforma os nós selecionados num subgraph nem altera a lógica do workflow.

#### Deno Floating Tools

O Deno Floating Tools é um auxiliar opcional em `Settings > DENO > Tools`. Está desativado por predefinição.

Quando ativado, acrescenta um pequeno ícone Deno arrastável ao ecrã do ComfyUI. O painel pode libertar VRAM do ComfyUI através do endpoint de limpeza de memória integrado do ComfyUI, mostrar em modo só de leitura o estado atual/mais recente da versão do ComfyUI Stable e abrir um relatório Error Help quando uma execução falha.

O Error Help cria um relatório pronto para GPT/Gemini com o workflow atual, o executável Python e o tipo de ambiente, as versões dos pacotes, os detalhes da GPU, o contexto recente de traceback/log e um resumo dos custom nodes. É só de leitura, abre primeiro uma janela de relatório e só copia quando clicas em `Copy Report`. Segredos comuns como tokens, cookies, passwords, chaves privadas e credenciais em URLs são mascarados antes da cópia.

O Floating Tools não instala, atualiza, reinicia, repara nem modifica workflows. Só se liga às funções de pedido do ComfyUI enquanto as ferramentas estão ligadas.

#### Node info button

A maioria dos nós Deno tem um pequeno botão verde `i` no canto superior direito. Clica nele para ver a finalidade do nó, as definições principais e as notas da versão atual sem sair do canvas. Quando existe uma versão mais recente do Deno Custom Nodes, o botão fica amarelo e mostra um pequeno emblema `!`.

<img src="images/readme/node-help.webp" alt="O popup de informação do nó Resize Box, com versão e notas da versão" width="720">

## Segurança e privacidade

O Deno Custom Nodes mantém por predefinição o tratamento de ficheiros, rede e segredos estreito.

- **Ficheiros:** os carregadores de imagem leem apenas a pasta `input` do ComfyUI. Carrega as imagens externas antes de reabrires workflows que usavam caminhos ou URLs externos. O Save Image do Ideogram Director copia apenas ficheiros de imagem.
- **Local LLM:** os servidores são localhost por predefinição. Um servidor de LAN privada só funciona através de uma allowlist exata em `DENO_LOCAL_LLM_ALLOWED_HOSTS`, e as chaves API são lidas do ambiente do anfitrião do ComfyUI, nunca guardadas em workflows nem em metadados PNG.
- **Tradução:** a tradução do Ideogram usa apenas os serviços integrados Google, MyMemory e LibreTranslate.
- **Ligações de modelos:** o Easy Model Download Helper abre ligações web oficiais no teu navegador e nunca descarrega ficheiros em Python.
- **Relatórios:** o Error Help é só de leitura, mostra o relatório antes de copiar e mascara segredos comuns como tokens, cookies, passwords e chaves privadas.

Consulta [acesso a ficheiros e tradução](SECURITY_CONFIGURATION.md) para as regras exatas.

## Porque existe

Estes nós foram criados para reduzir a fricção de configuração repetida no trabalho real com o ComfyUI. O objetivo não é perseguir listas enormes de funcionalidades. O objetivo é fazer com que os workflows que as pessoas repetem todos os dias pareçam mais rápidos, mais limpos e mais fáceis de ensinar.

## Dicas de pesquisa

- No ComfyUI Manager ou no Registry, procura `Deno Custom Nodes`.
- No canvas, procura `(Deno)` ou o nome do nó, como `Resize Box`.
- Usa o [Mapa de workflows](#mapa-de-workflows) para encontrar a ferramenta e os seus requisitos.

## Instalação

Para a instalação recomendada pelo Manager, segue o [Início rápido](#início-rápido).

<details>
<summary>Instalação e atualização manual</summary>

Para uma instalação manual, clona dentro da tua pasta `custom_nodes` e instala as dependências com o mesmo executável Python que inicia o ComfyUI:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
cd comfyui-deno-custom-nodes
python -m pip install -r requirements.txt
```

Para uma atualização manual, executa `git pull --ff-only`, reinstala o `requirements.txt` com esse mesmo Python e reinicia o ComfyUI. As instalações pelo Manager/Registry tratam automaticamente das dependências do pacote.

</details>

## Licença

Os nós, documentos, exemplos, workflows e assets locais do projeto pertencentes à Deno neste repo são publicados sob a GNU GPL v3.0 (`GPL-3.0-only`). Podes usá-los, estudá-los, modificá-los e redistribuí-los, incluindo comercialmente, nos [termos da GPL-3.0](../LICENSE). As versões modificadas que forem distribuídas têm de seguir a GPL-3.0 e preservar os avisos de licença e de copyright exigidos.

Modelos, checkpoints, LoRAs, bibliotecas, ferramentas e serviços de terceiros mantêm as suas próprias licenças e condições. Verifica a licença aplicável antes de usar, partilhar ou vender resultados de um modelo ou asset específico.

## Notas de versão

Consulta a [última versão](https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest) e o [CHANGELOG.md](../CHANGELOG.md) para ver as atualizações.

## Ligações

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
