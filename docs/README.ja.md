# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

![Deno Custom Nodes banner](images/deno-custom-nodes-banner.jpg)

画像・動画の準備、モデルの読み込み、キャンバスの整理を手助けする ComfyUI カスタムノード集です。

[GPL-3.0](../LICENSE)

- **画像を準備・比較する:** [Resize Box、画像ローダー、比較ノード](#deno-resize-box)。
- **生成ワークフローを組む:** [MiniMax H3](#deno-minimax-h3-multi-reference-image-loader)、[LTX](#deno-ltx-model-loader)、[ローカル LLM](#deno-local-llm-loader--deno-local-llm-reviewer)。
- **キャンバスと出力を整理する:** [Visual Fold](#deno-visual-fold)、[Floating Tools](#deno-floating-tools)、[ブラウザツール](#web-tools)。

## Quick Start

ComfyUI がインストール済みの環境で始めてください。

1. ComfyUI Manager を開き、`Deno Custom Nodes` を検索します。
2. パッケージをインストールし、ComfyUI を再起動します。
3. キャンバスの空いている場所をダブルクリックし、`(Deno) Resize Box` を検索して追加します。
4. `Preset Ratio` と megapixels を選び、出力の `width` / `height` を設定します。
5. `Load Image` を追加して画像を選択またはアップロードし、その `IMAGE` 出力を Resize Box の `image` 入力へ接続します。Resize Box の `image` 出力を `Preview Image` へ接続し、`Run` でリサイズ結果を確認します。

[全ノード](#included-nodes) · [ブラウザツール](#web-tools) · [Visual Fold](#deno-visual-fold) · [Floating Tools](#deno-floating-tools) · [手動インストール](#install) · [ライセンス](#license)

多くの Deno ノードには、キャンバスを離れずに説明を確認できる小さな緑色の `i` ボタンがあります。新しい Deno Custom Nodes バージョンがある場合、このボタンは黄色になり、小さな `!` バッジを表示します。

## Web Tools

ブラウザで直接使えるツールです。

- [DENO Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - 2つの動画をスライダー、横並び、差分、トグル表示で比較します。
- [DENO Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - 短いクリップをトリム、クロップ、リサイズして GIF または軽量 WebP に書き出します。
- [DENO Discord向け動画 / 画像圧縮](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - 動画や画像を縮小し、可能な限り Discord 向けに 10MB 以下で保存します。UI は韓国語のみです。

## DENO Visual Fold

[![DENO Visual Fold](images/deno-visual-fold-preview.webp)](images/deno-visual-fold.webp)

DENO Visual Fold は、大きな ComfyUI グラフを視覚的に整理するための機能です。ノードやグループを折りたたんでも、ワークフローのロジックは変更されません。

2つ以上のノードを選択すると、ComfyUI 標準の選択ツールバーに緑色の `Fold` ボタンが表示されます。クリックすると選択したノードが1つのコンパクトな視覚グループとして折りたたまれ、`Unfold` で戻せます。通常の ComfyUI グループを1つ選んだ場合は `Fold Group` を使えます。複数グループを選ぶと整列アクションも表示されます。

Subgraph はノードを子グラフへ移動しますが、Visual Fold は単なる視覚整理です。`Get` / `Set` ノードや親子グラフ構造をメイン画面に残したい時に便利です。

## DENO Floating Tools

DENO Floating Tools は `Settings > DENO > Tools` にある任意の補助機能で、初期状態では無効です。

有効にすると、ComfyUI 画面に小さなドラッグ可能な DENO アイコンが追加されます。パネルから ComfyUI 標準のメモリー解放機能で VRAM を解放し、現在と最新の ComfyUI Stable バージョンを読み取り専用で確認し、実行エラー時には Error Help レポートを開けます。

Error Help は、現在のワークフロー、Python 実行ファイルと環境、パッケージ、GPU、直近の traceback / log、カスタムノードの概要を GPT / Gemini 向けレポートにまとめます。レポート画面を先に開く読み取り専用機能で、`Copy Report` を押した時だけコピーします。token、cookie、password、private key、URL 認証情報などの一般的な秘密情報はコピー前にマスクされます。

Floating Tools はインストール、更新、再起動、修復、ワークフロー変更を行いません。

## Included Nodes

### `(Deno) Ideogram Director`

構造化 JSON caption と bbox レイアウトを ComfyUI キャンバス上で編集する、Ideogram 4 向けの視覚的プロンプトビルダーです。

[![Ideogram Director — Demo](images/ideogram-director-video-thumbnail.jpg)](https://youtu.be/Z8s27skkIDM)

- bbox 領域を描画・編集し、順序を変えずに個別の box を一時無効化できます。
- bbox をダブルクリックするとポインターの近くで編集でき、重なった位置を `Alt`+クリックで繰り返し選ぶと下の box を順に切り替えられます。
- Local LLM Loader などの STRING ソースから JSON prompt を読み込み、既存 board の置換確認と不正な JSON の明確な拒否に対応します。
- 任意の Summary / Background STRING 入力は、その実行時だけ対応する board 欄を上書きします。未接続時は保存された文章を使います。
- style / layout preset gallery と Language view で説明を自分の言語で編集できます。最終出力は生成用英語を保ち、看板やロゴ、見出しなど TEXT box 内の文字列はそのまま維持します。
- 出力: `prompt`, `width`, `height`, `seed`, `bboxes`。
- `bboxes` は標準 `BBOX` と、`Ideogram4_MultiLora_BoundingBoxNode_Fedor` などの `BOUNDING_BOX` 入力に接続できます。同ノードの region 行数は Director の有効 box 数に同期し、Director の保存 field は増えません。現在は個数だけの同期で box 自体の識別は追跡しないため、途中の box を削除・並べ替えた後は LoRA 行の割り当てを確認してください。

### `(Deno) Resize Box`

ComfyUI 用の解像度補助と画像リサイズノードです。

![Deno Resize Box](images/resize-box.jpg)

主な機能: `Preset Ratio` / `Manual Input`、比率プリセット、メガピクセル計算、`divisible_by` 整列、`Center Crop (Fill)`、比率固定でズーム可能な `Crop Position (Fill)`、`Fit (Letterbox/Pillarbox)`、既定の `lanczos` 補間、`image`, `width`, `height` 出力。

`Crop Position (Fill)` は接続した元画像全体を表示します。crop 枠をドラッグして位置を変え、四隅のいずれかをドラッグしてズームできます。出力比率とメガピクセル数は維持されます。

### `(Deno) Multi Image Loader`

バッチガイド系ワークフロー向けの複数画像ローダーです。

![Deno Multi Image Loader](images/multi-image-loader.jpg)

主な機能: 固定高さギャラリー、ドラッグ並べ替え、アップロード、ドラッグ&ドロップ、画像貼り付け、ComfyUI `input` フォルダー参照、ネストフォルダー対応、新しい順の画像ソート、比率維持/プリセット/手入力リサイズ、`multi_output`, `width`, `height` 出力。

### `(Deno) MiniMax H3 Multi Reference Image Loader`

ComfyUI 標準の MiniMax H3 Reference to Video ワークフロー向けに、複数の参照画像を1本で接続できるローダーです。

`(Deno) Multi Image Loader` と同じ upload、paste、drag-and-drop、Input Folder、カード並べ替え、削除の操作感を保ちます。最大9枚を専用の `ref_images` socket から渡し、各画像の元のサイズと縦横比を resize、crop、padding せず個別に保持します。カード順は `<Picture 1>`, `<Picture 2>` の順に対応し、同じ画像を `(Deno) Local LLM Loader` の `image` 入力へ接続できる `image_list` としても出力します。

付属の `(Deno) MiniMax H3 Reference to Video` は画像入力だけを1本にまとめ、標準の reference video、video audio、standalone audio の Autogrow 入力は維持します。この2つの MiniMax H3 ノードには ComfyUI 0.30.0 以降が必要です。全体構成は [MiniMax H3 複数参照サンプルワークフロー](workflows/minimax-h3-multi-reference.json) で確認できます。

### `(Deno) MiniMax H3 Acc LoRA Loader`

Alibaba PAI 公式の [MiniMax-H3-Acc-LoRAs](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs) を、safetensors ファイルの変換や複製なしで直接読み込みます。

1. 公式 FL2VA または Ref2VA の `Acc-8Step.safetensors` をダウンロードし、通常の `ComfyUI/models/loras/` または専用の `ComfyUI/models/minimax_h3_acc_loras/` に置きます。
2. 対応する標準 MiniMax H3 diffusion model を `model` に接続します。full モデルと Comfy-Org の `*_pruned_*` 版に対応しています。
3. FL2VA/T2VA には FL2VA、Ref2VA には Ref2VA の Acc-LoRA を選びます。
4. このノードの単一 `model` 出力を通常の guider 経路に接続します。
5. sampling 経路は ComfyUI 標準ノードで組みます。最初は `BasicScheduler: simple, steps: 8` と `KSamplerSelect: euler` を `SamplerCustomAdvanced` に接続する構成を推奨します。

このノードは静的な LoRA 重みと checkpoint の32個の時間依存 PDD 出力 head を適用します。sampling 時に ComfyUI が渡す実際の sigma 境界を読み、その区間に合わせて PDD head を自動で融合するため、sampler・scheduler・step は通常の ComfyUI ノードで調整できます。公式の8-step Simple/Euler が学習時の構成であり、推奨設定です。loader を変更せず Simple Scheduler の4〜12 steps を選べますが、その他の降順 schedule や latent upscale 用の分割 sigma pass は実験用で、品質向上を保証するものではありません。標準 MiniMax H3 の video/audio sigma shift は `12.0 / 3.0`、LoRA strength は `1.0` を維持してください。

標準 ComfyUI INT8 版を含む非 pruned の full モデルでは、ComfyUI の量子化対応 LoRA 経路で adapter 全体を適用します。curve-pruned モデルでは、`models/diffusion_models/` にある対応する非 pruned MiniMax H3 checkpoint を探し、その小さな FP32 time-embedder 部分だけを読み、50個すべての full-width AdaLN LoRA 更新を幅8の pruned curve に写す bridge をメモリー内で計算します。この計算のために checkpoint 全体を読み込むことはありません。対応する full checkpoint がない場合も互換モードで使用でき、1回警告して50個の AdaLN 更新を省略し、それ以外の LoRA 更新と PDD head を適用します。

v0.7.92〜v0.7.94 の3出力 loader で保存した標準の有効な UI workflow は、ComfyUI キャンバスで開く際に移行されます。既存の model 接続を維持し、旧 sampler / sigmas 接続を編集可能な標準 `KSamplerSelect: euler` と `BasicScheduler: simple, steps: 8` に移します。開いた後に UI workflow を一度保存してください。現在の1出力 workflow は変更しません。mute / bypass ノード、未知のカスタム構成、不正な graph は変更しません。raw API prompt JSON にはこの frontend 移行が適用されないため、移行後の UI workflow から再エクスポートしてください。旧 sampler / sigmas 接続が消えた状態で既に保存したファイルは、標準ノードを手動で接続し直してください。

LoRA 重みとワークフローは Deno Custom Nodes に同梱されません。Alibaba から重みをダウンロードし、標準 ComfyUI workflow を自分で組むか調整してください。

### MiniMax H3 R2V 音声参照ワークフロー

[初心者向け音声参照ワークフロー](workflows/minimax-h3-r2v-audio-reference.json) は、ComfyUI 標準の MiniMax H3 音声参照経路を保ちながら、自動 prompt direction の流れを追加します。

- `(Deno) Audio Transcript`: ローカル OpenAI Whisper で歌詞や台詞、segment 時刻、検出言語、confidence の概要を作ります。ユーザーが入力した歌詞や台詞がある場合は、その文言を優先します。
- `(Deno) Audio Analysis Finalizer`: ComfyUI `TextGenerate` の結果から文書化された音響分析項目だけを残し、任意で分析用 CLIP model を実行後に unload します。
- `(Deno) Local LLM Loader`: 任意の `audio_context` STRING 入力で transcript と音響レポートを受け取ります。raw AUDIO はローカル LLM に送らず、自動分析は命令ではなく参考データとして扱います。
- 選択した元音声区間は H3 の `<Audio 1>` 参照であると同時に、最終 MP4 に mux される音声です。このワークフローでは H3 の内部生成音声を decode しません。

必要なもの: MiniMax H3 と音声入力対応 `TextGenerate` を含む最新の ComfyUI Stable、`Load Audio (Upload)` 用の [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)、音響分析用の `ComfyUI/models/text_encoders/gemma4_e4b_it_fp8_scaled.safetensors`、そして最終 prompt director 用に `google/gemma-4-12b-qat` を読み込んだ LM Studio Local Server。

`openai-whisper` はノード依存関係としてインストールされます。選択した Whisper checkpoint は `(Deno) Audio Transcript` の初回実行時に OpenAI の公式 URL から取得され、公式 loader が checksum を検証し、`ComfyUI/models/stt/whisper/` に cache します。

### `(Deno) Text Encoder Unload`

一般的な positive-only または positive/negative prompt フローに挿入できる、任意使用の VRAM barrier ノードです。

![Deno Text Encoder Unload ワークフロー](images/text-encoder-unload-workflow.png)

- positive conditioning を必須入力の `Positive Conditioning` に接続します。conditioning は変更されず、そのまま出力されます。
- encoded negative prompt または `Conditioning Zero Out` は、任意入力の `Negative Conditioning` に接続できます。こちらも変更されず、そのまま出力されます。
- upstream の text encoder が使用した正確な `CLIP` を `Text Encoder (CLIP)` に接続します。
- positive-only guider ワークフローでは `Negative Conditioning` を空のままにします。
- ComfyUI model management を通じて、その CLIP / text encoder、その clone と管理対象 component だけを unload し、diffusion model、VAE、ControlNet は global unload しません。
- ComfyUI の通常の input cache に従うため、変更のない preview sampling は再利用でき、conditioning または CLIP path が変わった場合は unload が再実行されます。

Dynamic VRAM は memory pressure に応じて weight を移動するため、text encoder の一部を意図的に残す場合があります。このノードは明確な解放地点を作りますが、ComfyUI process 全体を `0 MiB` にはできません。CUDA context、conditioning tensor、他の model、custom node、他アプリの割り当ては別です。また sampling 品質そのものを上げる機能ではなく、model offload や OOM を減らすための VRAM 余裕を作ります。次の text encode では model の再読み込みが必要になり、`--gpu-only` では encoder を VRAM 外へ移動できません。

### `(Deno) Advanced Image Source Loader`

外部フォルダー、ローカルパス、Web画像URL、サイズ混在の画像リストが必要なワークフロー向けの高度な画像ソースローダーです。

![Deno Advanced Image Source Loader](images/advanced-image-source-loader.png)

主な機能: ComfyUI `input` と外部ローカルフォルダー、URL/Path 入力、アップロードと貼り付け、サムネイルの有効/無効、ドラッグ並べ替え、masonry 風ギャラリー、再帰フォルダー読み込み、batch tensor と `image_list` 出力。

### `(Deno) Image Compare`

ComfyUI キャンバス上で2枚の画像を素早く確認できる A/B 比較ノードです。

![Deno Image Compare](images/image-compare.jpg)

主な機能: `image_a` と `image_b` の比較、Slider/Side by Side/Difference/Toggle、hover スライダー、A/B ラベル、Swap ボタン、リサイズ可能な内部プレビュー。

### `(Deno) Video Compare`

アップスケールや FPS 補間の結果を ComfyUI キャンバス内で確認するための動画 A/B 比較ノードです。

主な機能: `video_a`, `video_b`, 任意の `audio_a`, `audio_b`、Slider/Side by Side/Difference/Toggle、再生/一時停止、スクラブ、フレームステップ、速度、ループ、出力バッジ、`comparison` 画像出力。

重く感じる場合はブラウザ版も使えます: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/

![Deno Video Compare - Slider](images/video-compare.png)

![Deno Video Compare - Side by Side](images/video-compare-sbs.png)

![Deno Video Compare - Difference](images/video-compare-diff.png)

### `(Deno) Video Preview`

グラフの途中で、実際にエンコードされた動画出力を確認するためのフル解像度プレビューノードです。

![Deno Video Preview](images/video-preview.jpg)

主な機能: IMAGE batch 入力とそのままの出力、任意の音声 mux、hover 音声、クリックで再生/一時停止、Full screen ボタン、解像度/FPS/フレーム数/長さのバッジ、PyAV 未導入時の分かりやすい案内。

### `(Deno) RTX Video Super Resolution`

NVIDIA RTX Video Super Resolution を ComfyUI で簡単に試すための Windows/NVIDIA RTX 向け補助ノードです。

![Deno RTX Video Super Resolution](images/rtx-vfx-easy-upscale-node.png)

初心者向け手順: `deno-custom-nodes` をインストールまたは更新し、ComfyUI を起動し、ノードを追加して一度実行します。NVIDIA VFX が無いと表示されたら ComfyUI を完全に閉じ、`How to install` のガイドに従います。BAT のパスを確認して `Y`、完了後に ComfyUI を再起動します。

NVIDIA 公式リンク: [NVIDIA Maxine Windows Getting Started](https://docs.nvidia.com/deeplearning/maxine/vfx-sdk-programming-guide/index.html), [RTX Video FAQ](https://nvidia.custhelp.com/app/answers/detail/a_id/5448/~/rtx-video-faq).

### `(Deno) RTX Video Super Resolution (2 Pass)`

動画仕上げ向けの2パス RTX ノードです。最初に同サイズの `Denoise` または `Deblur` を任意で行い、その後 `VSR` または `High Bitrate` アップスケールを行えます。

サンプルワークフロー: [RTX 2-pass upscale workflow](workflows/deno-rtx-lowram-metabatch.json)

主な機能: Low System Memory と High System Memory の2系統、VHS Meta Batch による低メモリー処理、元 FPS の引き継ぎ、音声保持、実際のエンコード動画の仕上げに向いた構成。

### `(Deno) LTX Sequencer`

複数画像 LTX ワークフロー向けのガイドシーケンサーです。

![Deno LTX Sequencer](images/ltx-sequencer.jpg)

主な機能: `(Deno) Multi Image Loader` の batch 出力と連携、可能な場合 `num_images` を自動入力、sync スタイルを維持、必要な strength だけを手動制御、bypass による素早い A/B テスト。

### `(Deno) LTX Model Loader`

LTX 2.3 のよく使うモデル読み込みパターンを1つにまとめたローダーです。

![Deno LTX Model Loader](images/ltx-model-loader.jpg)

主な機能: Checkpoint Style、KJ Style、GGUF Style、`model`, `clip`, `video_vae`, `audio_vae` 出力、ComfyUI 標準ローダー、KJNodes、ComfyUI-GGUF の流れをサポート。

### `(Deno) LTX Tiled Spatial Upscaler`

高解像度 LTX video latent の二次パス向け helper です。video latent を重なりのある spatial tile に分け、tile ごとに latent spatial upscaler を実行して、1つの latent にブレンドします。

video-only の LTX latent に使ってください。video/audio 結合 latent を使う場合は、先に audio 経路を分離し、tiled video pass の後で再結合する流れを推奨します。

### `(Deno) LTX High resolution Tiled Sampler`

LTX AV refinement pass 向けの sampler です。1つの global sampler trajectory を保ちながら、video prediction を重なりのある spatial tile で計算して融合します。

各 video tile には full audio latent を context として渡し、`freeze` mode では返される audio latent を変更しません。

### `(Deno) Easy Model Download Helper`

推奨モデルファイルセットを案内するプリセット型セットアップヘルパーです。組み込み preset には、従来の LTX 2.3 8GB VRAM GGUF セットと、公式 LTX 2.5 Distilled INT8 の2段階 model set が含まれます。

![Deno Easy Model Download Helper](images/easy-model-download-helper.png)

主な機能: Python で直接ダウンロードせず公式モデルリンクをブラウザで開く、ComfyUI モデルルート表示、workflow 内 creator preset 保存、Hugging Face と Civitai リンク対応、対象フォルダーにファイルがあるか確認。LTX 2.5 preset には diffusion model、projection 付き Gemma 4 text encoder、video / audio VAE、2段階処理用 x2 spatial upscaler が含まれます。

LTX 2.5 のファイルには Hugging Face へのログインと **Agree and Access** の承認が必要です。この helper はアクセス制限を迂回せず、自動ダウンロードも行いません。[LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md) を確認し、[公式 LTX 2.5 repository](https://huggingface.co/Lightricks/LTX-2.5) でアクセス権を取得してから、ノードが開く browser link を使い、ダウンロードしたファイルを表示された ComfyUI model folder へ移動してください。

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

### `(Deno) Multi LoRA Loader`

通常の ComfyUI diffusion ワークフロー向けの汎用 multi LoRA loader です。接続した `MODEL` と任意の `CLIP` に最大8個の LoRA を適用し、保存した選択を失わずに slot ごとの有効/無効、model / CLIP strength、trigger word、note、slot 順序を管理して、patch 済みの `model` と `clip` を出力します。

### `(Deno) LTX Multi LoRA Loader`

LTX ワークフロー向けの Power-LoRA 風マルチ LoRA ローダーです。

![Deno LTX Multi LoRA Loader](images/ltx-multi-lora-loader.png)

主な機能: 複数 LoRA、スロット別 enable、strength/video/audio strength、trigger word と note、trigger word コピー、パッチ済み `model` と `clip` 出力。

### `(Deno) LTX Prompt Guide`

LTX prompt encoding、任意の negative prompt、LTX conditioning、台詞長の計画をまとめるプロンプトヘルパーです。

![Deno LTX Prompt Guide](images/ltx-prompt-guide.png)

主な機能: positive prompt encoding、折りたたみ negative prompt、`frame_rate` 付き LTX conditioning、引用符内の台詞長推定、Auto/Korean/English/Japanese/Chinese の台詞推定。

### `(Deno) Bernini Prompt Guide`

KJ-style Bernini の prompt prefix を使いやすくするためのプロンプトヘルパーです。positive/negative prompt encoding を1つのノードにまとめ、選択した `System Prompt` モードに合わせた system prompt をノード上部に表示します。

![Deno Bernini Prompt Guide](images/bernini-prompt-guide.jpg)

主な機能: `Text to Video`, `Image to Video`, `Reference Video Edit` などの読みやすい System Prompt 選択、reference mode の `image0` / `image1` naming hint、折りたたみ negative prompt、Official Wan2.2 negative preset の自動入力、`positive` / `negative` 出力。

Negative preset は出力モードではなく、下の negative prompt 欄を自動で埋めるためのものです。プリセット入力後にその欄を直接編集すると、編集後の内容が最終 negative conditioning に使われます。

プロンプトはタグを並べるより、チャットボットに指示するように書きます。例: `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`

このノードが準備するのは text conditioning だけです。`positive` と `negative` の出力を現在の ComfyUI Stable に含まれる標準の `(Bernini) Conditioning` ノードへ接続すると、Bernini visual / context-latent conditioning を構成できます。Bernini backend は [ComfyUI PR #14216](https://github.com/Comfy-Org/ComfyUI/pull/14216) で正式に統合されたため、以前の preview-backend updater は不要です。標準 conditioning ノードが見つからない場合は、まず ComfyUI Stable を更新してください。

### `(Deno) Prompt Text`

system prompt、user prompt、template、JSON などの長い文章を独立したノードで読みやすく保持し、STRING として接続する小さな multiline 入力ノードです。文章を変えずに Ideogram Director、Local LLM Loader、または他の STRING 入力へ渡したい時に使います。

### `(Deno) Local LLM Loader` / `(Deno) Local LLM Reviewer`

PC 上ですでに動作しているローカル LLM を ComfyUI から呼び出し、LLM の review text で保存前の結果を通すか止めるためのノードです。

主な機能: Ollama、LM Studio、llama.cpp、vLLM、Custom OpenAI-compatible server、llama-swap、Unsloth Studio のローカルモデル呼び出し、既定では `127.0.0.1` / `localhost` を使い、`DENO_LOCAL_LLM_ALLOWED_HOSTS` で private LAN の正確な `IP:port` を明示許可できる server 制限、provider 別 model list の更新、実行中 request の中止、llama-swap / Unsloth Studio の management API による手動または実行後 unload、prompt batch の順次処理、vision model への IMAGE 添付、Thinking / Result preview、Save node 前の IMAGE / AUDIO gate、現在の review 結果の1回承認、reviewer より前の経路だけの再実行。Local LLM node の最終 Result は PNG / workflow metadata に保存され、再度開くと node 内に復元されますが、Thinking / reasoning は保存されません。

`Unsloth` provider は Unsloth Studio server 専用で、既定 URL は `http://127.0.0.1:8888/v1` です。Unsloth の GGUF を LM Studio で動かす場合は `Unsloth` ではなく `LM Studio` を選びます。使用には ComfyUI 起動前に `DENO_LOCAL_LLM_UNSLOTH_API_KEY` 環境変数の設定が必要で、この key は workflow や PNG metadata に保存されません。

別 PC の LM Studio: 専用の `LM Studio` provider は現在 `http://127.0.0.1:1234/v1` を使用します。同じ信頼できる LAN 内の自分の PC に接続する場合は、接続先で **Serve on Local Network** を有効にし、ComfyUI 起動前に正確な許可先（例: `DENO_LOCAL_LLM_ALLOWED_HOSTS=192.168.1.50:1234`）を設定して再起動します。その後 `Custom` を選び、Custom Server URL に `http://192.168.1.50:1234/v1` を指定してください。許可リストは private IP と port の完全一致だけに対応し、workflow / PNG metadata には保存されません。Custom 接続は認証 token を送信せず、LM Studio 専用 unload helper も使いません。接続先 firewall で server port の接続元を ComfyUI PC に制限し、リモートモデルは LM Studio 側で管理してください。

LM Studio が生成開始前に任意の reasoning-control field を拒否した場合、node はその field を除いて1回だけ再試行します。その後の reasoning は選択した server と model の既定動作に従います。

音声について: Local LLM Loader は raw AUDIO をローカルモデルへ直接送りません。任意の `audio_context` STRING 入力で upstream の transcript と音響レポートを、user prompt を変更しない参考データとして受け取れます。Local LLM Reviewer は、別の audio-capable text generation node が作った review text に基づいて AUDIO を通すか止めることができます。

## Why This Exists

このノード群は、実際の ComfyUI 制作で繰り返される準備の手間を減らすために作られました。巨大な機能リストよりも、毎日使うワークフローを速く、きれいに、教えやすくすることを目指しています。

## Search Tips

- Manager でパッケージを探すときは `Deno Custom Nodes` を検索します。
- キャンバスでは `(Deno)` で絞り込むか、`Resize Box` など目的のノード名を検索します。
- ノードの緑色の `i` ボタンから、その場で使い方を確認できます。

## Install

<details>
<summary>手動インストールと更新</summary>

手動インストールでは、ComfyUI の `custom_nodes` フォルダー内で clone し、ComfyUI を起動しているものと同じ Python で依存関係をインストールします。

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
cd comfyui-deno-custom-nodes
python -m pip install -r requirements.txt
```

手動更新では repository folder で `git pull --ff-only` を実行し、同じ Python で `requirements.txt` をもう一度インストールしてから ComfyUI を再起動します。ComfyUI Manager / Registry のインストールでは package dependency が自動で処理されます。

</details>

## License

この repo は GPL-3.0 のもとで利用、学習、変更、再配布できます。

この repo に含まれる DENO 所有のノード、ドキュメント、サンプル、ワークフロー、プロジェクト内アセットは GNU GPL v3.0 (`GPL-3.0-only`) で公開されています。商用利用も可能ですが、変更版を配布する場合は GPL-3.0 に従い、必要なライセンス表示と著作権表示を保持してください。

外部モデル、チェックポイント、LoRA、ライブラリ、ツール、サービスには、それぞれのライセンスと利用条件があります。特定のモデルやアセットを使うワークフローを共有または販売する場合は、そのライセンスを確認して従ってください。

## Release Notes

更新内容は [CHANGELOG.md](../CHANGELOG.md) を参照してください。

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
