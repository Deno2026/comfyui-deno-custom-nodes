# (Deno) Resize Box

Chooses a model-friendly output size and optionally resizes an input image to that exact frame.

## Crop Position (Fill)

Connect an image to see the full source in the node preview.

- Drag inside the crop box to choose the visible area.
- Drag any corner to zoom in or out. The selected aspect ratio stays locked.
- Output megapixels, width, and height do not change while editing the crop.
- The crop position and zoom are saved with the workflow.

Very small crop areas are enlarged to the selected output size, so image detail can become softer.

## Other resize modes

- `Center Crop (Fill)` fills the frame and crops from the center.
- `Fit (Letterbox/Pillarbox)` keeps the whole image and adds black padding when needed.

The outputs are the resized `image` and its final `width` and `height`.
