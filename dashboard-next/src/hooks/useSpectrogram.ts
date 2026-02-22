import { useState, useEffect, useRef, useCallback } from 'react';

interface SpectrogramResult {
  frequencyData: Float32Array | null;
  analyser: AnalyserNode | null;
  isReady: boolean;
}

export function useSpectrogram(
  audioElement: HTMLAudioElement | null
): SpectrogramResult {
  const [isReady, setIsReady] = useState(false);
  const [frequencyData, setFrequencyData] = useState<Float32Array | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const initAudioContext = useCallback(() => {
    if (audioContextRef.current || !audioElement) return;

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.85;

    const source = ctx.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;
    setIsReady(true);
  }, [audioElement]);

  useEffect(() => {
    if (!audioElement) return;

    const handlePlay = () => {
      initAudioContext();

      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }

      const analyser = analyserRef.current;
      if (!analyser) return;

      const dataArray = new Float32Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getFloatFrequencyData(dataArray);
        setFrequencyData(new Float32Array(dataArray));
        animationRef.current = requestAnimationFrame(tick);
      };

      animationRef.current = requestAnimationFrame(tick);
    };

    const handlePause = () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('ended', handlePause);

    return () => {
      audioElement.removeEventListener('play', handlePlay);
      audioElement.removeEventListener('pause', handlePause);
      audioElement.removeEventListener('ended', handlePause);

      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioElement, initAudioContext]);

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, []);

  return {
    frequencyData,
    analyser: analyserRef.current,
    isReady,
  };
}
