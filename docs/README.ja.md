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
  <b>制作の流れ全体を支える、実用的な ComfyUI ノード集です。</b><br>
  入力の準備、モデルへの指示、結果の比較、最終的な見た目の調整、大きなグラフの整理までを手助けします。
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="README.ko.md">한국어</a> · 日本語 · <a href="README.zh-CN.md">简体中文</a> · <a href="README.es.md">Español</a> · <a href="README.pt-PT.md">Português (PT)</a> · <a href="README.pt-BR.md">Português (BR)</a> · <a href="README.id.md">Bahasa Indonesia</a>
</p>

<p align="center">
  <a href="#クイックスタート">クイックスタート</a> · <a href="#ワークフローマップ">ワークフローマップ</a> · <a href="#ウェブツール">ウェブツール</a> · <a href="#収録ノード">ノードリファレンス</a> · <a href="#安全性とプライバシー">安全性</a> · <a href="https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest">最新リリース</a>
</p>

> [!NOTE]
> **v0.7.126 の新機能:** [`(Deno) MiniMax H3 Tiled Sampler`](#deno-minimax-h3-tiled-sampler) は、アップスケールした MiniMax H3 の動画+音声 latent を重なりのある tile に分けて仕上げます。これにより 16GB GPU でも最終の高解像度パスを実行できます。
>
> **v0.7.125** では、Local LLM のサーバーアドレス、Easy Model Download Helper のリンク、Ideogram Director の画像保存を厳格にしました。ノード ID、入力、保存済みワークフローは変わりません。[CHANGELOG](../CHANGELOG.md) を参照してください。

## クイックスタート

ComfyUI が動作する環境から始めてください。

1. **ComfyUI Manager** を開き、`Deno Custom Nodes` を検索してパッケージをインストールします。
2. ComfyUI を再起動し、ブラウザのページを更新します。
3. キャンバスの空いている場所をダブルクリックし、`(Deno) Resize Box` を検索して追加します。
4. 標準の `Load Image` ノードを追加して画像を選びます。これを Resize Box に接続し、Resize Box の `image` 出力を `Preview Image` に接続します。サイズを選んでワークフローを実行すると、リサイズした画像を確認できます。

この最初の例には生成モデルは不要です。各モデルや RTX ノードに必要なものは、以下のそれぞれの項目に記載しています。Manager を使わない場合は、[手動インストール](#インストール)を参照してください。

多くの Deno ノードには、右上に小さな緑色の `i` ボタンがあり、キャンバスを離れずにノードの情報を確認できます。新しい Deno Custom Nodes バージョンがある場合、このボタンは黄色になり、小さな `!` バッジを表示します。

## ワークフローマップ

<p align="center">
  <img src="images/readme/workflow-map.webp" alt="ワークフローマップ: 準備、生成、比較、仕上げ、整理" width="920">
</p>

すべての Deno ノードは、ComfyUI 制作の流れのいずれかの段階に属します。作業中の段階から探してください。

### 01 · 準備

モデルを実行する前に、すべての画像、参照、サイズを整えます。

<p align="center">
  <img src="images/readme/multi-image-loader.webp" alt="6枚の画像を読み込み、1枚を無効にした Multi Image Loader" width="370">&nbsp;&nbsp;
  <img src="images/readme/h3-reference-loader.webp" alt="画像3枚と音声参照2つを読み込んだ MiniMax H3 Multi Reference Image Loader" width="370">
</p>

| ノード | 内容 | 必要なもの |
| --- | --- | --- |
| [Resize Box](#deno-resize-box) | 比率、メガピクセル、クロップによるリサイズ。ドラッグできるクロップのライブプレビュー付き | — |
| [Multi Image Loader](#deno-multi-image-loader) | 順序付きの1つのギャラリーと1本のケーブル。カードをクリックすると削除せずにスキップできます | — |
| [Advanced Image Source Loader](#deno-advanced-image-source-loader) | フォルダーアップロード、バッチの連結、サイズが混在する `image_list` 出力 | — |
| [MiniMax H3 Multi Reference Image Loader](#deno-minimax-h3-multi-reference-image-loader) | 画像最大9枚と音声ファイル最大3つを、それぞれ元のサイズのまま保持 | ComfyUI 0.30.0+ |

### 02 · 生成

レイアウト、参照、プロンプト、LoRA を、キャンバス上で読みやすいままモデルに指示します。

<p align="center">
  <img src="images/readme/ideogram-director.webp" alt="タイトル、被写体、車、タグラインの box を、生成されたポスターの上に重ねた Ideogram Director のボード" width="640">
</p>

| ノード | 内容 | 必要なもの |
| --- | --- | --- |
| [Ideogram Director](#deno-ideogram-director) | bbox レイアウトを描き、モデルにそのまま渡せる Ideogram 4 の JSON caption を作成 | Ideogram 4 ワークフロー |
| [MiniMax H3 Acc LoRA Loader](#deno-minimax-h3-acc-lora-loader) | Alibaba 公式の8ステップ H3 Acc-LoRA を変換なしで読み込み | 公式 Acc-LoRA の重み |
| [MiniMax H3 Tiled Sampler](#deno-minimax-h3-tiled-sampler) | アップスケールした H3 動画を、16GB GPU で重なりのある tile に分けて仕上げ | ComfyUI 0.30.0+(ネイティブ H3 対応) |
| [MiniMax H3 R2V Audio Reference workflow](#minimax-h3-r2v-audio-reference-workflow) | `(Deno) Audio Transcript` と `(Deno) Audio Analysis Finalizer` が元の音声をプロンプトの方向づけに変換 | VideoHelperSuite, LM Studio |
| [LTX Model Loader](#deno-ltx-model-loader) | Checkpoint、KJ、GGUF の読み込みパターンを1つのコンパクトなノードに集約 | 該当モード用の KJNodes または ComfyUI-GGUF |
| [LTX Sequencer](#deno-ltx-sequencer) | 画像ごとのフレームと強度を指定する、複数画像ガイドのシーケンス | — |
| [LTX Multi LoRA Loader](#deno-ltx-multi-lora-loader) | 動画と音声の強度を別々に持つ、Power-LoRA 風の行 | — |
| [LTX Prompt Guide](#deno-ltx-prompt-guide) | 引用符内の台詞から最小の長さを求める LTX プロンプトエンコード | — |
| [LTX Tiled Spatial Upscaler](#deno-ltx-tiled-spatial-upscaler) | 動画 latent を重なりのある空間 tile でアップスケール | LTX latent upscaler |
| [LTX High resolution Tiled Sampler](#deno-ltx-high-resolution-tiled-sampler) | 融合した空間 tile による高解像度 LTX AV の refinement | — |
| [Bernini Prompt Guide](#deno-bernini-prompt-guide) | 指示形式の positive / negative プロンプトを1つのノードで | ネイティブ Bernini conditioning |
| [Multi LoRA Loader](#deno-multi-lora-loader) | 最大64個の LoRA を、スロットごとの切り替え・強度・メモ付きで | — |
| [Easy Model Download Helper](#deno-easy-model-download-helper) | 公式モデルリンクと、保存先パスの正確なチェック | — |
| [Text Encoder Unload](#deno-text-encoder-unload) | プロンプトのエンコード後に VRAM を解放する、任意使用のポイント | — |
| [Prompt Text](#deno-prompt-text) | 長いプロンプトを読みやすく保持する複数行の STRING ソース | — |
| [Local LLM Loader and Reviewer](#deno-local-llm-loader-and-deno-local-llm-reviewer) | ComfyUI からのローカル LLM プロンプトと、保存前の review gate | ローカル LLM サーバー |

### 03 · 比較

何かを保存する前に、キャンバス上で違いを確認します。

<p align="center">
  <img src="images/readme/video-compare.webp" alt="鮮明な湖の動画と低解像度の湖の動画を切り替える Video Compare のスライダー" width="370">&nbsp;&nbsp;
  <img src="images/readme/image-compare.webp" alt="鮮明な街の画像とピクセル化した街の画像を切り替える Image Compare のスライダー" width="370">
</p>

| ノード | 内容 | 必要なもの |
| --- | --- | --- |
| [Image Compare](#deno-image-compare) | スライダー、横並び、差分、トグルの各表示をノード内で | — |
| [Video Compare](#deno-video-compare) | フレーム単位で正確な A/B 動画再生と、音声、ロスレスの比較出力 | — |
| [Video Preview](#deno-video-preview) | グラフのどこでも使える、インラインでフル解像度の H.264 プレビュー | PyAV(現行 ComfyUI に同梱) |

### 04 · 仕上げ

最終的な見た目と解像度を整えます。

<p align="center">
  <img src="images/readme/film-grain.webp" alt="グレインを加えたポートレートの横に並ぶ Film Grain のコントロール" width="370">&nbsp;&nbsp;
  <img src="images/readme/rtx-vsr.webp" alt="RTX Video Super Resolution のパネル" width="370">
</p>

| ノード | 内容 | 必要なもの |
| --- | --- | --- |
| [Film Grain](#deno-film-grain) | 写真と動画向けの CPU フィルムグレイン。解像度に合わせて調整 | — |
| [RTX Video Super Resolution](#deno-rtx-video-super-resolution) | NVIDIA の VSR、High Bitrate、Denoise、Deblur を分かりやすいリサイズ選択で | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |
| [RTX Video Super Resolution (2 Pass)](#deno-rtx-video-super-resolution-2-pass) | 動画ワークフロー全体向けの、クリーンアップパスとアップスケールパス | Windows, NVIDIA RTX, `nvidia-vfx` 0.2+ |

### 05 · 整理

大きなグラフを読みやすく保ちます。

<p align="center">
  <img src="images/readme/visual-fold.webp" alt="Visual Fold: 選択した3つのノードが1つの Folded · 3 ピルに折りたたまれる様子" width="880">
</p>

| ツール | 内容 | 必要なもの |
| --- | --- | --- |
| [Visual Fold](#deno-visual-fold) | サブグラフを使わずに、選択したノードやグループを1つのコンパクトなピルに折りたたみ | — |
| [Floating Tools](#deno-floating-tools) | VRAM の解放、ComfyUI Stable の更新状況、GPT/Gemini 向けの Error Help | 初期状態ではオフ |
| [Node info button](#node-info-button) | 各 Deno ノードのクイックヘルプと更新ノート | — |

## ウェブツール

ブラウザで直接実行できます。インストールは不要です。

- [Deno Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - レンダリングした2本の動画をスライダー、横並び、差分、トグルの各表示で比較し、その比較を MP4 として保存できます。
- [Deno Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - 短いクリップをトリム、クロップ、リサイズして、GIF またはより軽い WebP として書き出します。
- [Deno Discord Media Compressor](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-discord/) - Discord で共有するために動画や画像を圧縮し、可能な限り 10 MB 未満を目指します。このツールの UI は韓国語のみです。

## 収録ノード

ワークフローの順に並べた完全なリファレンスです。各項目の冒頭でノードの役割を説明し、**詳細** を開くと特殊なケースや互換性の注意点を確認できます。

### 01 · 準備

#### `(Deno) Resize Box`

ComfyUI 用の解像度補助と画像リサイズノードです。

<img src="images/readme/resize-box.webp" alt="Crop Position モードの Resize Box。元画像の上にクロップ枠があり、結果のプレビューが表示されている" width="652">

主な機能:

- `Preset Ratio` と `Manual Input` モード
- よく使う比率のプリセット
- メガピクセルに基づくサイズ計算
- `divisible_by` による整列
- `Center Crop (Fill)`、比率を固定してズームできる `Crop Position (Fill)`、`Fit (Letterbox/Pillarbox)` のリサイズモード
- 既定の補間は `lanczos`
- 比率のライブプレビュー。`Crop Position (Fill)` では接続した元画像全体を表示し、クロップ枠をドラッグして位置を変え、四隅のいずれかをドラッグして、出力比率とメガピクセル数を固定したままズームできます
- 出力: `image`, `width`, `height`

#### `(Deno) Multi Image Loader`

バッチガイド系ワークフロー向けに設計された複数画像ローダーです。**WhatDreamsCost** の元のワークフローのアイデアに着想を得て、Deno のワークフロースタイルに合わせて調整・改良しました。

<img src="images/readme/multi-image-loader.webp" alt="番号付きのカードが並び、1枚が無効になっている Multi Image Loader のギャラリー" width="452">

主な機能:

- ノードの高さが際限なく伸びない、スクロール可能な固定高さのギャラリー
- 挿入位置のプレースホルダーが安定した、ドラッグによる並べ替え
- サムネイルをクリックすると、削除せずに画像を無効/有効にできます。有効な画像だけが出力され、カードの順に 1, 2, 3… と番号が付き、枚数と番号はすぐに更新されます
- 無効にした画像とその位置はワークフローに保存されたままです。実行するには少なくとも1枚を有効にしてください
- アップロードボタン、ドラッグ&ドロップによるアップロード、画像の貼り付け
- 既存の ComfyUI `input` 画像を再利用するための `Input Folder` ブラウザ
- `Keep Input Ratio`、`Preset Ratio`、`Manual Input` のサイズモード。比率プリセット、メガピクセル、divisible-by によるサイズ指定、または幅と高さの直接指定に対応
- リサイズ方法と補間の選択。書き出し時にクロップまたはフィットでリサイズすることもできます
- 出力: `multi_output`, `width`, `height`

<details>
<summary>詳細</summary>

- フォルダータイル、ダブルクリックでの移動、`Parent` ボタンによる input サブフォルダーの参照
- ネストした input 画像を、ComfyUI のサブフォルダーのパスを保ったまま追加可能
- ComfyUI の `input` フォルダーの外に出る外部 symlink や junction は、安全のためスキップされます。その画像は `input` にアップロードしてください
- ファイルの更新日時に基づく、新しい順の input 画像ソート
- 多数の画像でもスムーズに参照できる、レスポンシブな input フォルダーのサムネイル

</details>

#### `(Deno) Advanced Image Source Loader`

アップロードした画像、ComfyUI の input フォルダー、接続した IMAGE バッチ、サイズが混在する画像リスト出力に対応した、高度な画像ソースローダーです。通常の ComfyUI `input` フォルダーを使うワークフローでは、より簡単な標準の `(Deno) Multi Image Loader` を引き続き推奨します。

<img src="images/readme/advanced-loader.webp" alt="アップロード、貼り付け、フォルダー、パスのボタンと、masonry 形式のギャラリーを備えた Advanced Image Source Loader" width="612">

主な機能:

- おなじみの Deno 画像ローダーのギャラリー操作を維持
- 既存の ComfyUI `input` フォルダーの参照と、相対的な `Input Path` の入力に対応
- `Upload Folder` でブラウザで選んだフォルダーを ComfyUI の input に取り込み
- アップロード、ドラッグ&ドロップ、貼り付け、ブラウザが許可する場合のフォルダーアップロードに対応。見える `Paste` ボタンと通常の Ctrl+V による画像貼り付けも使えます
- サムネイルをクリックすると、削除せずにソースを無効/有効にできます。連番の出力番号が付くのは有効なカードだけです
- サムネイルカードをドラッグして、出力の順序を並べ替え
- 任意の `images` 入力で、上流の画像バッチ/リストを同じ出力ストリームに連結可能
- 通常のバッチワークフロー向けにリサイズ済みの `batch` テンソルを、画像ごとのリスト処理向けに `image_list` を出力
- 出力: `batch`, `image_list`, `width`, `height`, `image_count`

<details>
<summary>詳細</summary>

**0.7.120 以前からの移行:** 外部フォルダーと画像 URL は、読み込みもダウンロードもされなくなりました。`Upload` または `Upload Folder` を使い、有効な旧ソースをそれぞれアップロードした input パスに置き換えてください。保存済みのソース、順序、有効/無効の状態、接続は保持されます。無効な旧ソースは実行を妨げません。`DENO_EXTERNAL_IMAGE_ROOTS` はアクセスを許可しなくなりました。ComfyUI の input 内を指す絶対パスの保存値は引き続き実行されます。サムネイルを復元するには、その相対 input パスを選び直してください。

- フォルダータイル、ネストしたフォルダーの参照、`Parent` ボタンに対応
- ソース、有効状態、順序を変えずにサムネイルを再試行するには `Refresh previews` を使います。失敗したプレビューにカーソルを合わせるとヘルプが表示されます
- 無効なソースは、再び有効にするか削除するまで、読める状態でワークフローに保存されます。切り替えや並べ替えで出力番号はすぐに更新されます
- ギャラリーは、従来のキャンバスでも Nodes 2.0 でも、ノードの利用可能な高さに追従します
- サムネイルは masonry 形式で並ぶため、縦向きと横向きが混在する参照も見渡しやすくなります
- ネストしたフォルダーの画像を読み込む `recursive_folders` オプション
- `Keep Input Ratio`、`Preset Ratio`、`Manual Input` のサイズモード。比率プリセット、メガピクセル、divisible-by によるサイズ指定、または幅と高さの直接指定に対応
- リサイズ方法と補間の選択。中央、上、下の crop fill モードを含みます
- `Original Size` リストモードでは、サイズが混在した元の解像度を `image_list` に保てます
- `Match Batch Size` リストモードでは、`image_list` をリサイズ後のバッチの寸法に合わせます

</details>

#### `(Deno) MiniMax H3 Multi Reference Image Loader`

MiniMax H3 ワークフロー向けの参照ローダーです。画像は1本のケーブルで、音声は個別の出力で渡せます。

<img src="images/readme/h3-reference-loader.webp" alt="参照画像3枚と、波形付きの音声行2つを備えた MiniMax H3 の参照ローダー" width="483">

主な機能:

- `(Deno) Multi Image Loader` と同じ、アップロード、貼り付け、ドラッグ&ドロップ、Input Folder、カードの並べ替え、クリアの操作
- 専用の1つの socket から、順序付きの参照画像を最大9枚まで渡せます
- デコードした各画像の元の寸法と縦横比を、resize、crop、pad、letterbox 処理なしで保持
- 各プレビューカードを元画像の縦横比で表示するため、横向きと縦向きが混在する参照も、プレビューで切り取られず全体が見えます
- サムネイルをクリックして参照を無効/有効にできます。有効なカードは `<Picture 1>`, `<Picture 2>` のようにすぐに番号が振り直され、その画像だけが両方の出力に渡ります
- 無効にした画像はカードの位置に保存されたままで、9つのギャラリースロットのうち1つを占有し続けます。実行するには、画像または音声参照を少なくとも1つ有効にしてください
- `(Deno) MiniMax H3 Reference to Video` の単一の `ref_images` 入力に接続します
- 同じ順序付きのソースを `image_list` 出力としても公開し、`(Deno) Local LLM Loader` の `image` 入力に直接接続できます
- H3 ノードは、ComfyUI 標準の reference video、paired video audio、standalone audio の Autogrow 入力を維持します

画像ギャラリーの下にある折りたためる音声セクションでは、`Add audio`、Input Folder、ファイルのドロップで最大3つの音声ファイルを追加できます。各ファイルには、波形、測定した長さ、プレビュー再生、独立した Use トグル、並べ替えハンドル、削除コントロールがあります。再生しても、そのファイルを生成に使うかどうかは変わりません。このローダーは動画ファイルを受け付けません。

この2つの MiniMax H3 ノードには ComfyUI 0.30.0 以降が必要です。標準の `Load Image` ノード2つを1本ケーブルの Deno ローダーに置き換えた、ネイティブ H3 パイプライン全体は、持ち運びできる [MiniMax H3 multi-reference workflow](workflows/minimax-h3-multi-reference.json) で確認できます。

<details>
<summary>詳細</summary>

登録した音声ごとに、既存の2つの画像出力の後ろに個別の `AUDIO` 出力が追加されます。これらの出力を `(Deno) MiniMax H3 Reference to Video` の増えていく standalone-audio 入力に接続し、`audio_vae` を接続して音をエンコードします。`<Audio 1>`, `<Audio 2>` のような番号が付くのは、有効な音声カードだけで、カードの順に振られます。たとえば登録した3つのファイルのうち最初の2つを無効にすると、3つ目のファイルが `<Audio 1>` として表示・エンコードされます。無効にしたファイルとそのケーブルは保存されたままで、通常の下流の音声ブランチはスキップされます。並べ替えても各ケーブルは同じファイルにつながったままで、ファイルを削除するとそのファイルの音声ケーブルだけが削除されます。音声のみの読み込みにも対応しています。

音声ファイルを追加すると、すべての音声行が内部スクロールバーなしで見えるよう、ノードが自動的に大きくなります。ファイルを削除したり音声セクションを折りたたんだりすると、その分の領域が解放されます。手動で広げた高さと幅は保持され、以前のコンパクトなワークフローを開くと、保存済みの音声行が見える大きさまで広がります。

表示されるタグと H3 の参照を一致させるため、有効なすべての音声出力は、1つの DENO ローダーから同じ DENO H3 ノードに接続してください。接続したくないファイルはオフにします。これらの DENO 音声出力を使う場合、その H3 ノードには他の standalone-audio ソースや reference video のサウンドトラックを接続しないでください。番号の競合が起きた場合、ノードは異なるタグを黙って割り当てずに、その内容を説明します。他の音声ローダーだけを使う既存のワークフローは、標準の入力の挙動を保ちます。

音声ファイルは ComfyUI の input フォルダーから読み込まれます。対応する拡張子は WAV, MP3, FLAC, OGG/OGA, Opus, M4A, AAC, AIF, AIFF で、インストール済みの PyAV デコーダーに依存します。読み込みには、1ファイルあたり 256 MiB、デコード後の PCM 128 MiB、CPU デコード 30 秒という上限があります。プレビューに失敗した場合は Retry アクションが使え、保存済みのファイルやその接続は変わりません。

専用の H3 socket は意図的なものです。通常の ComfyUI の `IMAGE` バッチは幅と高さを共通にする必要があり、サイズが混在した参照を保てません。追加の `image_list` は同サイズのバッチではなくリスト出力なので、リスト対応のノードで再利用するときも、元の寸法、順序、縦横比は別々に保たれます。MiniMax H3 は通常の `ref_image_size` の処理で、縦横比を保ったまま参照を縮小することがあります。

任意の H3 VAE に対応した ComfyUI のビルドでは、`(Deno) MiniMax H3 Reference to Video` は `vae` または `audio_vae` を未接続のままにすることもできます。両方を接続すれば、従来の参照エンコードの挙動のままです。

- `vae` がない場合でも、参照画像と参照動画はテキスト/ビジョンエンコーダーには届きますが、VAE でエンコードした参照 latent は省かれます。
- `audio_vae` がない場合、実際の参照音声はエンコードされません。テキストエンコーダーが保持するのは `<Audio 1>` のようなラベルで、音声の波形ではありません。声や音を参照するには `audio_vae` を接続してください。省いても、生成される音声が無効になるわけではありません。

reference video と対になった音声(`ref_video_audio`)は、参照動画とその音をエンコードするために `vae` と `audio_vae` の両方の接続が必要です。単独の参照音声(`ref_audio`)に必要なのは `audio_vae` だけです。

これらの選択は、このノードの参照エンコードにのみ適用されます。下流の動画・音声デコードのノードが必要とする VAE は接続したままにしてください。ネイティブ H3 ノードが両方の VAE を必要とする古い ComfyUI ビルドでは、引き続き両方の接続が必要です。任意の参照エンコードを使うには ComfyUI を更新してください。

</details>

### 02 · 生成

#### `(Deno) Ideogram Director`

構造化 JSON caption と bbox レイアウト作業のための、Ideogram 4 向け視覚的プロンプトビルダーです。[Ideogram Director のワークフローデモを見る](https://youtu.be/Z8s27skkIDM)。

<img src="images/readme/ideogram-director.webp" alt="同じレイアウトから生成したポスターの上に、4つのレイアウト box を重ねた Ideogram Director のボード" width="640">

上の背景は、同じ4つの box からローカルの Ideogram 4 で生成した結果です。

主な機能:

- ComfyUI のキャンバス上で、bbox 領域を直接描画・編集
- 個々の bbox 要素を、削除や並べ替えをせずに一時的に無効化
- bbox をダブルクリックするとポインターの近くで編集でき、重なった位置を `Alt`+クリックで繰り返すと、その下にある box を順に切り替えられます
- Local LLM Loader などの STRING ソースから JSON プロンプトを読み込み
- 任意の Summary / Background STRING 入力を接続すると、その実行時だけ対応するボードの2つの欄を上書きします。未接続の入力は、保存済みのボードの文章を引き続き使います
- 既存のボードを置き換える前に確認する方式と、常に置き換える方式を選択可能
- 不正な JSON は、壊れたプロンプト文を下流に渡さず、はっきりと拒否
- 軽量なプレビューサムネイル付きの style / layout プリセットギャラリー
- ボードの説明を自分の言語で読み書きできる Language view。最終出力はモデル向けの英語のままです。看板、ロゴ、見出しなど、TEXT box 内の文字列はそのまま保たれます
- 出力: `prompt`, `width`, `height`, `seed`, `bboxes`

<details>
<summary>詳細</summary>

既存の `bboxes` 出力は、標準の `BBOX` を受け取るノードにも、`Ideogram4_MultiLora_BoundingBoxNode_Fedor` のような `BOUNDING_BOX` 入力にも接続できます。そのノードの region 行数は、Director の保存フィールドを増やさずに、Director の有効な box の数に追従します。現在の個数のみの同期は box の識別までは追跡しないため、途中の box を削除または並べ替えた後は、LoRA 行の割り当てを確認してください。

翻訳には、組み込みの Google、MyMemory、LibreTranslate のサービスだけを使います。[ファイルと翻訳へのアクセス](SECURITY_CONFIGURATION.md)を参照してください。

</details>

#### `(Deno) MiniMax H3 Acc LoRA Loader`

Alibaba PAI 公式の [MiniMax-H3-Acc-LoRAs](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs) を、safetensors ファイルの変換や複製なしで直接読み込みます。

1. 公式の FL2VA または Ref2VA の `Acc-8Step.safetensors` ファイルをダウンロードし、通常の `ComfyUI/models/loras/` フォルダーか、専用の `ComfyUI/models/minimax_h3_acc_loras/` フォルダーのどちらかに置きます。
2. 対応するネイティブ MiniMax H3 の diffusion model を `model` に接続します。full 版と Comfy-Org の `*_pruned_*` 版に対応しています。
3. 対応する Acc-LoRA を選びます。FL2VA/T2VA には FL2VA、Ref2VA には Ref2VA を選びます。
4. このノードの単一の `model` 出力を、通常の guider の経路に接続します。
5. sampling の経路は ComfyUI 標準のノードで組みます。推奨の出発点は、`BasicScheduler: simple, steps: 8` と `KSamplerSelect: euler` を `SamplerCustomAdvanced` に接続する構成です。

LoRA の重みとワークフローは Deno Custom Nodes に同梱されていません。重みは Alibaba からダウンロードし、ネイティブな ComfyUI ワークフローは自分で組むか調整してください。

<details>
<summary>詳細</summary>

このノードは、静的な LoRA の重みと、checkpoint の32個の時間依存 PDD 出力 head を適用します。sampling 時には、ComfyUI が渡す実際の sigma 境界を読み取り、その区間に合わせて PDD head を自動的に融合します。これにより、sampler、scheduler、step の制御は通常の ComfyUI ノードのままです。公式の8ステップ Simple/Euler 構成が、推奨かつ学習時の構成です。このローダーを変更せずに、Simple Scheduler の step 数を 4 から 12 まで選べます。他の降順スケジュールや、latent upscale ワークフロー向けに sigma を分割したパスも使えますが、品質向上が保証されるものではなく、試行用です。ネイティブ MiniMax H3 の動画/音声の sigma shift は `12.0 / 3.0`、LoRA の強度は `1.0` のままにしてください。

ネイティブ ComfyUI の INT8 版を含む、pruned でない full モデルでは、ComfyUI の通常の量子化対応 LoRA 経路を通して adapter 全体を適用します。curve-pruned モデルでは、`models/diffusion_models/` にすでにある対応する pruned でない MiniMax H3 checkpoint をローダーが探し、その小さな FP32 time-embedder 部分だけを読み込んで、メモリ上に bridge を導出します。これにより、50個すべての full-width AdaLN LoRA の更新を、幅8の pruned curve に基づき直します。この計算のために full checkpoint 全体を読み込むことはありません。対応する full checkpoint がインストールされていない場合、ローダーは互換モードで引き続き使えます。一度だけ警告を出し、50個の AdaLN 更新をスキップして、それ以外のすべての LoRA 更新と PDD head は適用します。

v0.7.92〜v0.7.94 の3出力ローダーで保存した標準の有効な UI ワークフローは、ComfyUI のキャンバスで読み込むときに移行されます。既存の model リンクはそのまま残り、以前の sampler と sigmas のリンクは、編集可能な標準の `KSamplerSelect: euler` と `BasicScheduler: simple, steps: 8` ノードに移ります。開いた後に UI ワークフローを一度保存してください。現在の単一出力のワークフローは変更されません。ミュートまたはバイパスされたノード、未知のカスタムレイアウト、壊れたグラフは、推測せずそのままにします。生の API プロンプト JSON ではこのフロントエンドの移行は行われないため、移行済みの UI ワークフローから再度エクスポートしてください。以前の sampler/sigmas のリンクが消えた後にすでに保存されたファイルは、それらの標準ノードを手動で再接続してください。

</details>

#### `(Deno) MiniMax H3 Tiled Sampler`

アップスケールした MiniMax H3 の動画+音声 latent を、重なりのある tile に分けて仕上げるため、16GB GPU でも最終の高解像度パスを実行できます。各 step で、すべての tile が同じフレームを読み、重なり部分では予測が cosine の重みでブレンドされ、その後に共通の更新が1回行われます。モデルはすべての tile のために1回だけ読み込まれ、元の音声 latent はそのまま通過します。

<img src="images/readme/h3-tiled-sampler.webp" alt="tile と overlap の設定を備えた MiniMax H3 Tiled Sampler" width="375">

ネイティブ H3 グラフでの一般的な配置:

```text
First pass: SamplerCustomAdvanced with SplitSigmas high_sigmas
-> MiniMax H3 Latent Upscale With Model (ComfyUI 0.44.0+) or another H3 latent upscaler
-> (Deno) MiniMax H3 Tiled Sampler with SplitSigmas low_sigmas
-> VAE Decode for video, audio decode for sound
```

- `model`: LoRA、sigma shift、attention やメモリ関連のノードを通した後の H3 モデルです。H3-Optimizations の sparse attention とメモリ最適化は、このノードの手前で動作します。ComfyUI コアの `BlockSparseAttention` は、今のところメッセージ付きで拒否されます。
- `positive`: 最初のパスと同じ positive conditioning です。R2V の参照画像はグローバルのままです。keyframe conditioning は tile ごとに切り出され、tile ごとに準備されます。regional conditioning と ControlNet は拒否されます。
- `latent`: アップスケールした H3 latent です。noise mask は付けません。
- `sigmas`: 最初のパスのスケジュールの最後の1〜3 step のみを渡します。たとえば `SplitSigmas` の `low_sigmas` です。他のスケジュールは、ヒント付きで拒否されます。
- `seed`: アップスケールした latent を、それらの sigma の最初の値まで戻すノイズです。
- `Tile width`, `Tile height`, `Overlap X`, `Overlap Y`: 32 の倍数のピクセルサイズです。overlap は tile より小さくする必要があります。tile の数はフレームサイズから決まります。フレーム以上の大きさの tile は、フレームを1つのまとまりで処理します。

既定値(896 x 704 の tile、overlap は最小 256 x 320)は、検証済みの 16GB 向け設定です。16GB GPU とシステム RAM 32GB の環境で、15秒・1920 x 1088 のクリップは6 tile で実行され、最後の1 step に約520秒かかりました。tile を大きくすると overlap の重複計算は減りますが、より多くの VRAM が必要です。これらの既定値を超えるサイズは、DENO ではまだ測定していません。

実行のたびに、tile 数、グリッド、サイズ、tile ごとの秒数、PyTorch のピークメモリをコンソールに出力し、同じレポートをノードの出力テキストにも追加します。そのため、次に試すサイズを自分や agent が判断できます。ネイティブ MiniMax H3 に対応した ComfyUI(0.30.0 以降)が必要で、ComfyUI 0.41.3 から 0.44.0 で検証しています。

#### MiniMax H3 R2V Audio Reference workflow

[初心者向けの音声参照ワークフロー](workflows/minimax-h3-r2v-audio-reference.json)は、ComfyUI 標準の MiniMax H3 参照音声の経路を保ちながら、プロンプトの方向づけを自動で行う流れを追加します。

- `(Deno) Audio Transcript` は、ローカルの OpenAI Whisper を使い、歌詞や台詞、セグメントの時刻、検出した言語、confidence の概要を作ります。ユーザーが入力した歌詞があれば、その文言が優先されます。
- `(Deno) Audio Analysis Finalizer` は、ComfyUI の `TextGenerate` の結果から、文書化された音響分析の項目だけを残し、分析後にその CLIP モデルを unload することもできます。
- `(Deno) Local LLM Loader` は、任意の `audio_context` STRING 入力で transcript と音響レポートを受け取ります。生の AUDIO はローカル LLM には送られず、上流の分析は命令ではなくデータとして扱われます。
- 選択した元音声のセクションは、H3 の `<Audio 1>` 参照であると同時に、最終 MP4 に mux される音声でもあります。このワークフローでは、H3 が内部で生成する音声はデコードされません。

必要なもの:

- MiniMax H3 と、音声に対応した `TextGenerate` をサポートする、最新の ComfyUI Stable
- `Load Audio (Upload)` 用の [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)
- 音響分析用に `ComfyUI/models/text_encoders/` へ置く `gemma4_e4b_it_fp8_scaled.safetensors`
- 最終的なプロンプト director の段階用に、`google/gemma-4-12b-qat` を読み込んで Local Server を起動した LM Studio

`openai-whisper` は、ノードの依存関係としてインストールされます。選択した Whisper の checkpoint は、`(Deno) Audio Transcript` の初回実行時に OpenAI からダウンロードされ、公式の Whisper ローダーが checksum を検証し、`ComfyUI/models/stt/whisper/` にキャッシュされます。

#### `(Deno) LTX Model Loader`

LTX 2.3 の一般的なモデル読み込みパターンを、1つのコンパクトなローダーにまとめました。

<img src="images/readme/ltx-model-loader.webp" alt="Checkpoint、KJ Style、GGUF Style のボタンを備えた LTX Model Loader" width="372">

主な機能:

- `Checkpoint Style`、`KJ Style`、`GGUF Style` モード
- 出力: `model`, `clip`, `video_vae`, `audio_vae`
- 可能な限り、ComfyUI 組み込みの checkpoint / diffusion / DualCLIP の読み込み経路を使用
- 動画/音声 VAE を分けるワークフローには、KJNodes の `VAELoaderKJ` を使用
- GGUF ワークフローには、ComfyUI-GGUF の UNet 読み込みを使用。どちらのパックも ComfyUI が読み込んだ後にだけ使われ、インストール済みでも読み込まれていないパックは分かりやすく報告されます
- 依存関係のエラーをより分かりやすくし、ComfyUI/KJNodes が混在する環境向けに、音声 VAE の互換フォールバックを備えています

#### `(Deno) LTX Sequencer`

複数画像ワークフロー向けに調整した LTX ガイドシーケンサーです。**WhatDreamsCost** の LTX ワークフローの考え方に着想を得て、日常の使いやすさに重点を置いた Deno 側の調整を加えています。

<img src="images/readme/ltx-sequencer.webp" alt="画像ごとのフレームと強度の行を備えた LTX Sequencer に接続した Multi Image Loader" width="720">

主な機能:

- `(Deno) Multi Image Loader` の batch 出力と連携
- 可能な場合、接続したローダーから `num_images` を自動入力
- 既存の sync スタイルのワークフローを維持
- 必要に応じて、`strength` の値だけを手動制御に切り離すことが可能
- `bypass` スイッチで、`positive`, `negative`, `latent` を変更せずにそのまま通し、素早い A/B テストができます

#### `(Deno) LTX Multi LoRA Loader`

LTX ワークフロー向けの、Power-LoRA 風のマルチ LoRA ローダーです。

<img src="images/readme/ltx-multi-lora.webp" alt="strength、video、audio の列を備えた LTX Multi LoRA Loader" width="502">

主な機能:

- 1つのコンパクトなノードに複数の LoRA を追加
- スロットごとの enable トグル
- スロットごとの `strength`, `video`, `audio` の強度コントロール
- スロットごとの trigger word と LoRA メモのエディター
- LoRA の行から、保存済みの trigger word をコピー
- パッチ済みの `model` と `clip` を出力
- おなじみの Power LoRA Loader のワークフローに近いまま、LTX 向けの A/V コントロールと軽量な LoRA 参照メモを加えた設計

#### `(Deno) LTX Prompt Guide`

LTX のプロンプトエンコード、任意の negative プロンプトの処理、組み込みの LTX conditioning、台詞の長さの見積もりをまとめたプロンプトヘルパーです。

<img src="images/readme/ltx-prompt-guide.webp" alt="引用符内の台詞から計算した最小の動画の長さを表示する LTX Prompt Guide" width="572">

主な機能:

- positive プロンプトのテキストエンコード
- 任意で折りたためる negative プロンプト
- `frame_rate` 付きの組み込み LTX conditioning
- 引用符内の台詞から、動画の最小の長さを見積もり
- Auto、韓国語、英語、日本語、中国語の台詞見積もりに対応
- 出力: `positive`, `negative`, `frame_rate`

#### `(Deno) LTX Tiled Spatial Upscaler`

高解像度 LTX 動画 latent の二次パス向けのヘルパーです。各フレームを重なりのある空間 tile に分割し、tile ごとに LTX latent の spatial upscaler を実行して、結果を1つの latent にブレンドします。

動画のみの LTX latent に使ってください。ワークフローが動画/音声の結合 latent を扱う場合は、先に音声の経路を分離し、tile 処理した動画パスの後で再結合してください。

#### `(Deno) LTX High resolution Tiled Sampler`

高解像度 LTX AV の refinement パス向けの sampler です。1つのグローバルな sampler の軌跡を保ちながら、動画の予測を重なりのある空間 tile で評価し、sampler の更新の前に融合します。

音声 latent 全体は context としてすべての動画 tile に渡され、返される音声 latent は `freeze` モードでは変更されません。

#### `(Deno) Bernini Prompt Guide`

KJ スタイルの Bernini プロンプトヘルパーです。positive と negative のプロンプトエンコードを、初心者にも分かりやすい1つのノードにまとめました。

<img src="images/readme/bernini-prompt-guide.webp" alt="Image Edit モードで Official Wan2.2 の negative プリセットを選んだ Bernini Prompt Guide" width="640">

上に表示されている `Official Wan2.2` の negative プリセットは中国語で書かれています。

主な機能:

- `Text to Video`, `Image to Video`, `Reference Video Edit` など読みやすいモードを備えた `System Prompt` セレクター
- 有効な system prompt の接頭辞を、ノード上部にそのまま表示
- 指示形式でプロンプトを書けます。例: `Replace the jacket with the shirt from image0. Keep the camera motion, background, lighting, and shadows unchanged.`
- 参照モードでは、短い `image0`, `image1`, `image2` の名前ヒントが内部で自動的に追加されます
- 折りたためる negative プロンプトのセクション
- negative プリセットは、見えている negative プロンプト欄を埋めます。最終的にエンコードされる negative プロンプトを変えるには、その欄を直接編集してください
- 出力: `positive`, `negative`

このノードが用意するのはテキストの conditioning だけです。Bernini の visual/context-latent conditioning には、`positive` と `negative` の出力を ComfyUI Stable のネイティブ `(Bernini) Conditioning` ノードに接続してください。現在の ComfyUI には[統合済みのネイティブ Bernini backend](https://github.com/Comfy-Org/ComfyUI/pull/14216)が含まれているため、以前のプレビュー backend 用アップデーターはもう不要です。ネイティブの conditioning ノードが見つからない場合は、ComfyUI Stable を更新してください。

#### `(Deno) Multi LoRA Loader`

通常の ComfyUI diffusion ワークフロー向けの、汎用 multi LoRA ローダーです。

<img src="images/readme/multi-lora.webp" alt="4つのスロットを持ち、1つがオフになっている Multi LoRA Loader" width="502">

接続した `MODEL` と任意の `CLIP` に、最大64個の LoRA を適用できます。保存済みの各スロットは、選択内容を失わずに有効/無効を切り替えられ、model と CLIP の強度を別々に設定でき、各 LoRA の横に trigger word とメモを保持し、スロットを並べ替えられます。パッチ済みの `model` と `clip` が下流に渡されます。スロットは必要に応じて `+ Add LoRA` で追加してください。既存の8スロットのワークフローと API プロンプトは、保存済みの選択、強度、trigger word、メモ、接続をそのまま保ちます。

#### `(Deno) Easy Model Download Helper`

推奨のモデルファイルセットのための、プリセット型セットアップヘルパーです。組み込みのプリセットは、LTX 2.3 8GB VRAM GGUF スターターセットと、公式の LTX 2.5 Distilled INT8 の2段階モデルセットに対応しています。

<img src="images/readme/model-download-helper.webp" alt="LTX 2.3 8GB VRAM プリセットと、不足ファイルの行を表示する Easy Model Download Helper" width="612">

主な機能:

- Python でファイルをダウンロードする代わりに、公式のモデルリンクをブラウザで開きます
- 2段階ワークフローに必要な、LTX 2.5 の diffusion model、projection 付き Gemma 4 text encoder、動画/音声 VAE、x2 spatial upscaler を含みます
- 検出した ComfyUI のモデルルートを表示し、選択したルートをコピーできます
- ワークフロー内に creator プリセットを保存でき、ページを再読み込みした後はブラウザのストレージから復元します
- Python 側のネットワークリクエストなしで、Hugging Face の直接リンクと Civitai のページ/ダウンロードリンクに対応
- `extra_model_paths` のカスタムフォルダー名を含め、ComfyUI に登録されたモデルフォルダーをチェック
- 関係のないネストしたプロジェクトフォルダーはスキャンせず、登録されたモデルフォルダーの中で、各プリセットの保存先パスを正確にチェック
- ファイルをどこに置くべきか分かるよう、対象の ComfyUI モデルサブフォルダーを表示

LTX 2.5 のリポジトリでは、ファイルをダウンロードする前に、Hugging Face のアカウントと **Agree and Access** が必要です。このヘルパーはその制限を迂回せず、ファイルを自動でダウンロードすることもありません。[LTX-2 Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE.md) を確認し、[公式の LTX 2.5 リポジトリ](https://huggingface.co/Lightricks/LTX-2.5)でアクセスを申請してから、ヘルパーのブラウザリンクを使い、ダウンロードした各ファイルを表示された ComfyUI のモデルフォルダーに移動してください。

<details>
<summary>Creator プリセットのリンクガイド</summary>

- Hugging Face: 対象ファイルの横にある小さなダウンロードアイコンを右クリックして `Copy link address` を選び、そのファイルの直接 URL をプリセットの `URL` 欄に貼り付けます。
- Civitai: ブラウザのアドレスバーからモデルページの URL をコピーし、プリセットの `URL` 欄に貼り付けて、エディターの `Civitai` ボタンを押すと、ブラウザの直接ダウンロードリンクに変換されます。URL からファイル名が分からない場合は、ダウンロードしたファイル名を手動で入力してください。
- Civitai のページでは、API の直接ダウンロード URL をあえて指定したい場合を除き、青い `Download` ボタンのリンクはコピーしないでください。
- `File name` は保存先パスのチェックにのみ使われます。特に Civitai/API のリンクでは、ディスク上のダウンロードしたファイルと一致させてください。

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

[Civitai モデルページの例(中国語のモデル説明を含む)](images/easy-model-download-helper-civitai-link.png)。

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

</details>

#### `(Deno) Text Encoder Unload`

一般的な positive のみ、または positive/negative のプロンプトフロー向けの、任意使用のインライン VRAM バリアです。

<img src="images/text-encoder-unload-workflow.png" alt="プロンプトのエンコードの後ろに置かれた Text Encoder Unload" width="720">

- positive conditioning を `Positive Conditioning` に接続します。必須で、変更されずにそのまま通過します
- 任意で、エンコード済みの negative プロンプトまたは `Conditioning Zero Out` を `Negative Conditioning` に接続します。こちらも変更されずにそのまま通過します
- 上流のテキストエンコーダーが使った、まったく同じ `CLIP` を `Text Encoder (CLIP)` に接続します
- positive のみの guider ワークフローでは、`Negative Conditioning` を空のままにします
- ComfyUI のモデル管理を通して、その CLIP/テキストエンコーダー、その clone、管理対象のコンポーネントだけを unload します。diffusion model、VAE、ControlNet はグローバルには unload されません
- ComfyUI 通常の入力キャッシュに従うため、変更のないプレビューの sampling は再利用でき、conditioning や CLIP の経路が変わった場合は unload が引き続き実行されます

<details>
<summary>詳細</summary>

Dynamic VRAM はメモリ負荷に応じて重みを移動し、テキストエンコーダーのページを意図的に残すことがあります。このノードは確実で任意使用の解放ポイントを提供しますが、プロセス全体を `0 MiB` にすることはできません。CUDA context、conditioning テンソル、他のモデル、カスタムノードの割り当て、他のアプリケーションは別に残ります。また、それだけで sampling の品質が向上するわけではなく、モデルのオフロードを減らしたり、メモリ不足を避けたりできる VRAM の余裕を作ります。後続のテキストエンコードではモデルを再読み込みする必要があり、`--gpu-only` ではエンコーダーを VRAM の外に移せません。

</details>

#### `(Deno) Prompt Text`

system prompt、user prompt、テンプレート、JSON テキストのための、小さな複数行 STRING ソースです。長くて再利用するプロンプトを、専用のノードで読みやすく保ち、テキストを変えずに Ideogram Director、Local LLM Loader、他の STRING 入力に接続したいときに使います。

<img src="images/readme/prompt-text.webp" alt="複数行の system prompt を保持している Prompt Text ノード" width="472">

#### `(Deno) Local LLM Loader` and `(Deno) Local LLM Reviewer`

すでに PC 上で動作しているモデルを呼び出し、テキストのレビューで保存される内容を制御するための、ローカル LLM ワークフローのヘルパーです。

<p>
  <img src="images/readme/local-llm.webp" alt="LM Studio に設定され、Thinking と Result のパネルを表示する Local LLM Loader" width="370">&nbsp;&nbsp;
  <img src="images/readme/review-gate.webp" alt="Review、Pass、Approve Once のコントロールを備えた Local LLM Reviewer" width="300">
</p>

主な機能:

- ローカルの Ollama、LM Studio、llama.cpp、vLLM、Custom OpenAI-compatible、llama-swap、Unsloth Studio のモデルを ComfyUI から呼び出し
- 既定で localhost に限定するサーバーの安全策: `127.0.0.1` または `localhost` を使うか、`DENO_LOCAL_LLM_ALLOWED_HOSTS` で1つのプライベート LAN の `IP:port` を明示的に許可します
- ノードから、プロバイダーごとのモデルリストを更新
- モデルを unload する前に、実行中のローカル LLM リクエストを停止
- プロンプトのバッチを1回のノード実行でつなげることで、バッチが終わるまでローカルモデルを読み込んだままにできます
- ビジョン対応のローカルモデルの呼び出しに、IMAGE を任意で添付
- Thinking と Result のテキストを、ノード上で直接プレビュー
- Local LLM ノードが実行されるたびに、ノードの最終的な Result を保存する PNG/ワークフローのメタデータに埋め込むため、ファイルを開き直すとノード内に復元されます。Thinking/reasoning はプレビューのみで、保存されません
- 名前付きの System Prompt プリセットを ComfyUI のユーザーデータに保持するため、ブラウザプロファイルを消去しても残ります
- 正の FLOAT を `video seconds` に接続すると、保存した Prompt テキストを変えずに、各 LLM の user prompt に `This is an 8-second video.` のような文を追加します
- Save ノードの前の gate として `(Deno) Local LLM Reviewer` を使い、レビューのテキスト結果をもとに IMAGE と AUDIO の出力を通すか止める、現在レビューした結果を1回だけ承認する、またはレビューの前の経路を再実行する、といった使い方ができます

<details>
<summary>サーバーアドレス、API キー、プロバイダーの注意点</summary>

Custom、llama.cpp、vLLM、llama-swap、Unsloth のサーバー欄には、サーバーアドレスとポート、および任意の `/v1` だけを指定できます。たとえば `http://127.0.0.1:8000/v1` です。query やその他のパスは、ヒント付きで拒否されます。Ollama と LM Studio の Refresh Models、Unload、Stop は、ノードの実行に使うものと同じ、固定のローカルサーバーを常に使います。サーバーのエラーには、生のレスポンスではなく、サーバーの JSON エラーメッセージが表示されます。

- 更新を繰り返したりプロバイダーを変えたりしても、検出したモデルのセレクターは1つに保ち、古いフロントエンドのセッションに由来する既知の重複セレクターは、選択したモデルを保ったまま取り除きます
- 手動または実行後の unload には、llama-swap のライブ実行状態と管理 API を使います。llama-swap サーバーに設定したタイムアウトがあれば、自動 unload はそれに従います
- `Unsloth` プロバイダーは Unsloth Studio サーバー(既定は `http://127.0.0.1:8888/v1`)でのみ使います。Unsloth の GGUF を LM Studio の中で動かしている場合は、`LM Studio` を選んでください
- Unsloth Studio のモデル一覧の取得、tool-definition や tool-choice のフィールドを含まない OpenAI 互換のチャットリクエストの送信、手動または実行後の unload のための Unsloth Studio 管理 API の利用ができます。`Keep for minutes` は、時間指定の Unsloth unload を予約しません
- ブラウザ内の既存の System Prompt プリセットは一度だけインポートでき、ブラウザ側のコピーはバックアップとして手を加えずに残ります
- 実際に適用されている System Prompt プリセット名を、ノードとエディターの両方で確認できます。一致しない編集済みのテキストは `Custom` と表示されます

API 認証は、ComfyUI を動かしているホストの環境から読み込まれます:

| プロバイダー | API キーの環境変数 |
| --- | --- |
| LM Studio | 任意の `DENO_LOCAL_LLM_LM_STUDIO_API_KEY`。専用のキーが未設定の場合は `DENO_LOCAL_LLM_API_KEY` を使います |
| llama.cpp, vLLM, Custom, llama-swap | 任意の `DENO_LOCAL_LLM_API_KEY` |
| Unsloth | 必須の `DENO_LOCAL_LLM_UNSLOTH_API_KEY`。共通のキーは使いません |
| Ollama | 共通のキーは送信されません |

ComfyUI を起動する前に適切な変数を設定し、変更した後は ComfyUI を再起動してください。キーは、モデルの検出、チャット、プロバイダーが対応する管理リクエスト(LM Studio の unload と llama-swap の管理を含む)に、Bearer トークンとして送られます。任意のプロバイダーは、キーが設定されていない場合は認証ヘッダーなしで引き続き動作します。キーがワークフローや PNG メタデータに保存されることはありません。

同じ PC 上の Docker でホストした LLM サーバーでは、サーバーのポートをホストのループバックに公開し、対応するローカル URL を使ってください。認証があっても localhost/プライベート LAN の URL のルールは変わりません。設定したキーは選択した対応プロバイダーに送られるため、信頼できるサーバーだけを使ってください。

リモートの LM Studio についての注意: 専用の `LM Studio` プロバイダーは、現在 `http://127.0.0.1:1234/v1` を使います。同じ信頼できる LAN 上にある自分の別の PC の LM Studio を呼び出すには、その PC で **Serve on Local Network** を有効にし、ComfyUI を起動する前に厳密な許可リストを設定します(例: `DENO_LOCAL_LLM_ALLOWED_HOSTS=192.168.1.50:1234`)。ComfyUI を再起動した後、`Custom` を選び、Custom Server URL に `http://192.168.1.50:1234/v1` を使います。そのサーバーが認証を必要とする場合は、再起動する前に ComfyUI のホストに `DENO_LOCAL_LLM_API_KEY` も設定してください。許可リストが受け付けるのは、プライベート IP とポートの組を正確に指定したものだけで、ワークフローや PNG メタデータに保存されることはありません。Custom は LM Studio 固有の unload ヘルパーを使わないため、サーバーのポートはホストのファイアウォールで ComfyUI の PC に限定し、リモートのモデルは LM Studio から管理してください。

LM Studio の互換性についての注意: 生成された出力が始まる前に、LM Studio が任意の reasoning 制御フィールドを拒否した場合、ノードはそのフィールドを除いて1回だけ再試行します。その後は、選択したサーバーとモデルが既定の reasoning の挙動を決めます。サーバーが公開していない reasoning モードを、Thinking トグルで強制することはできません。

音声についての注意: Local LLM Loader は、生の AUDIO をローカルモデルに送りません。任意の `audio_context` STRING 入力で、上流の transcript と音響レポートを、ユーザーのプロンプトを保ったままデータとして渡せます。Reviewer は、ComfyUI の音声対応テキスト生成を含む別のテキスト生成ノードがレビューのテキストを作る場合に、AUDIO を gate できます。

</details>

### 03 · 比較

#### `(Deno) Image Compare`

ComfyUI のキャンバス上で、2枚の画像をすばやく確認するための A/B 比較ノードです。

<img src="images/readme/image-compare.webp" alt="鮮明な街の画像とピクセル化した街の画像を切り替える Image Compare のスライダー" width="640">

主な機能:

- `image_a` と `image_b` を、ノード内で直接比較
- モード: `Slider`, `Side by Side`, `Difference`, `Toggle`
- すばやく before/after を確認できる、hover で動くスライダー
- 見える A/B ラベルと、どちらの方向でも確認できる `Swap` ボタン
- 内部のプレビュー領域がノードに合わせてリサイズされるため、縦向きと横向きの画像が読みやすいまま
- 出力接続のない、視覚専用のノード。確認だけの比較ならグラフをすっきり保てます

#### `(Deno) Video Compare`

動画向けの視覚的な A/B 比較ノードです。アップスケールや FPS 補間の結果を、ComfyUI のキャンバス上で直接確認するために作られました。

<img src="images/readme/video-compare.webp" alt="スライダー、モードボタン、再生コントロールを備えた Video Compare" width="720">

主な機能:

- `video_a` / `video_b`(IMAGE バッチ)と、任意の `audio_a` / `audio_b`(AUDIO。たとえば VHS の *Load Video* から)
- モード: `Slider`, `Side by Side`, `Difference`, `Toggle`(フリーズフレームの A/B 切り替え)、さらに `Swap`
- hover で動くスライダー、クリックで再生/一時停止、スクラブバー、フレーム送り、速度、ループ。プレビューにカーソルを合わせると、選択した側の音が聞こえます
- ノードがクリップの縦横比に合わせてリサイズされ、ホイールと中ボタンのドラッグは ComfyUI のキャンバスに渡されます
- `🏷 Output Badges` トグル: 保存される出力に A/B と解像度のバッジを追加できます(既定ではオフ。ノード内のプレビューには常に表示されます)
- `comparison`: 選んだモード(Slider / Side by Side / Difference / Toggle)の、フル解像度の**ロスレス** IMAGE 出力です。選んだ FPS で VHS の *Video Combine* のような save/encode ノードにそのままつなげられます。`Toggle` は、シーケンス全体で選択した A/B 側を出力します

ノードを動かすには重すぎる場合は、インストール不要のブラウザツールを使ってください: **https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/**(ノードの下部にもリンクがあります)。

<details>
<summary>詳細とブラウザツール</summary>

合成処理はすべて純粋なテンソル演算で、外部エンコーダーは使いません。ノード内のプレーヤーは、縮小した WebP のフレームシーケンスを仮想クロックに合わせて `<canvas>` に描画し(そのため A/B はフレーム単位で一致したまま)、音声は WebAudio で再生します。ファイルは ComfyUI の temp ディレクトリに書き出され、既存の `/view` ルートから配信されて、再起動時に自動でクリアされます。

共通のタイムライン: 入力 A のフレーム数と選択した FPS が長さを決めます(A がなければ B を使います)。両方のプレビュー側と保存される出力は、`Swap` の後も含めて、この長さを使います。B は、A の出力フレーム数に合わせて、全シーケンスにわたってサンプリングされます。FPS 補間の結果は、同じ長さでも、プレビューではより滑らかに見えることがあります。

ブラウザツールでは、読み込んだファイル名にカーソルを合わせると完全な名前が表示されます。**Side by Side** を選び、次に **Left / Right** または **Top / Bottom** を選ぶと、結合したレイアウトをプレビューできます。**Save MP4** は、現在の Swap の順序、Sync モード、選択した A/B の音声(またはミュート)を使い、両方の動画全体を 24、30(既定)、60 fps の H.264 MP4 として書き出します。横並びの出力では共通の高さに、縦並びの出力では共通の幅に、クロップせず縦横比を保ったまま両方の動画を合わせます。出力は A の全長を使います。Time sync では B が先に終わると B の最後のフレームを保持し、Ratio sync では、選択していれば B の音声を含めて、B の全長を A に合わせます。ズームとプレビュー再生の速度は、保存される動画には影響しません。

保存はブラウザ内でローカルに実行され、ファイルがアップロードされることはありません。動画エンジンは初回使用時に約 30 MB をダウンロードするため、準備にはインターネット接続が必要です。大きい、または長い動画は、時間とブラウザのメモリを必要とすることがあります。**Cancel** で書き出しを停止でき、完了した MP4 は保存ダイアログから再度ダウンロードできます。

</details>

#### `(Deno) Video Preview`

グラフのどこでも、実際にエンコードされた出力を確認するための、そのまま差し込めるフル解像度のプレビューです。PyAV を使ってプロセス内で、元の解像度のまま実際の H.264 動画をエンコードし(外部プロセスは起動しません)、ブラウザがインラインで確実に再生できるよう `+faststart` を使います。その後、画像をそのまま通過させるため、配線を分岐させずに、**複数の sampling ポイントにインラインで**挿入できます。

<img src="images/readme/video-preview.webp" alt="エンコードしたクリップを再生し、解像度、FPS、フレーム数のバッジを表示する Video Preview" width="692">

主な機能:

- `images`(IMAGE バッチ)を入力し、`images` をそのまま出力、`frame_rate`、そして任意の `audio` 入力。音声は AAC としてプレビューに mux されます(dict / object / `(waveform, sr)` の AUDIO や、`[C,N]` / `[N,C]` の形状にも対応し、音声を使えない場合はログに記録されて、動画のプレビューは引き続き行われます)
- VHS のプレビューのような、すっきりした自動ループのノード内プレーヤー: コントロール表示なし、**hover で音声再生**、**クリックで再生/一時停止**、**Full screen** ボタン、ホイールは ComfyUI のキャンバスに渡されます
- 左上のコンパクトな情報バッジに、現在のプレビューの解像度、FPS、フレーム数、長さを表示
- ノードはクリップの縦横比に合わせ、リサイズしてもそれに合わせた状態を保ちます
- 各ノードは1つの temp ファイルを再利用し、実行のたびに上書きするため、何度も繰り返しても temp ストレージが増え続けません
- PyAV(`pip install av`)が必要です。インストールされていない場合は、グラフを失敗させる代わりに、1行の分かりやすいインストールのヒントを表示します

### 04 · 仕上げ

#### `(Deno) Film Grain`

CPU 処理で、写真またはデコード済みの動画 `IMAGE` バッチにモノクロのフィルムグレインを加えます。モデルや追加パッケージのインストールは不要です。既定では細かいグレインと粗いグレインを 75:25 でブレンドし、極端な粒子を和らげ、純粋な黒と白の近くではグレインを減らします。ぼかされるのはグレインのパターンだけで、画像のディテールは保たれます。

<img src="images/readme/film-grain.webp" alt="グレインを加えたポートレートのプレビューの横に並ぶ Film Grain のコントロール" width="720">

画像処理チェーンの最後に接続してください:

- 写真: 最終画像 / リサイズ → **Film Grain** → **Save Image**。
- ネイティブ動画: デコードしたフレーム / 最終リサイズ → **Film Grain** → **Create Video** → **Save Video**。元の音声とフレームレートは Create Video に接続したままにします。
- Video Helper Suite: デコードしたフレーム → **Film Grain** → **Video Combine**。その音声とフレームレートの設定は維持してください。

パネルは、ComfyUI のロケールに関わらず、英語のコントロールと他の Deno ノードと同じコンパクトな緑のスタイルを使います。**Strength**、**Grain size**、**Roughness**、**Tone protection**、そして1つの **Processing** の選択肢を表示します。**Strength は 0 から 1 の範囲**です。既定値の `0.50` はコード上の amount `6` に、`1.00` は amount `12` に対応します。**Low RAM**(既定)は1フレームずつ、**Balanced** は2フレーム、**Faster** は4フレームを一度に処理します。グレインの出力は同一で、処理を速くすると一時的な RAM をより多く使うことがあります。

<details>
<summary>設定、解像度への対応、メモリ</summary>

**Advanced** の **Frames at once** では、保持されたカスタム値 3 を含め、1〜4 の正確な値を指定できます。処理は CPU で行われ、上流の生成の VRAM は変わらず、保存する動画がクリップに分割されることもありません。出力フレームバッチ全体には引き続き RAM が必要です。Processing のツールチップを参照してください。seed と動画 chunk の設定も Advanced にあります。

既存のワークフローは、保存済みの値とケーブルを保ちます。パネルの新しい最大値を超える保存済みの amount は、スライダーを意図的に調整するまでそのまま保たれます。接続されたパラメータ入力は、それぞれの設定を制御します。パネルはそれらのコントロールを無効にし、ネイティブの socket は見える状態のままにします。

新しいノードは、既定で **Advanced → Grain scale → Match resolution** になります。Grain size はフレームに対する相対値です。ノードは、元のグレインを、**短辺 1536px**(選択した 2752×1536 の基準)の縦横比に合ったグリッド上に作り、そのモノクロのグレインだけを入力サイズにリサンプリングします。Strength と細かい/粗いのミックスは変わりません。2752×1536 では、結果は元のプリセットとまったく同じです。既存の保存済みワークフローは **Fixed pixels** と以前の結果を保ちます。新しい挙動を使うには Match resolution を選んでください。`grain_scale_mode` を省略した古い API プロンプトも、ピクセルベースの結果を保ちます。

基準のパターンは、より小さいフレームにサンプリングするときにフィルタリングされ、同じピクセルあたりの分散に増幅し直されることはありません。これにより、異なる解像度を同じ表示サイズで見たときに、粒子のサイズと見た目の強さがより一貫します。非常に細かいグレイン、コーデックの圧縮、再生時のスケーリングによる違いは残ることがあります。どのプレーヤーでも同一に見えることは保証されません。極端に引き伸ばされた入力で、基準グリッドが 16,777,216 ピクセルを超える場合は、確保する前に失敗します。その場合は Fixed pixels を使えます。

| 設定 | 既定値 | 効果 |
| --- | --- | --- |
| `enabled` | on | off にすると、元の入力をコピーせずにそのまま通します。 |
| `amount` | `6` | 8-bit 輝度単位で保存・API に渡す強度です。パネルの strength `0.5` = amount `6`、`1` = amount `12` で、`0` はそのまま通します。バックエンドの範囲はより広く、古いワークフローを保てます。 |
| `grain_size` | `1` | Match resolution では細かい/粗いの相対サイズ。1536px の基準では元の sigma `0.45 / 1.15 px` です。Fixed pixels では、これらの sigma を入力解像度でそのまま使います。 |
| `roughness` | `0.25` | 粗いグレインの割合です。既定の細かい/粗いのミックスは `75:25` です。 |
| `tone_weighted` | on | 暗めの中間調を強調し、最も明るい端と最も暗い端を保護します。 |
| `temporal_mode` | `changing` | フレームごとにパターンを変えます。`fixed` は比較のために同じパターンを繰り返します。 |
| `seed` | `2026100701` | 同じパターンとフレームシーケンスを再現します。 |
| `frame_offset` | `0` | 動画の chunk を別々に処理するときの、最初のフレームのグローバルなインデックスです。 |
| `processing_batch_size` | `1` | CPU で一度に処理するフレーム数で、1〜4 です。1 だと一時的な RAM が最小になります。 |
| `grain_scale_mode` | 新しいノードでは `resolution` | Match resolution は基準のグレインをフレームにサンプリングします。`pixels` は元のピクセルベースのグレインを保ちます。古い API プロンプトで省略した場合は `pixels` を使います。 |

実行をまたいで同じパターンで設定を比較するには、`seed` を変えず、ComfyUI の seed の **control after generate** を `fixed` にしてください。

一時的なメモリは、選択した処理グループ(1〜4 フレーム)に限られ、有効な出力は VRAM に2つ目の完全なバッチを確保せず CPU に保存されます。Match resolution では基準のグレインのグリッドも必要になるため、解像度の低いフレームでは Fixed pixels より一時的な RAM を多く使うことがあります。Low RAM では、この作業を一度に1フレームに抑えます。**出力 IMAGE バッチ全体には、引き続き RAM が必要です**。これは上流の入力と ComfyUI のキャッシュとは別です。float32 RGB では、この出力は `frames × width × height × 12` バイトを使い、1080p の1フレームあたり約 **23.7 MiB**、120 フレームで **2.78 GiB** です。このノードは動画ファイル全体をストリーミング処理することも、上流のキャッシュメモリを取り除くこともしません。長いクリップや高解像度のクリップでは、バッチを短くしてください。無効の場合やゼロ強度の実行は、同じ入力オブジェクトをそのまま返します。

サイズ、チャンネル数、dtype は保たれ、RGBA のアルファは変わりません。このノードが扱うのはピクセルで、ワークフローのメタデータ、エンコード、ファイルの作成は、引き続き Save Image/Save Video が担います。ネイティブの `VIDEO` socket は、このノードに直接ではなく、Create Video の後ろに接続します。動画の圧縮によって、細かいグレインが和らいだり、保存したファイルのサイズが増えたりすることがあります。

</details>

#### `(Deno) RTX Video Super Resolution`

NVIDIA VFX を ComfyUI 内で試したい人のための、Windows/NVIDIA RTX 向けの任意の RTX Video Super Resolution ヘルパーノードです。適切な Python 環境を手動で探し回る必要はありません。

<img src="images/readme/rtx-vsr.webp" alt="effect、quality、resize のコントロールを備えた RTX Video Super Resolution のパネル" width="612">

このノードは、コアの Deno ノードとは意図的に分けてあります。NVIDIA VFX を import するのはアップスケールの実行中だけなので、通常の Deno ノードのインストールに NVIDIA VFX は必要ありません。ComfyUI Manager は、NVIDIA VFX を自動でインストールせずに、ノードパックをインストールします。

| 画像が次のような場合 | 使うもの |
| --- | --- |
| 小さい、低解像度、または圧縮されている | `VSR` |
| すでにきれいだが、より大きく鮮明な出力が必要 | `High Bitrate` |
| ノイズが多い、またはざらついている | `Denoise` |
| ぼやけている、ピントが合っていない、または軽くぶれている | `Deblur` |

初心者向けのインストールの流れ:

1. `deno-custom-nodes` をインストールまたは更新して、ComfyUI を起動します。
2. `(Deno) RTX Video Super Resolution` を追加し、画像で一度実行します。
3. NVIDIA VFX がない場合や、古いインストールを更新したい場合は、ノードの `How to install` ボタンをクリックします。
4. インストーラーを実行する前に、すべての ComfyUI のウィンドウ/プロセスを閉じます。
5. 視覚的なウェブのインストールガイドに従います。そのページから ZIP をダウンロードして `ComfyUI\custom_nodes\deno-custom-nodes\tools` に移動し、`Extract All` を選んで、展開先をその `tools` フォルダー自体に設定し、`tools\install_rtx_vfx.bat` を実行します。Windows が `install_rtx_vfx_bat` サブフォルダーを作った場合は、BAT を実行する前に、`install_rtx_vfx.bat` と `README_RTX_VFX_EASY_INSTALL.md` の両方を `tools` の直下に移動してください。
6. BAT が `Install RTX VFX here?` と尋ねた場合は、表示された Windows のパスが、いま閉じた ComfyUI アプリの中にあるときだけ `Y` を入力します。おかしいと思ったら `N` を入力して中止してください。
7. 緑色の `INSTALL COMPLETE` メッセージが表示されるまで待ちます。
8. ComfyUI を完全に再起動し、もう一度 `(Deno) RTX Video Super Resolution` を使います。

初心者向けの視覚的な手順の詳細は、[Deno RTX VFX install page](https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/) を開いてください。
ComfyUI Manager からインストールした後に `tools` フォルダーを開くよう案内するチュートリアル動画を見た場合は、`tools/OPEN_INSTALL_GUIDE.txt` を開いてください。同じ最新のインストールページに案内されます。

<details>
<summary>実行環境の要件、アップグレード、すべての機能</summary>

推奨の NVIDIA ランタイムは `nvidia-vfx 0.2.0.0` 以降(VFX SDK 1.3)です。現在のインストーラーは、少なくともこのバージョンを必要とします。私たちの Windows での比較では、`0.2.0.0` は、`0.1.0.1` で見られた NVIDIA の更新確認プロセスが繰り返し溜まる現象を回避できました。これはテストした環境での結果であり、すべての PC での保証ではありません。

現在のランタイムには、Windows 10/11 x64、対応する NVIDIA RTX GPU、Python 3.10 以降を使ってください。[現在の Comfy Org の NVIDIA ノード](https://github.com/Comfy-Org/ComfyUI_Nvidia_VFX_Nodes#requirements)に合わせて、CUDA 13 以降の PyTorch を推奨します。NVIDIA の x64 Windows ドライバーの最小バージョンは 570.65 です(TCC デバイスでは 595)。インストーラーは、実際の ComfyUI 環境で NVIDIA のエフェクトを確認しますが、PyTorch を自動で置き換えたりドライバーを更新したりはしません。検証に失敗した場合は、その指示に従ってください。NVIDIA のパッケージには VFX ランタイムが含まれているため、このインストールに別の VFX SDK インストーラーや CUDA Toolkit は不要です。

すでに `nvidia-vfx 0.1.x` を使っていますか。DENO Custom Nodes を更新しただけでは、この任意の NVIDIA ライブラリは更新されません。ComfyUI を完全に閉じ、上記と同じガイドから最新のインストーラーをもう一度実行してください。既存のワークフローの接続と設定はそのままですが、ライブラリのアップグレード後は NVIDIA 側の処理結果が変わることがあります。以前のレンダリングを正確に再現する必要がある場合は、以前の環境を残しておいてください。

NVIDIA の公式リファレンス:

- [Video Super Resolution filter](https://docs.nvidia.com/maxine/vfx/latest/Filters/VideoSuperResolution.html)
- [NVIDIA VFX Python bindings](https://docs.nvidia.com/maxine/vfx-python/latest/index.html)
- [Current NVIDIA package requirements and release history](https://pypi.org/project/nvidia-vfx/)
- [Current VFX SDK Windows requirements](https://docs.nvidia.com/maxine/vfx/latest/WindowsVFXSDK/GetStartedonWindows.html)
- [VideoSuperRes Python API](https://docs.nvidia.com/maxine/vfx-python/latest/api.html)

主な機能:

- NVIDIA 公式の `nvidia-vfx` / `nvvfx.VideoSuperRes` パッケージの経路を使用
- ノードの UI から、NVIDIA 公式の Video Super Resolution ドキュメントへのリンク
- effect ボタン、独立した quality セレクター、モード解説の行、選んだ effect に適用されるリサイズコントロールのみを備えた、コンパクトな RTX パネルを表示
- 1 pass と 2 pass の RTX パネルは、マウスホイールのスクロールを ComfyUI のキャンバスに渡すため、ポインターがノードの上にあっても通常のキャンバスのズームが使えます
- インストーラーは、現在の ComfyUI のインストールが使う Python を対象にします
- ComfyUI がその Python で動作中の場合、インストーラーは続行を拒否します
- 検出した Python にインストールする前に、インストーラーが確認します
- NVIDIA GPU が検出されない場合、ユーザーが明示的にチェックを上書きしない限り、インストーラーは停止します
- ユーザーが対象の Python を確認した場合、インストーラーは `nvidia-vfx >= 0.2.0.0` をクリーンに再インストールします。古い `0.1.x` からのアップグレードも含みます
- インストーラーはまず、現在の ComfyUI の Python が使う通常の `nvvfx` パッケージの経路を検証します
- インストーラーが ASCII の Windows ランタイムのフォールバックを使うのは、通常の `nvvfx` の経路が検証に失敗した場合だけです
- ノードの起動時に、記録された ASCII フォールバックのパスを優先するのは、そのフォールバックが実際に選ばれた場合だけです
- 別の NVIDIA VFX ネイティブモジュールが、競合するパスからすでに読み込まれている場合、ノードはネイティブ拡張の再読み込みを試みず、停止して ComfyUI の完全な再起動を求めます
- インストール後に、NVIDIA の `VideoSuperRes` エフェクトを実際に作成できることを、インストーラーが検証します
- NVIDIA VFX がサポートされていないランタイム機能を報告した場合、ノードは生のスタックトレースの代わりに、GPU/ドライバー/ランタイムのパスについて読みやすいメッセージを表示します
- 別の RTX ノードの NVIDIA Broadcast/NGX VFX の DLL がすでに読み込まれている場合、ノードはそのネイティブランタイムの競合を、GPU/ドライバーの対応状況とは別に報告します
- 別の Broadcast ベースの RTX ノードが動作し、Deno が失敗する場合は、Deno のインストールが壊れている証拠ではなく、ネイティブランタイムの競合として扱ってください
- インストーラーの BAT と ZIP は Manager のパッケージ内ではなく GitHub に置き、ノードの UI には、視覚的なウェブのインストールページを開く `How to install` ボタンと、`Copy steps` ヘルパーを用意しています
- 古いチュートリアル動画に従うユーザーのために、`tools` フォルダーが存在し続けるよう、Manager のインストールには小さな `tools/OPEN_INSTALL_GUIDE.txt` ファイルを残します
- 4つの分かりやすい effect ボタンを用意: Video SR、High Bitrate、Denoise、Deblur
- 選んだ effect を平易な言葉で説明する、コンパクトなモード解説の行を表示
- Low、Medium、High、Ultra の quality は独立したセレクターとして維持
- Video SR と High Bitrate では、`Scale`、`Keep Ratio`、`Manual`、`Preset Ratio` のリサイズの選択に対応
- `Keep Ratio` と `Preset Ratio` は目標のメガピクセルを使い、`Manual` は幅と高さを使います
- リサイズできるモードに `divisible_by` の整列を用意。既定は `1` で、1920x1080 のような標準的な動画サイズは正確に保たれます
- ワークフローで N の倍数への出力の強制が必要な場合のために、`32` のような大きい整列値も引き続き使えます
- 手動、preset-ratio、整列した keep-ratio のリサイズで縦横比が変わりうる場合は、`Center Crop (Fill)` / `Fit (Letterbox/Pillarbox)` を表示
- `Denoise` と `Deblur` は元のサイズを保ち、リサイズのコントロールを隠します。NVIDIA の同サイズ VSR モードに合わせています
- Easy Upscale の出力: `images`
- このノードが表示するのはコントロールのみです。処理結果を見るには、`images` 出力を Preview Image または Image Compare に接続してください。

</details>

#### `(Deno) RTX Video Super Resolution (2 Pass)`

動画ワークフロー全体向けの、2 pass の RTX 仕上げノードです。最初に任意で同サイズの `Denoise` または `Deblur` を実行し、次に任意で `VSR` または `High Bitrate` のアップスケールを実行できます。

<img src="images/readme/rtx-2pass.webp" alt="クリーンアップパスとアップスケールパスを備えた RTX Video Super Resolution 2 Pass のパネル" width="632">

ワークフローの例: [RTX 2-pass upscale workflow](workflows/deno-rtx-lowram-metabatch.json)

主な機能:

- 例のワークフローに、`Low System Memory` と `High System Memory` の両方の流れを含みます
- 低メモリの流れは VHS Meta Batch を使うため、長い動画をより小さなフレームの chunk に分けて処理できます
- `VHS_VideoInfoSource` を使って、元の FPS を `VHS_VideoCombine` に引き継ぎます
- VHS の load/combine の経路を通して、元の音声を保持します
- 単一の画像バッチを試すだけでなく、実際にエンコードした動画出力を仕上げるときに便利です
- 出力: `images`

### 05 · 整理

#### Deno Visual Fold

Deno Visual Fold は、大きな ComfyUI グラフを整理するための、視覚専用のクリーンアップヘルパーです。最新の Deno Custom Nodes パッケージをインストールまたは更新すると、自動的に有効になります。

<img src="images/readme/visual-fold.webp" alt="緑色の Fold バッジが付いた選択済みのノードが、1つの Folded · 3 ピルに折りたたまれる様子" width="880">

2つ以上のノードを選択すると、ComfyUI 標準の選択ツールバーに、読みやすい緑色の `Fold` バッジが表示されます。クリックすると、選択したノードが1つのコンパクトな視覚グループに折りたたまれ、`Unfold` で元に戻せます。

通常の ComfyUI グループを1つ選んで `Fold Group` を使うと、ワークフローのロジックには手を加えずに、そのグループ内のノードを折りたたむこともできます。2つ以上のグループを選ぶと、同じツールバーに、左/右/上/下の整列や水平/垂直の間隔のための、読みやすい `Align` バッジが加わります。

これは ComfyUI Subgraph とは異なります。Subgraph はノードを子グラフに移動するため強力ですが、ワークフローが `Get` / `Set` ノードや親子のグラフ構造をメインのグラフに見える状態で保つことに依存している場合は、向かないことがあります。Visual Fold は、シンプルな視覚的整理だけを目的としています。選択したノードをサブグラフに変えたり、ワークフローのロジックを変えたりすることはありません。

#### Deno Floating Tools

Deno Floating Tools は、`Settings > DENO > Tools` にある任意の補助機能です。初期状態ではオフです。

有効にすると、ComfyUI の画面に、ドラッグできる小さな Deno アイコンが追加されます。パネルから、ComfyUI 組み込みのメモリクリーンアップのエンドポイントを使って ComfyUI の VRAM を解放し、ComfyUI Stable のコアリリースの現在/最新の状況を読み取り専用で確認し、実行が失敗したときに Error Help のレポートを開けます。

Error Help は、現在のワークフロー、Python 実行ファイルと環境の種類、パッケージのバージョン、GPU の詳細、直近の traceback/ログの文脈、カスタムノードの概要をまとめた、GPT/Gemini 向けのレポートを作成します。読み取り専用で、まずレポートのウィンドウを開き、`Copy Report` をクリックしたときだけコピーします。token、cookie、password、private key、URL の認証情報といった一般的な機密情報は、コピーする前にマスクされます。

Floating Tools は、インストール、更新、再起動、修復、ワークフローの変更を一切行いません。ツールがオンの間だけ、ComfyUI のリクエスト関数にフックします。

#### Node info button

ほとんどの Deno ノードには、右上に小さな緑色の `i` ボタンがあります。クリックすると、キャンバスを離れずに、ノードの目的、主要な設定、現在のリリースノートを確認できます。新しい Deno Custom Nodes バージョンがある場合、このボタンは黄色になり、小さな `!` バッジを表示します。

<img src="images/readme/node-help.webp" alt="バージョンとリリースノートを表示する Resize Box のノード情報ポップアップ" width="720">

## 安全性とプライバシー

Deno Custom Nodes は、ファイル、ネットワーク、機密情報の扱いを、既定で狭く保ちます。

- **ファイル:** 画像ローダーが読み込むのは、ComfyUI の `input` フォルダーだけです。外部のパスや URL を使っていたワークフローを開き直す前に、外部の画像をアップロードしてください。Ideogram Director の Save Image がコピーするのは、画像ファイルだけです。
- **Local LLM:** サーバーは既定で localhost です。プライベート LAN のサーバーは、`DENO_LOCAL_LLM_ALLOWED_HOSTS` の厳密な許可リストを通した場合にだけ動作し、API キーは ComfyUI のホストの環境から読み込まれて、ワークフローや PNG メタデータには保存されません。
- **翻訳:** Ideogram の翻訳には、組み込みの Google、MyMemory、LibreTranslate のサービスだけを使います。
- **モデルのリンク:** Easy Model Download Helper は、公式のウェブリンクをブラウザで開くだけで、Python でファイルをダウンロードすることはありません。
- **レポート:** Error Help は読み取り専用で、コピーする前にレポートを表示し、token、cookie、password、private key といった一般的な機密情報をマスクします。

正確なルールは、[ファイルと翻訳へのアクセス](SECURITY_CONFIGURATION.md)を参照してください。

## このノード群を作った理由

このノード群は、実際の ComfyUI 制作で繰り返される準備の手間を減らすために作られました。目標は、膨大な機能リストを追いかけることではなく、人々が毎日繰り返すワークフローを、より速く、すっきりと、教えやすくすることです。

## 検索のヒント

- ComfyUI Manager または Registry では、`Deno Custom Nodes` を検索します。
- キャンバスでは、`(Deno)` か、`Resize Box` のようなノード名を検索します。
- ツールとその必要条件を探すには、[ワークフローマップ](#ワークフローマップ)を使います。

## インストール

推奨の Manager でのインストールは、[クイックスタート](#クイックスタート)に従ってください。

<details>
<summary>手動インストールと更新</summary>

手動でインストールする場合は、`custom_nodes` フォルダーの中で clone し、ComfyUI を起動するのと同じ Python 実行ファイルで依存関係をインストールします:

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
cd comfyui-deno-custom-nodes
python -m pip install -r requirements.txt
```

手動で更新する場合は、`git pull --ff-only` を実行し、同じ Python で `requirements.txt` を再インストールして、ComfyUI を再起動します。Manager/Registry でのインストールでは、パッケージの依存関係は自動的に処理されます。

</details>

## ライセンス

このリポジトリ内の Deno 所有のノード、ドキュメント、サンプル、ワークフロー、プロジェクト内のアセットは、GNU GPL v3.0(`GPL-3.0-only`)で公開されています。商用利用を含め、[GPL-3.0 の条件](../LICENSE)のもとで、使用、学習、変更、再配布ができます。変更版を配布する場合は GPL-3.0 に従い、必要なライセンス表示と著作権表示を保持してください。

外部のモデル、チェックポイント、LoRA、ライブラリ、ツール、サービスには、それぞれのライセンスと利用条件があります。特定のモデルやアセットから得た出力を使用、共有、販売する前に、該当するライセンスを確認してください。

## リリースノート

更新内容は、[最新リリース](https://github.com/Deno2026/comfyui-deno-custom-nodes/releases/latest)と [CHANGELOG.md](../CHANGELOG.md) を参照してください。

## リンク

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
