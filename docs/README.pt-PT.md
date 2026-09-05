# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

![Deno Custom Nodes banner](images/deno-custom-nodes-banner.jpg)

Nós práticos de ComfyUI para preparar imagens e vídeos, carregar modelos e organizar o canvas.

[GPL-3.0](../LICENSE)

- **Preparar e comparar imagens:** [Resize Box, carregadores e nós de comparação](#deno-resize-box).
- **Criar workflows de geração:** [MiniMax H3](#deno-minimax-h3-multi-reference-image-loader), [LTX](#deno-ltx-model-loader) e [LLM locais](#deno-local-llm-loader--deno-local-llm-reviewer).
- **Organizar o canvas e os resultados:** [Visual Fold](#deno-visual-fold), [Floating Tools](#deno-floating-tools) e [ferramentas no navegador](#web-tools).

## Quick Start

Começa com o ComfyUI já instalado.

1. Abre o ComfyUI Manager e procura `Deno Custom Nodes`.
2. Instala o pacote e reinicia o ComfyUI.
3. Faz duplo clique numa zona vazia do canvas, procura `(Deno) Resize Box` e adiciona-o.
4. Escolhe `Preset Ratio` e os megapíxeis para definir `width` / `height` de saída.
5. Adiciona `Load Image`, seleciona ou carrega uma imagem e liga a saída `IMAGE` à entrada `image` do Resize Box. Liga a saída `image` do Resize Box a `Preview Image` e clica em `Run` para ver o resultado.

[Todos os nós](#included-nodes) · [Ferramentas web](#web-tools) · [Visual Fold](#deno-visual-fold) · [Floating Tools](#deno-floating-tools) · [Instalação manual](#install) · [Licença](#license)

A maioria dos nós Deno inclui um pequeno botão verde `i` para consultar ajuda rápida sem sair do canvas do ComfyUI. Se existir uma nova versão do Deno Custom Nodes, o botão fica amarelo e mostra um pequeno emblema `!`.

## Web Tools

Ferramentas que podes executar diretamente no navegador.

- [DENO Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - compara dois vídeos renderizados com slider, lado a lado, diferença e toggle.
- [DENO Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - corta, recorta, redimensiona e exporta clips curtos como GIF ou WebP mais leve.
- [DENO Compressão de vídeo / imagem para Discord](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - reduz vídeos ou imagens e guarda-os, quando possível, com menos de 10 MB para partilha no Discord. A interface está disponível apenas em coreano.

## DENO Visual Fold

[![DENO Visual Fold](images/deno-visual-fold-preview.webp)](images/deno-visual-fold.webp)

DENO Visual Fold é uma ajuda visual para organizar grandes grafos do ComfyUI. Dobrar nós ou grupos não altera a lógica do workflow.

Ao selecionar dois ou mais nós, aparece um botão verde `Fold` na barra de seleção nativa do ComfyUI. Ao clicar, os nós selecionados ficam compactados num grupo visual e podem ser restaurados com `Unfold`. Ao selecionar um grupo normal do ComfyUI, `Fold Group` dobra os nós dentro desse grupo; com vários grupos selecionados aparecem também ações de alinhamento.

Ao contrário do Subgraph, Visual Fold não move os nós para um grafo filho. É apenas organização visual, útil quando queres manter nós `Get` / `Set` ou a estrutura pai-filho visível no grafo principal.

## DENO Floating Tools

DENO Floating Tools é um assistente opcional em `Settings > DENO > Tools`. Está desativado por predefinição.

Quando ativado, adiciona um pequeno ícone DENO arrastável ao ecrã do ComfyUI. O painel pode libertar VRAM através do endpoint de limpeza de memória integrado do ComfyUI, mostrar em modo só de leitura o estado da versão atual e mais recente do ComfyUI Stable, e abrir um relatório Error Help quando uma execução falha.

Error Help cria um relatório preparado para GPT / Gemini com o workflow atual, executável e tipo de ambiente Python, versões de pacotes, GPU, contexto recente de traceback / log e resumo de custom nodes. É só de leitura, abre primeiro uma janela de relatório e só copia ao clicar em `Copy Report`. Segredos comuns como tokens, cookies, passwords, private keys e credenciais em URLs são ocultados antes da cópia.

Floating Tools não instala, atualiza, reinicia, repara nem modifica workflows.

## Included Nodes

### `(Deno) Ideogram Director`

Construtor visual de prompts para Ideogram 4, destinado a captions JSON estruturados e layouts bbox dentro do canvas do ComfyUI.

[![Ideogram Director — Demo](images/ideogram-director-video-thumbnail.jpg)](https://youtu.be/Z8s27skkIDM)

- Desenha e edita regiões bbox; desativa temporariamente cada caixa sem a eliminar nem alterar a ordem.
- Faz duplo clique numa bbox para editar junto ao ponteiro, ou usa `Alt`+clique repetidamente numa sobreposição para percorrer as caixas por baixo.
- Importa prompts JSON do Local LLM Loader ou de outra fonte STRING, confirma antes de substituir um board e rejeita claramente JSON inválido.
- As entradas STRING opcionais Summary e Background substituem esses campos do board durante a execução; sem ligação, é usado o texto guardado.
- Usa galerias de presets de estilo/layout e Language view para editar descrições no teu idioma. A saída final mantém-se em inglês pronto para o modelo e as palavras de caixas TEXT, como letreiros, logótipos e títulos, são preservadas exatamente.
- Saídas: `prompt`, `width`, `height`, `seed`, `bboxes`.
- `bboxes` liga-se tanto a `BBOX` padrão como a entradas `BOUNDING_BOX`, por exemplo `Ideogram4_MultiLora_BoundingBoxNode_Fedor`. O número de linhas de regiões desse nó acompanha as caixas ativas do Director sem acrescentar campos guardados ao Director. A sincronização atual apenas conta caixas e não acompanha a sua identidade: revê as atribuições LoRA depois de eliminar ou reordenar uma caixa intermédia.

### `(Deno) Resize Box`

Nó de resolução e redimensionamento de imagem para ComfyUI.

![Deno Resize Box](images/resize-box.jpg)

Funcionalidades principais: `Preset Ratio` / `Manual Input`, presets de proporção, cálculo por megapíxeis, alinhamento `divisible_by`, `Center Crop (Fill)`, `Crop Position (Fill)` com zoom e proporção fixa, `Fit (Letterbox/Pillarbox)`, interpolação `lanczos` por predefinição e saídas `image`, `width`, `height`.

`Crop Position (Fill)` mostra a imagem de origem completa. Arrasta a moldura de recorte para a reposicionar ou qualquer canto para ajustar o zoom, mantendo fixos a proporção e os megapíxeis de saída.

### `(Deno) Multi Image Loader`

Carregador de várias imagens pensado para workflows de guia por batch.

![Deno Multi Image Loader](images/multi-image-loader.jpg)

Funcionalidades principais: galeria de altura fixa, reordenação por arrastar, upload, drag-and-drop, colar imagem, navegação pela pasta `input`, suporte a subpastas, ordenação por data recente, redimensionamento por proporção/preset/manual, saídas `multi_output`, `width`, `height`.

### `(Deno) MiniMax H3 Multi Reference Image Loader`

Carregador de imagens de referência com uma única ligação para o workflow nativo MiniMax H3 Reference to Video do ComfyUI.

Mantém a mesma experiência de upload, paste, drag-and-drop, Input Folder, reordenação de cartões e limpeza de `(Deno) Multi Image Loader`. Envia até 9 referências ordenadas através de um socket `ref_images`, preservando separadamente as dimensões e proporções originais de cada imagem, sem resize, crop ou padding. A ordem dos cartões corresponde a `<Picture 1>`, `<Picture 2>` e seguintes; as mesmas imagens também são expostas como `image_list` para ligação direta à entrada `image` de `(Deno) Local LLM Loader`.

O nó incluído `(Deno) MiniMax H3 Reference to Video` apenas reúne as imagens numa entrada; mantém as entradas Autogrow nativas de vídeo de referência, áudio associado ao vídeo e áudio independente. Estes dois nós MiniMax H3 exigem ComfyUI 0.30.0 ou posterior. Consulta o [workflow de exemplo MiniMax H3 com múltiplas referências](workflows/minimax-h3-multi-reference.json).

### `(Deno) MiniMax H3 Acc LoRA Loader`

Carrega diretamente os [MiniMax-H3-Acc-LoRAs](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs) oficiais da Alibaba PAI, sem converter nem duplicar o ficheiro safetensors.

1. Descarrega o ficheiro oficial `Acc-8Step.safetensors` de FL2VA ou Ref2VA e coloca-o na pasta habitual `ComfyUI/models/loras/` ou na pasta dedicada `ComfyUI/models/minimax_h3_acc_loras/`.
2. Liga a `model` um modelo de difusão nativo MiniMax H3 compatível; são aceites modelos completos e variantes `*_pruned_*` da Comfy-Org.
3. Seleciona o Acc-LoRA correspondente: FL2VA para FL2VA/T2VA ou Ref2VA para Ref2VA.
4. Liga a única saída `model` do nó ao percurso habitual do guider.
5. Constrói o percurso de amostragem com nós padrão do ComfyUI. Recomenda-se começar com `BasicScheduler: simple, steps: 8` e `KSamplerSelect: euler`, ligados a `SamplerCustomAdvanced`.

O nó aplica os pesos LoRA estáticos e as 32 cabeças de saída PDD dependentes do tempo do checkpoint. Durante a amostragem, lê os limites sigma reais fornecidos pelo ComfyUI e funde automaticamente as cabeças PDD para esses intervalos. Assim, o sampler, o scheduler e os passos continuam a ser controlados nos nós habituais do ComfyUI. A configuração oficial Simple/Euler de 8 passos continua a ser a recomendada e a usada no treino. Podes selecionar de 4 a 12 passos no Simple Scheduler sem mudar este loader; outros schedules descendentes ou passagens sigma divididas para workflows de ampliação de latentes estão disponíveis para experimentar, sem garantia de melhoria da qualidade. Mantém os desvios sigma nativos de vídeo/áudio do MiniMax H3 em `12.0 / 3.0` e a força LoRA em `1.0`.

Os modelos completos sem poda, incluindo as variantes INT8 nativas do ComfyUI, aplicam o adaptador completo através do percurso LoRA do ComfyUI compatível com quantização. Para um modelo curve-pruned, o loader procura um checkpoint MiniMax H3 completo compatível já instalado em `models/diffusion_models/`, lê apenas a pequena secção FP32 time-embedder e calcula em memória uma ponte que adapta todas as 50 atualizações AdaLN LoRA de largura completa à curva podada de largura 8. Não carrega o checkpoint completo para este cálculo. Se não existir um checkpoint completo compatível, continua utilizável em modo de compatibilidade: avisa uma vez, ignora essas 50 atualizações AdaLN e aplica todas as restantes atualizações LoRA e cabeças PDD.

Os workflows UI padrão com o loader de três saídas de v0.7.92–v0.7.94 ativo são migrados quando abertos no canvas do ComfyUI. As ligações do modelo mantêm-se e as antigas ligações sampler e sigmas passam para nós padrão editáveis `KSamplerSelect: euler` e `BasicScheduler: simple, steps: 8`. Guarda o workflow UI uma vez depois de o abrir. Os workflows atuais de uma saída não mudam. Nós silenciados ou em bypass, disposições personalizadas desconhecidas e grafos malformados ficam intactos. O JSON de prompts API não executa esta migração frontend; exporta-o novamente a partir do workflow UI migrado. Se o ficheiro já tiver sido guardado depois de perder as ligações sampler/sigmas, volta a ligar manualmente esses nós padrão.

O Deno Custom Nodes não inclui pesos LoRA nem workflows para este loader. Descarrega os pesos da Alibaba e cria ou adapta o teu próprio workflow nativo do ComfyUI.

### Workflow MiniMax H3 R2V com referência de áudio

O [workflow de referência de áudio para iniciantes](workflows/minimax-h3-r2v-audio-reference.json) mantém o caminho de áudio de referência nativo do MiniMax H3 e acrescenta uma linha automática de direção de prompts.

- `(Deno) Audio Transcript`: usa OpenAI Whisper local para criar letras ou diálogo, tempos por segmento, idioma detetado e resumo de confiança. Se o utilizador inserir letras ou diálogo, esse texto tem prioridade.
- `(Deno) Audio Analysis Finalizer`: conserva apenas os campos documentados de análise acústica do resultado ComfyUI `TextGenerate` e pode descarregar o modelo CLIP usado na análise depois da execução.
- `(Deno) Local LLM Loader`: recebe a transcrição e o relatório acústico pela entrada STRING opcional `audio_context`. O AUDIO original não é enviado para o LLM local e a análise automática é tratada como dados de referência, não como instruções.
- A secção escolhida do áudio original serve simultaneamente como referência `<Audio 1>` do H3 e como som incluído no MP4 final. Este workflow não descodifica o áudio gerado internamente pelo H3.

Requisitos: ComfyUI Stable atualizado com MiniMax H3 e `TextGenerate` compatível com entrada de áudio; [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) para `Load Audio (Upload)`; `gemma4_e4b_it_fp8_scaled.safetensors` em `ComfyUI/models/text_encoders/` para análise acústica; e LM Studio com `google/gemma-4-12b-qat` carregado e Local Server ativo para o passo final de direção do prompt.

`openai-whisper` é instalado como dependência do nó. O checkpoint Whisper escolhido é descarregado do endereço oficial da OpenAI na primeira execução de `(Deno) Audio Transcript`, validado por checksum pelo loader oficial e guardado em cache em `ComfyUI/models/stt/whisper/`.

### `(Deno) Text Encoder Unload`

Barreira de VRAM inline e opcional para o fluxo habitual apenas com prompt positive ou com prompts positive/negative.

![Workflow Deno Text Encoder Unload](images/text-encoder-unload-workflow.png)

- liga o conditioning positive através de `Positive Conditioning`; esta entrada é obrigatória e passa sem alterações
- opcionalmente, liga um prompt negative já codificado ou `Conditioning Zero Out` através de `Negative Conditioning`; esta entrada também passa sem alterações
- liga o `CLIP` exato usado pelos text encoders anteriores a `Text Encoder (CLIP)`
- deixa `Negative Conditioning` vazio num workflow de guider que use apenas positive
- descarrega pela gestão de modelos do ComfyUI apenas esse CLIP / text encoder, os seus clones e componentes geridos; não descarrega globalmente diffusion models, VAEs ou ControlNets
- segue a cache normal de entradas do ComfyUI, permitindo reutilizar o sampling de preview sem alterações; mudanças no conditioning ou no caminho do CLIP continuam a acionar o unload

Dynamic VRAM desloca pesos conforme a pressão de memória e pode deixar intencionalmente parte do text encoder residente. Este nó cria um ponto determinístico de libertação, mas não consegue levar todo o processo ComfyUI a `0 MiB`: contexto CUDA, conditioning tensors, outros modelos, custom nodes e outras aplicações mantêm alocações independentes. Também não melhora por si só a qualidade do sampling; cria margem de VRAM que pode reduzir model offload ou evitar um OOM. Um text encode posterior terá de voltar a carregar o modelo e `--gpu-only` não permite retirar o encoder da VRAM.

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

### `(Deno) LTX Tiled Spatial Upscaler`

Helper para segundas passagens de video latent LTX em alta resolução. Divide o video latent em spatial tiles sobrepostos, executa o upscaler por tile e mistura o resultado de volta num único latent.

Usa-o em latents LTX apenas de vídeo. Se o workflow transportar video/audio combinados, separa primeiro o caminho de áudio e volta a juntar depois do passe tiled de vídeo.

### `(Deno) LTX High resolution Tiled Sampler`

Sampler para passes de refinement LTX AV. Mantém uma trajetória global do sampler enquanto as predições de vídeo são avaliadas por spatial tiles sobrepostos e fundidas antes do update.

O áudio completo é passado para cada tile de vídeo como contexto, enquanto o latent de áudio devolvido permanece inalterado no modo `freeze`.

### `(Deno) Easy Model Download Helper`

Assistente baseado em presets para instalar conjuntos recomendados de ficheiros de modelo. Os presets incluídos abrangem o conjunto inicial LTX 2.3 GGUF para 8 GB de VRAM e o conjunto oficial LTX 2.5 Distilled INT8 de duas etapas.

![Deno Easy Model Download Helper](images/easy-model-download-helper.png)

Funcionalidades principais: abre ligações oficiais no navegador em vez de descarregar via Python, mostra raízes de modelos do ComfyUI, guarda creator presets no workflow, suporta Hugging Face e Civitai, e verifica se os ficheiros estão na pasta correta. O preset LTX 2.5 inclui o diffusion model, o text encoder Gemma 4 com projection, os VAE de vídeo e áudio e o x2 spatial upscaler necessário para o processo de duas etapas.

Os ficheiros LTX 2.5 exigem início de sessão no Hugging Face e aprovação em **Agree and Access** antes do download. O assistente não contorna essa restrição nem descarrega modelos automaticamente. Consulta a [LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md), pede acesso no [repositório oficial LTX 2.5](https://huggingface.co/Lightricks/LTX-2.5), usa as ligações abertas pelo nó e move cada ficheiro descarregado para a pasta de modelos do ComfyUI apresentada no ecrã.

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

### `(Deno) Multi LoRA Loader`

Carregador multi LoRA genérico para workflows normais de diffusion no ComfyUI. Aplica até oito LoRAs ao `MODEL` ligado e ao `CLIP` opcional; permite ativar ou desativar cada slot sem perder a seleção guardada, definir strengths separados para model e CLIP, guardar trigger words e notas, reordenar slots e enviar os resultados `model` e `clip` corrigidos.

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

Este nó prepara apenas text conditioning. Liga as saídas `positive` e `negative` ao nó nativo `(Bernini) Conditioning` da versão atual do ComfyUI Stable para construir o conditioning visual / context-latent do Bernini. O backend do Bernini foi integrado oficialmente pelo [PR #14216 do ComfyUI](https://github.com/Comfy-Org/ComfyUI/pull/14216), por isso o antigo updater de preview deixou de ser necessário; atualiza o ComfyUI Stable se o nó nativo de conditioning não aparecer.

### `(Deno) Prompt Text`

Pequena fonte STRING multiline para manter system prompts, user prompts, templates ou texto JSON longo legível no seu próprio nó. Usa-a para ligar o texto sem alterações ao Ideogram Director, Local LLM Loader ou a outra entrada STRING.

### `(Deno) Local LLM Loader` / `(Deno) Local LLM Reviewer`

Nós para chamar, a partir do ComfyUI, LLM locais que já estejam a correr no PC e usar um review text do LLM para permitir ou bloquear resultados antes de serem guardados.

Funcionalidades principais: chama modelos Ollama, LM Studio, llama.cpp, vLLM, servidores Custom OpenAI-compatible, llama-swap ou Unsloth Studio; usa `127.0.0.1` / `localhost` por predefinição e permite autorizar um endereço privado LAN `IP:port` exato com `DENO_LOCAL_LLM_ALLOWED_HOSTS`; atualiza listas de modelos por provider; interrompe requests em curso; usa APIs de gestão do llama-swap / Unsloth Studio para unload manual ou após a execução; processa prompt batches sequencialmente numa única execução; anexa IMAGE a modelos de visão; mostra Thinking / Result; controla IMAGE / AUDIO antes dos nós Save; aprova uma vez o resultado atual ou volta a executar apenas o caminho anterior ao reviewer. O Result final é guardado nos metadata PNG / workflow e restaurado ao reabrir; Thinking / reasoning não é guardado.

O provider `Unsloth` destina-se apenas ao Unsloth Studio e usa por predefinição `http://127.0.0.1:8888/v1`. Se executares no LM Studio um GGUF obtido do Unsloth, seleciona `LM Studio`, não `Unsloth`. Antes de iniciar o ComfyUI é necessário definir a variável de ambiente `DENO_LOCAL_LLM_UNSLOTH_API_KEY`; a chave não é guardada em workflows nem metadata PNG.

LM Studio remoto: o provider dedicado `LM Studio` usa atualmente `http://127.0.0.1:1234/v1`. Para ligar ao LM Studio noutro PC teu na mesma LAN de confiança, ativa **Serve on Local Network** nesse PC, define uma lista exata de destinos permitidos antes de iniciar o ComfyUI (por exemplo `DENO_LOCAL_LLM_ALLOWED_HOSTS=192.168.1.50:1234`), reinicia o ComfyUI e seleciona `Custom`, com `http://192.168.1.50:1234/v1` como Custom Server URL. A lista só aceita pares exatos de IP privado e porta e não é guardada em workflows nem metadata PNG. O conector Custom não envia tokens de autenticação nem usa as funções de libertação de memória específicas do LM Studio: limita o acesso à porta do servidor ao PC do ComfyUI na firewall do anfitrião e gere o modelo remoto no LM Studio.

Se o LM Studio rejeitar o campo opcional de controlo de reasoning antes de iniciar a geração, o nó volta a tentar uma vez sem esse campo. Depois disso, o comportamento de reasoning depende do server e model selecionados.

Nota de áudio: Local LLM Loader não envia AUDIO original diretamente ao modelo local. A entrada STRING opcional `audio_context` pode receber uma transcrição e um relatório acústico anteriores como dados de referência, sem alterar o prompt do utilizador. Local LLM Reviewer pode permitir ou bloquear AUDIO quando outro nó de geração de texto compatível com áudio produz o review text.

## Why This Exists

Estes nós reduzem fricções repetidas no trabalho real com ComfyUI. O objetivo não é ter uma lista enorme de funcionalidades, mas tornar os workflows diários mais rápidos, limpos e fáceis de ensinar.

## Search Tips

- No Manager, procura `Deno Custom Nodes` para encontrar o pacote.
- No canvas, procura `(Deno)` para filtrar os seus nós ou um nome específico, como `Resize Box`.
- Usa o botão verde `i` de um nó para consultar a ajuda sem sair do canvas.

## Install

<details>
<summary>Instalação e atualização manual</summary>

Para uma instalação manual, clona o repositório dentro da pasta `custom_nodes` do ComfyUI e instala as dependências com o mesmo Python que inicia o ComfyUI:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
cd comfyui-deno-custom-nodes
python -m pip install -r requirements.txt
```

Para atualizar manualmente, executa `git pull --ff-only` na pasta do repositório, volta a instalar `requirements.txt` com o mesmo Python e reinicia o ComfyUI. As instalações via ComfyUI Manager / Registry tratam automaticamente das dependências do pacote.

</details>

## License

Podes usar, estudar, modificar e redistribuir este repo sob GPL-3.0.

Os nós, documentos, exemplos, workflows e assets do projeto pertencentes à DENO neste repo são publicados sob GNU GPL v3.0 (`GPL-3.0-only`). O uso comercial é permitido, mas as versões modificadas que forem distribuídas devem seguir a GPL-3.0 e manter os avisos de licença e copyright exigidos.

Modelos, checkpoints, LoRAs, bibliotecas, ferramentas e serviços de terceiros mantêm as suas próprias licenças e condições. Se um workflow usar um modelo ou asset específico, confirma e segue essa licença antes de partilhar ou vender resultados.

## Release Notes

Consulta as alterações em [CHANGELOG.md](../CHANGELOG.md).

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
