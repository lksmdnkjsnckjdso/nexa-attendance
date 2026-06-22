import * as faceapi from 'face-api.js';

export const DESCRIPTOR_SIZE = 128;

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initializeModels(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      initialized = true;
    } catch (err) {
      initPromise = null;
      throw err;
    }
  })();
  return initPromise;
}

export function isModelsLoaded(): boolean {
  return initialized;
}

export interface FaceDetectionResult {
  descriptor: Float32Array;
  box: { x: number; y: number; width: number; height: number };
  score: number;
}

export async function detectFace(
  video: HTMLVideoElement
): Promise<FaceDetectionResult | null> {
  if (!initialized) return null;

  const displaySize = {
    width: video.videoWidth,
    height: video.videoHeight,
  };
  if (displaySize.width === 0 || displaySize.height === 0) return null;

  const detections = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.5,
    }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (!detections || detections.length === 0) return null;

  const best = detections.reduce((prev, current) =>
    prev.detection.box.area > current.detection.box.area ? prev : current
  );

  return {
    descriptor: best.descriptor,
    box: {
      x: best.detection.box.x,
      y: best.detection.box.y,
      width: best.detection.box.width,
      height: best.detection.box.height,
    },
    score: best.detection.score ?? 0,
  };
}

export function euclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  return faceapi.euclideanDistance(a, b);
}
