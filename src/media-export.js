import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from 'mediabunny';
import { createPlaybackPlan, samplePlayback } from './playback.js';
import { renderStageSvg } from './stage-renderer.js';

const GIF_WIDTH = 880;
const GIF_HEIGHT = 560;
const GIF_FPS = 15;
const MP4_WIDTH = 1100;
const MP4_HEIGHT = 700;
const MP4_FPS = 30;

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function imageDataForStage(stages, sample, width, height, logoData) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const sourceStage = stages[sample.stageIndex] || stages.at(-1);
  const stage = { ...sourceStage, players: sample.players, ball: sample.ball };
  renderStageSvg(svg, stage, { interactive: false });
  let markup = new XMLSerializer().serializeToString(svg);
  if (logoData) markup = markup.replaceAll('href="badge-logo.png"', `href="${logoData}"`);
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Unable to render the logo or the board into an image.'));
    element.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

async function loadLogoData() {
  const response = await fetch('badge-logo.png');
  if (!response.ok) throw new Error('Unable to load the Implacables logo for export.');
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to prepare the logo for export.'));
    reader.readAsDataURL(blob);
  });
}

function downloadBuffer(buffer, filename, type) {
  const url = URL.createObjectURL(new Blob([buffer], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function waitForWorker(worker, message, transfer = []) {
  return new Promise((resolve, reject) => {
    const onMessage = event => {
      if (event.data.type === 'error') { cleanup(); reject(new Error(event.data.message)); }
      else if (event.data.type === 'ready' || event.data.type === 'done') { cleanup(); resolve(event.data); }
    };
    const onError = event => { cleanup(); reject(new Error(event.message || 'GIF worker failed.')); };
    const cleanup = () => { worker.removeEventListener('message', onMessage); worker.removeEventListener('error', onError); };
    worker.addEventListener('message', onMessage); worker.addEventListener('error', onError); worker.postMessage(message, transfer);
  });
}

async function exportGif(stages, options, onProgress, signal) {
  const fps = Number(options.fps) || GIF_FPS;
  const plan = createPlaybackPlan(stages, { loop: Boolean(options.loop), durationPerStage: 800 / (Number(options.speed) || 1) });
  const duration = plan.duration || 800;
  const frameCount = Math.max(1, Math.ceil(duration / 1000 * fps));
  const logoData = await loadLogoData();
  const worker = new Worker(new URL('./gif-worker.js', import.meta.url), { type: 'module' });
  try {
    await waitForWorker(worker, { type: 'init', width: GIF_WIDTH, height: GIF_HEIGHT, loop: Boolean(options.loop) });
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (signal.aborted) throw new DOMException('Export canceled.', 'AbortError');
      const sample = samplePlayback(plan, frameIndex / fps * 1000);
      const imageData = await imageDataForStage(stages, sample, GIF_WIDTH, GIF_HEIGHT, logoData);
      await waitForWorker(worker, { type: 'frame', frameIndex, delay: 1000 / fps, buffer: imageData.data.buffer }, [imageData.data.buffer]);
      onProgress((frameIndex + 1) / frameCount);
      await nextFrame();
    }
    const result = await waitForWorker(worker, { type: 'finish' });
    downloadBuffer(result.buffer, options.filename, 'image/gif');
  } finally {
    worker.terminate();
  }
}

async function exportMp4(stages, options, onProgress, signal) {
  const fps = Number(options.fps) || MP4_FPS;
  const supported = await canEncodeVideo('avc', { width: MP4_WIDTH, height: MP4_HEIGHT, frameRate: fps, bitrate: 5_000_000 });
  if (!supported) throw new Error('H.264/AVC encoding is not available in this browser. GIF export remains available.');
  const plan = createPlaybackPlan(stages, { loop: false, durationPerStage: 800 / (Number(options.speed) || 1) });
  const duration = plan.duration || 800;
  const frameCount = Math.max(1, Math.ceil(duration / 1000 * fps));
  const logoData = await loadLogoData();
  const canvas = document.createElement('canvas'); canvas.width = MP4_WIDTH; canvas.height = MP4_HEIGHT;
  const context = canvas.getContext('2d');
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: 5_000_000, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  try {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (signal.aborted) { await output.cancel(); throw new DOMException('Export canceled.', 'AbortError'); }
      const sample = samplePlayback(plan, frameIndex / fps * 1000);
      const imageData = await imageDataForStage(stages, sample, MP4_WIDTH, MP4_HEIGHT, logoData);
      context.putImageData(imageData, 0, 0);
      await source.add(frameIndex / fps, 1 / fps);
      onProgress((frameIndex + 1) / frameCount);
      await nextFrame();
    }
    await output.finalize();
    downloadBuffer(target.buffer, options.filename, 'video/mp4');
  } catch (error) {
    if (output.state !== 'canceled' && output.state !== 'finalized') await output.cancel().catch(() => {});
    throw error;
  }
}

export function createMediaExporter() {
  return {
    gif: (stages, options, onProgress, signal) => exportGif(stages, options, onProgress, signal),
    mp4: (stages, options, onProgress, signal) => exportMp4(stages, options, onProgress, signal)
  };
}

export { GIF_WIDTH, GIF_HEIGHT, GIF_FPS, MP4_WIDTH, MP4_HEIGHT, MP4_FPS };
