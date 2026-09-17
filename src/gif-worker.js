import { GIFEncoder, applyPalette, quantize } from 'gifenc';

let encoder;
let width = 0;
let height = 0;
let repeat = -1;

self.onmessage = event => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      width = message.width;
      height = message.height;
      repeat = message.loop ? 0 : -1;
      encoder = GIFEncoder();
      self.postMessage({ type: 'ready' });
      return;
    }
    if (message.type === 'frame') {
      const rgba = new Uint8ClampedArray(message.buffer);
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);
      encoder.writeFrame(index, width, height, { palette, delay: message.delay, repeat: message.frameIndex === 0 ? repeat : undefined });
      self.postMessage({ type: 'ready', frameIndex: message.frameIndex });
      return;
    }
    if (message.type === 'finish') {
      encoder.finish();
      const bytes = encoder.bytes();
      self.postMessage({ type: 'done', buffer: bytes.buffer }, [bytes.buffer]);
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
