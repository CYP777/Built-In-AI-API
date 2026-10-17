import { useState, useRef, useCallback, useEffect } from 'react';
import type { AudioAttachment } from '../types/ai';

export interface UseAudioRecorderOptions {
  onAudioRecorded?: (attachment: AudioAttachment) => void;
  onError?: (message: string) => void;
}

export interface UseAudioRecorderReturn {
  isRecordingAudio: boolean;
  recordingDuration: number;
  startAudioRecording: () => Promise<void>;
  stopAudioRecording: () => void;
  cancelAudioRecording: () => void;
}

export function useAudioRecorder({
  onAudioRecorded,
  onError,
}: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  const clearTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const stopStreamTracks = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
  }, []);

  const startAudioRecording = useCallback(async () => {
    try {
      isCancelledRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopStreamTracks();

        if (isCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }

        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const objectUrl = URL.createObjectURL(audioBlob);

        // Detect appropriate extension according to MIME container (safeguard for iOS/Safari audio/mp4)
        let ext = 'webm';
        if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
          ext = 'mp4';
        } else if (mimeType.includes('ogg')) {
          ext = 'ogg';
        } else if (mimeType.includes('wav')) {
          ext = 'wav';
        }

        // Asynchronously decode duration in background without blocking the UI
        let duration: number | undefined;
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const ab = await audioBlob.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(ab.slice(0));
            duration = audioBuffer.duration;
            ctx.close();
          }
        } catch (err) {
          console.warn('Audio decode notice in useAudioRecorder:', err);
        }

        const attachment: AudioAttachment = {
          url: objectUrl,
          name: `voice-recording-${Date.now()}.${ext}`,
          size: audioBlob.size,
          type: mimeType,
          duration,
          blob: audioBlob,
        };

        onAudioRecorded?.(attachment);
      };

      mediaRecorder.start(200);
      setIsRecordingAudio(true);
      setRecordingDuration(0);

      clearTimer();
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Audio recording failed:', err);
      onError?.('ไม่สามารถเข้าถึงไมโครโฟนสำหรับการบันทึกเสียงได้ (กรุณาอนุญาตการเข้าถึงไมโครโฟน)');
    }
  }, [clearTimer, stopStreamTracks, onAudioRecorded, onError]);

  const stopAudioRecording = useCallback(() => {
    clearTimer();
    isCancelledRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingAudio(false);
  }, [clearTimer]);

  const cancelAudioRecording = useCallback(() => {
    isCancelledRef.current = true;
    clearTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopStreamTracks();
    audioChunksRef.current = [];
    setIsRecordingAudio(false);
    setRecordingDuration(0);
  }, [clearTimer, stopStreamTracks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      stopStreamTracks();
    };
  }, [clearTimer, stopStreamTracks]);

  return {
    isRecordingAudio,
    recordingDuration,
    startAudioRecording,
    stopAudioRecording,
    cancelAudioRecording,
  };
}
