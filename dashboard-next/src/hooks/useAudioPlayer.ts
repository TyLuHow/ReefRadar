import { useState, useEffect, useRef, useCallback } from 'react';

interface AudioPlayerResult {
  play: () => void;
  pause: () => void;
  stop: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioElement: HTMLAudioElement | null;
}

export function useAudioPlayer(src: string): AudioPlayerResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [src]);

  const updateTime = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
    animationRef.current = requestAnimationFrame(updateTime);
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.play().then(() => {
      setIsPlaying(true);
      animationRef.current = requestAnimationFrame(updateTime);
    }).catch(() => {
      // Playback was prevented (e.g., autoplay policy)
    });
  }, [updateTime]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setIsPlaying(false);
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  return {
    play,
    pause,
    stop,
    isPlaying,
    currentTime,
    duration,
    audioElement: audioRef.current,
  };
}
