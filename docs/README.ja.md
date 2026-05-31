# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

Deno Custom Nodes は、ComfyUI でよく使う画像、動画、LTX、RTX、モデル準備の作業をより速く、分かりやすくするためのカスタムノード集です。

このページは日本語のクイックガイドです。各ノードの詳細な説明は、英語の [README](../README.md) を基準として維持します。

![DENO Visual Fold](images/deno-visual-fold.webp)

## すぐ開く

- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- ComfyUI Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
- YouTube: https://www.youtube.com/@Denoise-AI
- Video Compare: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/
- Video to GIF/WebP: https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/
- RTX VFX インストールガイド: https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/

## インストール

いちばん簡単な方法は、ComfyUI Manager または Registry で `deno-custom-nodes` をインストールすることです。

手動で入れる場合は、ComfyUI の `custom_nodes` フォルダーで次のコマンドを実行し、ComfyUI を再起動してください。

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

## 主な機能

- DENO Visual Fold: 大きなワークフロー内の複数ノードやグループを、ロジックを変えずに視覚的に折りたためます。
- Video Compare Web Tool: インストール不要で、2つの動画をスライダー、横並び、差分表示で比較できます。
- Video to GIF/WebP Web Tool: 短い動画を切り出して GIF または軽量な WebP に変換できます。
- RTX Video Super Resolution Node: NVIDIA RTX VFX のアップスケールを ComfyUI から試せます。
- LTX Tools: LTX 2.3 のモデル読み込み、シーケンス、LoRA、プロンプト作成を整理します。
- Image Loader and Compare Nodes: 複数画像の読み込み、リサイズ、キャンバス内比較を扱います。

## 含まれるノード

- `(Deno) Resize Box`: 解像度、比率、メガピクセル、クロップ/フィットのリサイズを整理します。
- `(Deno) Multi Image Loader`: アップロード、貼り付け、フォルダー参照で複数画像を読み込みます。
- `(Deno) Advanced Image Source Loader`: 外部フォルダー、ローカルパス、Web画像URL、混在サイズの画像リストを扱います。
- `(Deno) Image Compare`: 2枚の画像を ComfyUI キャンバス上で直接比較します。
- `(Deno) Video Compare`: 2つの動画バッチをフレーム基準で比較し、比較画像を出力します。
- `(Deno) Video Preview`: 中間結果の動画を実際のエンコード状態で確認します。
- `(Deno) RTX Video Super Resolution`: NVIDIA VFX アップスケールを簡単に実行します。
- `(Deno) RTX Video Super Resolution (2 Pass)`: Denoise/Deblur とアップスケールを2段階で実行します。
- `(Deno) LTX Sequencer`: LTX の複数画像ワークフローで strength の流れを整理します。
- `(Deno) LTX Model Loader`: LTX 2.3 の Checkpoint、KJ、GGUF 読み込みパターンをまとめます。
- `(Deno) Easy Model Download Helper`: 推奨モデルファイルのリンクと保存先を分かりやすく案内します。
- `(Deno) LTX Multi LoRA Loader`: 複数の LTX LoRA とトリガーワードを1つのノードで管理します。
- `(Deno) LTX Prompt Guide`: LTX プロンプト、ネガティブプロンプト、台詞の長さ見積もりを整理します。

## 初心者向けメモ

- 困ったときは、エラーメッセージと ComfyUI 画面のスクリーンショットを一緒に共有してください。
- トークン、パスワード、認証コードが見える画面は隠してから共有してください。
- RTX VFX の問題では、まず ComfyUI を完全に閉じてからインストールガイドを順番に確認してください。
- すべてのノードオプションとスクリーンショットは英語の [README](../README.md) を参照してください。
