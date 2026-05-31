# Deno Custom Nodes

[English](../README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Español](README.es.md) | [Português](README.pt-PT.md) | [Português (Brasil)](README.pt-BR.md) | [Bahasa Indonesia](README.id.md)

Deno Custom Nodes 是一组 ComfyUI 自定义节点，面向日常生产流程中的图像、视频、LTX、RTX 和模型准备任务，重点是更快、更清晰、更容易教学。

这是简体中文快速指南。完整的节点细节仍以英文 [README](../README.md) 为准。

![DENO Visual Fold](images/deno-visual-fold.webp)

## 快速链接

- GitHub: https://github.com/Deno2026/comfyui-deno-custom-nodes
- ComfyUI Registry: https://registry.comfy.org/publishers/deno2026/nodes/deno-custom-nodes
- YouTube: https://www.youtube.com/@Denoise-AI
- Video Compare: https://deno2026.github.io/comfyui-deno-custom-nodes/video-compare/
- Video to GIF/WebP: https://deno2026.github.io/comfyui-deno-custom-nodes/video-to-gif/
- RTX VFX 安装指南: https://deno2026.github.io/comfyui-deno-custom-nodes/rtx-vfx-install/

## 安装

最简单的方法是在 ComfyUI Manager 或 Registry 中安装 `deno-custom-nodes`。

如果手动安装，请在 ComfyUI 的 `custom_nodes` 文件夹中运行下面的命令，然后重启 ComfyUI。

```bash
git clone https://github.com/Deno2026/comfyui-deno-custom-nodes.git
```

## 主要功能

- DENO Visual Fold: 将大型工作流中的多个节点或组进行视觉折叠，不改变工作流逻辑。
- Video Compare Web Tool: 无需安装，在浏览器中用滑块、并排、差异模式比较两个视频。
- Video to GIF/WebP Web Tool: 裁剪短视频并导出为 GIF 或更小的 WebP。
- RTX Video Super Resolution Node: 在 ComfyUI 中尝试 NVIDIA RTX VFX 超分辨率。
- LTX Tools: 整理 LTX 2.3 的模型加载、序列、LoRA 和提示词流程。
- Image Loader and Compare Nodes: 处理多图加载、尺寸调整和画布内比较。

## 节点概览

- `(Deno) Resize Box`: 管理解像度、比例、百万像素、裁剪/适配缩放。
- `(Deno) Multi Image Loader`: 通过上传、粘贴和文件夹浏览加载多张图片。
- `(Deno) Advanced Image Source Loader`: 支持外部文件夹、本地路径、网络图片 URL 和混合尺寸图片列表。
- `(Deno) Image Compare`: 在 ComfyUI 画布内直接比较两张图片。
- `(Deno) Video Compare`: 按帧比较两个视频批次并输出比较图像。
- `(Deno) Video Preview`: 以真实编码结果预览中间视频输出。
- `(Deno) RTX Video Super Resolution`: 简化 NVIDIA VFX 超分辨率执行。
- `(Deno) RTX Video Super Resolution (2 Pass)`: 分两步执行 Denoise/Deblur 和 Upscale。
- `(Deno) LTX Sequencer`: 整理 LTX 多图工作流中的 strength 流程。
- `(Deno) LTX Model Loader`: 整合 LTX 2.3 Checkpoint、KJ 和 GGUF 加载方式。
- `(Deno) Easy Model Download Helper`: 用官方链接和目标路径帮助安装推荐模型文件。
- `(Deno) LTX Multi LoRA Loader`: 在一个节点中管理多个 LTX LoRA 和触发词。
- `(Deno) LTX Prompt Guide`: 整理 LTX 提示词、负面提示词和对白时长估算。

## 新手提示

- 遇到问题时，请同时提供错误信息和 ComfyUI 画面截图。
- 分享截图前，请遮住 token、密码和验证码。
- RTX VFX 相关问题建议先完全关闭 ComfyUI，再按安装指南一步步检查。
- 完整节点选项和截图请查看英文 [README](../README.md)。
