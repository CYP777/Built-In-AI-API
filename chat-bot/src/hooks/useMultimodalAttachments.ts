import { useState, useCallback } from 'react';
import type { ImageAttachment, AudioAttachment } from '../types/ai';

export interface UseMultimodalAttachmentsOptions {
  maxImages?: number;
  maxImageSizeBytes?: number;
  maxAudioSizeBytes?: number;
  onNotice?: (message: string, type: 'warning' | 'error' | 'info') => void;
}

export interface UseMultimodalAttachmentsReturn {
  selectedImages: ImageAttachment[];
  setSelectedImages: React.Dispatch<React.SetStateAction<ImageAttachment[]>>;
  selectedAudio: AudioAttachment | null;
  setSelectedAudio: React.Dispatch<React.SetStateAction<AudioAttachment | null>>;
  processImageFile: (file: File, fallbackName?: string) => void;
  processAudioFile: (file: File) => void;
  handleRemoveImage: (index: number) => void;
  handleRemoveAudio: () => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  clearAttachments: () => void;
}

export function useMultimodalAttachments({
  maxImages = 8,
  maxImageSizeBytes = 10 * 1024 * 1024, // 10 MB
  maxAudioSizeBytes = 25 * 1024 * 1024, // 25 MB
  onNotice,
}: UseMultimodalAttachmentsOptions = {}): UseMultimodalAttachmentsReturn {
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<AudioAttachment | null>(null);

  const processImageFile = useCallback(
    (file: File, fallbackName?: string) => {
      if (!file.type.startsWith('image/')) {
        onNotice?.('กรุณาเลือกไฟล์รูปภาพเท่านั้น (เช่น PNG, JPG, WebP, GIF)', 'warning');
        return;
      }

      if (file.size > maxImageSizeBytes) {
        onNotice?.(
          `ขนาดไฟล์รูปภาพเกินกำหนด (จำกัดไม่เกิน ${(maxImageSizeBytes / (1024 * 1024)).toFixed(0)} MB ต่อภาพ)`,
          'warning'
        );
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setSelectedImages((prev) => {
        if (prev.length >= maxImages) {
          URL.revokeObjectURL(objectUrl);
          onNotice?.(`จำกัดการแนบรูปภาพไม่เกิน ${maxImages} รูปต่อครั้ง`, 'warning');
          return prev;
        }
        return [
          ...prev,
          {
            url: objectUrl,
            name: file.name || fallbackName || `image-${Date.now()}.png`,
            size: file.size,
            type: file.type || 'image/png',
            file: file,
          },
        ];
      });
    },
    [maxImages, maxImageSizeBytes, onNotice]
  );

  const processAudioFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|webm|aac|flac)$/i.test(file.name)) {
        onNotice?.('กรุณาเลือกไฟล์เสียง (เช่น MP3, WAV, OGG, M4A, WebM)', 'warning');
        return;
      }

      if (file.size > maxAudioSizeBytes) {
        onNotice?.(
          `ขนาดไฟล์เสียงเกินกำหนด (จำกัดไม่เกิน ${(maxAudioSizeBytes / (1024 * 1024)).toFixed(0)} MB)`,
          'warning'
        );
        return;
      }

      const objectUrl = URL.createObjectURL(file);

      // Async decode for duration metadata without blocking the UI
      (async () => {
        let duration: number | undefined;
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const ab = await file.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(ab.slice(0));
            duration = audioBuffer.duration;
            ctx.close();
          }
        } catch (err) {
          console.warn('Audio decode notice in useMultimodalAttachments:', err);
        }

        if (duration) {
          setSelectedAudio((prev) => (prev && prev.url === objectUrl ? { ...prev, duration } : prev));
        }
      })();

      setSelectedAudio({
        url: objectUrl,
        name: file.name,
        size: file.size,
        type: file.type || 'audio/webm',
        blob: file,
      });
    },
    [maxAudioSizeBytes, onNotice]
  );

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages((prev) => {
      const target = prev[index];
      if (target?.url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(target.url);
        } catch {
          // ignore revocation errors
        }
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleRemoveAudio = useCallback(() => {
    setSelectedAudio((prev) => {
      if (prev?.url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          // ignore revocation errors
        }
      }
      return null;
    });
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file, `clipboard-image-${Date.now()}.png`);
          }
        }
      }
    },
    [processImageFile]
  );

  const clearAttachments = useCallback(() => {
    setSelectedImages([]);
    setSelectedAudio(null);
  }, []);

  return {
    selectedImages,
    setSelectedImages,
    selectedAudio,
    setSelectedAudio,
    processImageFile,
    processAudioFile,
    handleRemoveImage,
    handleRemoveAudio,
    handlePaste,
    clearAttachments,
  };
}
