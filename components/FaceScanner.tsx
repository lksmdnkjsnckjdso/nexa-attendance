import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { MODEL_URL } from '../constants';

interface FaceScannerProps {
  onScan: (descriptor: Float32Array) => void | Promise<void>;
  isScanning: boolean;
  message?: string;
  onClose: () => void;
}

export const FaceScanner: React.FC<FaceScannerProps> = ({ onScan, isScanning, message, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.error("Failed to load face models", err);
        setError("Failed to load face recognition models. Please check your internet connection.");
      }
    };
    loadModels();

    return () => {
      stopVideo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (modelsLoaded && isScanning) {
      startVideo();
    } else {
      stopVideo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsLoaded, isScanning]);

  const startVideo = () => {
    navigator.mediaDevices.getUserMedia({ video: {} })
      .then((currentStream) => {
        streamRef.current = currentStream;
        if (videoRef.current) {
          videoRef.current.srcObject = currentStream;
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Camera permission denied or not available.");
      });
  };

  const stopVideo = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleVideoPlay = async () => {
    if (!videoRef.current || !canvasRef.current || !modelsLoaded) return;

    // Clear any existing interval to prevent duplicates
    if (intervalRef.current) clearInterval(intervalRef.current);

    const video = videoRef.current;
    const canvas = canvasRef.current;

    const displaySize = {
      width: video.videoWidth,
      height: video.videoHeight
    };

    // Check if dimensions are valid
    if (displaySize.width === 0 || displaySize.height === 0) return;

    faceapi.matchDimensions(canvas, displaySize);

    intervalRef.current = setInterval(async () => {
      // Robust null checks inside the async interval
      if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) {
        return;
      }

      try {
        const detections = await faceapi.detectAllFaces(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions()
        )
          .withFaceLandmarks()
          .withFaceDescriptors();

        // Check if canvas still exists after await
        if (!canvasRef.current) return;

        const resizedDetections = faceapi.resizeResults(detections, displaySize);

        const currentCanvas = canvasRef.current;
        const ctx = currentCanvas.getContext('2d');

        if (ctx) {
          ctx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
          faceapi.draw.drawDetections(currentCanvas, resizedDetections);
        }

        if (resizedDetections.length > 0) {
          // Found a face, send the descriptor
          // Find the face with the largest area (closest/most prominent)
          const bestFace = resizedDetections.reduce((prev, current) => {
            return (prev.detection.box.area > current.detection.box.area) ? prev : current;
          });

          // Stop scanning first to prevent duplicate calls
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          try {
            await onScan(bestFace.descriptor);
          } catch (e) {
            console.error("onScan error", e);
          }
        }
      } catch (e) {
        console.error("Detection error", e);
      }
    }, 500); // Check every 500ms
  };

  // Fallback / Simulation mode for when models fail to load in restricted environments
  const handleSimulateScan = () => {
    // Create a fake descriptor for testing
    const fakeDescriptor = new Float32Array(128).fill(Math.random());
    onScan(fakeDescriptor);
  };

  if (!isScanning) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg relative overflow-hidden">
        <button
          onClick={() => { stopVideo(); onClose(); }}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 z-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <h2 className="text-2xl font-bold mb-4 text-center">Face Scan</h2>
        {message && <p className="text-blue-600 text-center mb-4">{message}</p>}
        {error ? (
          <div className="text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={handleSimulateScan} className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600">
              Simulate Successful Scan (Debug)
            </button>
          </div>
        ) : !modelsLoaded ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-500">Loading AI Models...</p>
            <p className="text-xs text-gray-400 mt-2">Connecting to GitHub...</p>
          </div>
        ) : (
          <div className="relative bg-black rounded-lg overflow-hidden flex justify-center min-h-[300px]">
            <video
              ref={videoRef}
              autoPlay
              muted
              onPlay={handleVideoPlay}
              className="w-full h-auto"
            />
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-white bg-black bg-opacity-50 px-2 py-1 inline-block rounded text-sm">
                Position your face in the center
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};