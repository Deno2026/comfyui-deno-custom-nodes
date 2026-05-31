# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

[YouTube Channel](https://www.youtube.com/@Denoise-AI)

Deno Custom Nodes は、ComfyUI の実制作でよく繰り返す画像、動画、LTX、RTX、モデル準備の作業を、より速く、分かりやすく、日常的に使いやすくするためのカスタムノード集です。多くの Deno ノードには、キャンバスを離れずに説明を確認できる小さな緑色の `i` ボタンがあります。

## Release Notes

公開アップデートは [CHANGELOG.md](../CHANGELOG.md) に短く記録します。

## Web Tools

ブラウザで直接使えるツールです。

- [DENO Video Compare](https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/) - 2つの動画をスライダー、横並び、差分、トグル表示で比較します。
- [DENO Video to GIF/WebP](https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/) - 短いクリップをトリム、クロップ、リサイズして GIF または軽量 WebP に書き出します。

## DENO Visual Fold

![DENO Visual Fold](images/deno-visual-fold.webp)

DENO Visual Fold は、大きな ComfyUI グラフを視覚的に整理するための機能です。ノードやグループを折りたたんでも、ワークフローのロジックは変更されません。

2つ以上のノードを選択すると、キャンバス右上付近に緑色の `Fold` ボタンが表示されます。クリックすると選択したノードが1つのコンパクトな視覚グループとして折りたたまれ、`Unfold` で戻せます。通常の ComfyUI グループを1つ選んだ場合は `Fold Group` を使えます。複数グループを選ぶと整列アクションも表示されます。

Subgraph はノードを子グラフへ移動しますが、Visual Fold は単なる視覚整理です。`Get` / `Set` ノードや親子グラフ構造をメイン画面に残したい時に便利です。

## Included Nodes

### `(Deno) Resize Box`

ComfyUI 用の解像度補助と画像リサイズノードです。

![Deno Resize Box](images/resize-box.jpg)

主な機能: 比率プリセット、手入力、メガピクセル計算、`divisible_by` 整列、Center Crop と Fit リサイズ、ノード内の比率プレビュー、`image`, `width`, `height` 出力。

### `(Deno) Multi Image Loader`

バッチガイド系ワークフロー向けの複数画像ローダーです。

![Deno Multi Image Loader](images/multi-image-loader.jpg)

主な機能: 固定高さギャラリー、ドラッグ並べ替え、アップロード、ドラッグ&ドロップ、画像貼り付け、ComfyUI `input` フォルダー参照、ネストフォルダー対応、新しい順の画像ソート、比率維持/プリセット/手入力リサイズ、`multi_output`, `width`, `height` 出力。

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

### `(Deno) Easy Model Download Helper`

推奨モデルファイルセットを案内するプリセット型セットアップヘルパーです。

![Deno Easy Model Download Helper](images/easy-model-download-helper.png)

主な機能: Python で直接ダウンロードせず公式モデルリンクをブラウザで開く、ComfyUI モデルルート表示、workflow 内 creator preset 保存、Hugging Face と Civitai リンク対応、対象フォルダーにファイルがあるか確認。

![Hugging Face link guide](images/easy-model-download-helper-huggingface-link.png)

![Civitai page URL guide](images/easy-model-download-helper-civitai-link.png)

![Civitai preset editor guide](images/easy-model-download-helper-civitai-node.png)

### `(Deno) LTX Multi LoRA Loader`

LTX ワークフロー向けの Power-LoRA 風マルチ LoRA ローダーです。

![Deno LTX Multi LoRA Loader](images/ltx-multi-lora-loader.png)

主な機能: 複数 LoRA、スロット別 enable、strength/video/audio strength、trigger word と note、trigger word コピー、パッチ済み `model` と `clip` 出力。

### `(Deno) LTX Prompt Guide`

LTX prompt encoding、任意の negative prompt、LTX conditioning、台詞長の計画をまとめるプロンプトヘルパーです。

![Deno LTX Prompt Guide](images/ltx-prompt-guide.png)

主な機能: positive prompt encoding、折りたたみ negative prompt、`frame_rate` 付き LTX conditioning、引用符内の台詞長推定、Auto/Korean/English/Japanese/Chinese の台詞推定。

## Why This Exists

このノード群は、実際の ComfyUI 制作で繰り返される準備の手間を減らすために作られました。巨大な機能リストよりも、毎日使うワークフローを速く、きれいに、教えやすくすることを目指しています。

## Search Tips

GitHub、ComfyUI Manager、Registry では `deno custom nodes`, `rtx video super resolution`, `nvidia vfx`, `image compare`, `video compare`, `video preview`, `video to gif`, `gif webp`, `ltx 2.3`, `ltx model loader`, `ltx multi lora`, `visual fold` などで探せます。

## Install

ComfyUI の `custom_nodes` フォルダー内でインストールします。

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

その後 ComfyUI を再起動してください。

## Links

- YouTube: https://www.youtube.com/@Denoise-AI
- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
