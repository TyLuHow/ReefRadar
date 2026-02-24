'use client';

import { useCallback, useState } from 'react';
import { Upload, File, X, AlertCircle } from 'lucide-react';
import { cn, validateWavFile, formatFileSize } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  selectedFile?: File | null;
  onClear?: () => void;
}

export function FileUpload({
  onFileSelect,
  disabled = false,
  selectedFile,
  onClear,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const validation = validateWavFile(file);

      if (!validation.valid) {
        setError(validation.error || 'Invalid file');
        return;
      }

      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [disabled, handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleClear = useCallback(() => {
    setError(null);
    onClear?.();
  }, [onClear]);

  if (selectedFile) {
    return (
      <div
        className="rounded-xl p-6"
        style={{ border: '2px solid #cd853f', background: 'rgba(205, 133, 63, 0.08)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'rgba(205, 133, 63, 0.15)' }}>
              <File className="w-6 h-6 text-ochre" />
            </div>
            <div>
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedFile.name}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
          </div>
          {!disabled && (
            <button
              onClick={handleClear}
              className="p-2 rounded-lg transition-colors hover:bg-white/10"
              style={{ color: 'var(--text-dim)' }}
              aria-label="Remove file"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-all',
          isDragging
            ? 'border-ochre scale-[1.02]'
            : 'hover:border-ochre/50',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-dusty-rose'
        )}
        style={{
          borderColor: isDragging ? '#cd853f' : error ? '#c08081' : 'var(--glass-border)',
          background: isDragging ? 'rgba(205, 133, 63, 0.08)' : error ? 'rgba(192, 128, 129, 0.08)' : 'transparent',
        }}
      >
        <input
          type="file"
          accept=".wav,audio/wav"
          onChange={handleInputChange}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        <div className="space-y-4">
          <div
            className={cn(
              'mx-auto w-16 h-16 rounded-full flex items-center justify-center transition-colors',
            )}
            style={{
              background: isDragging ? 'rgba(205, 133, 63, 0.3)' : 'var(--glass-bg)',
              color: isDragging ? '#cd853f' : 'var(--text-dim)',
            }}
          >
            <Upload className="w-8 h-8" />
          </div>

          <div>
            <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
              {isDragging ? 'Drop your file here' : 'Drag and drop your audio file'}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              or{' '}
              <span className="text-ochre font-medium">browse</span>{' '}
              to upload
            </p>
          </div>

          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
            WAV format only, maximum 50MB
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center space-x-2 text-sm" style={{ color: '#c08081' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
