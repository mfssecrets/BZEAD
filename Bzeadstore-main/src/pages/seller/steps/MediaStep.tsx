import React, { useRef, useState } from 'react';
import { X, Loader2, ImageIcon, Plus, ChevronLeft, ChevronRight, Info, Check, Upload, Video as VideoIcon } from 'lucide-react';

export interface MediaData {
  images: File[];
  imageUrls: string[];
  videos: File[];
  videoUrls: string[];
}

export interface UploadProgress {
  current: number;
  total: number;
  percent: number;
  fileName?: string;
}

interface Props {
  data: MediaData;
  onChange: (data: MediaData) => void;
  disabled?: boolean;
  uploadProgress?: UploadProgress | null;
}

const MAX_IMAGES = 10;
const MIN_IMAGES = 5;
const MAX_VIDEOS = 2;

const MediaStep: React.FC<Props> = ({ data, onChange, disabled, uploadProgress }) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const [showGuide, setShowGuide] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ kind: 'image' | 'video'; index: number } | null>(null);

  // ── Image helpers ──────────────────────────────────────────────────────────
  const handleImageSelect = (files: FileList | null) => {
    if (!files) return;
    const newImages = Array.from(files).slice(0, MAX_IMAGES - data.imageUrls.length);
    const urls = newImages.map((file) => URL.createObjectURL(file));
    onChange({
      ...data,
      images: [...data.images, ...newImages],
      imageUrls: [...data.imageUrls, ...urls],
    });
  };

  const removeImage = (index: number) => {
    const url = data.imageUrls[index];
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
      const blobIndexAmongBlobs = data.imageUrls.slice(0, index).filter((u) => u.startsWith('blob:')).length;
      onChange({
        ...data,
        images: data.images.filter((_, i) => i !== blobIndexAmongBlobs),
        imageUrls: data.imageUrls.filter((_, i) => i !== index),
      });
    } else {
      onChange({
        ...data,
        imageUrls: data.imageUrls.filter((_, i) => i !== index),
      });
    }
  };

  // Reorder helper: swap two URL positions and keep images[] (blob files) aligned.
  const reorderMedia = (
    urls: string[],
    files: File[],
    originalUrls: string[],
  ): { urls: string[]; files: File[] } => {
    // Build map: original URL index -> File (blob URLs only).
    let blobIdx = 0;
    const fileByOriginalIndex = new Map<number, File>();
    originalUrls.forEach((u, i) => {
      if (u.startsWith('blob:')) {
        const f = files[blobIdx];
        if (f) fileByOriginalIndex.set(i, f);
        blobIdx++;
      }
    });
    // Walk new url order, push files preserving the new order.
    const nextFiles: File[] = [];
    const taken = new Set<number>();
    urls.forEach((u) => {
      if (!u.startsWith('blob:')) return;
      for (let i = 0; i < originalUrls.length; i++) {
        if (taken.has(i)) continue;
        if (originalUrls[i] === u) {
          const f = fileByOriginalIndex.get(i);
          if (f) nextFiles.push(f);
          taken.add(i);
          break;
        }
      }
    });
    return { urls, files: nextFiles };
  };

  const moveImage = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= data.imageUrls.length) return;
    const urls = [...data.imageUrls];
    [urls[index], urls[target]] = [urls[target], urls[index]];
    const { files } = reorderMedia(urls, data.images, data.imageUrls);
    onChange({ ...data, imageUrls: urls, images: files });
  };

  // ── Video helpers ──────────────────────────────────────────────────────────
  const handleVideoSelect = (files: FileList | null) => {
    if (!files) return;
    const newVideos = Array.from(files).slice(0, MAX_VIDEOS - data.videoUrls.length);
    const urls = newVideos.map((file) => URL.createObjectURL(file));
    onChange({
      ...data,
      videos: [...data.videos, ...newVideos],
      videoUrls: [...data.videoUrls, ...urls],
    });
  };

  const removeVideo = (index: number) => {
    const url = data.videoUrls[index];
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
      const blobIndexAmongBlobs = data.videoUrls.slice(0, index).filter((u) => u.startsWith('blob:')).length;
      onChange({
        ...data,
        videos: data.videos.filter((_, i) => i !== blobIndexAmongBlobs),
        videoUrls: data.videoUrls.filter((_, i) => i !== index),
      });
    } else {
      onChange({
        ...data,
        videoUrls: data.videoUrls.filter((_, i) => i !== index),
      });
    }
  };

  const moveVideo = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= data.videoUrls.length) return;
    const urls = [...data.videoUrls];
    [urls[index], urls[target]] = [urls[target], urls[index]];
    const { files } = reorderMedia(urls, data.videos, data.videoUrls);
    onChange({ ...data, videoUrls: urls, videos: files });
  };

  const confirmAndRemove = () => {
    if (!confirmRemove) return;
    if (confirmRemove.kind === 'image') removeImage(confirmRemove.index);
    else removeVideo(confirmRemove.index);
    setConfirmRemove(null);
  };

  const imageCount = data.imageUrls.length;
  const imagesBelowMin = imageCount > 0 && imageCount < MIN_IMAGES;
  const canAddImage = imageCount < MAX_IMAGES;
  const canAddVideo = data.videoUrls.length < MAX_VIDEOS;

  return (
    <div className="space-y-4">
      {/* Title + guide link */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm sm:text-base font-bold text-gray-900">Upload Product Photos</h3>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
        >
          <Info size={13} /> Product Image Guide
        </button>
      </div>

      {/* ───── Image Section ───── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-[11px] sm:text-xs font-semibold text-gray-900">
            Product Images <span className="text-red-500">*</span>{' '}
            <span className="text-gray-500 font-normal">({MIN_IMAGES}–{MAX_IMAGES} required)</span>
          </label>
          <span className="text-[10px] text-gray-500">{imageCount}/{MAX_IMAGES}</span>
        </div>

        <div className="flex items-start gap-2">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 flex-1">
            {data.imageUrls.map((url, idx) => (
              <div
                key={`${url}-${idx}`}
                className="relative aspect-square rounded-md border border-gray-200 bg-gray-50 overflow-hidden"
              >
                {brokenImages.has(idx) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center px-1 bg-gray-100">
                    <ImageIcon size={18} className="text-gray-400 mb-0.5" />
                    <span className="text-[9px] text-gray-500 text-center truncate w-full">Image {idx + 1}</span>
                  </div>
                ) : (
                  <img
                    src={url}
                    alt={`Image ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => setBrokenImages((prev) => new Set(prev).add(idx))}
                  />
                )}
                {/* Index badge */}
                <span className="absolute top-1 left-1 bg-black/65 text-white text-[9px] px-1.5 py-0.5 rounded font-semibold">
                  {idx + 1}
                </span>
                {idx === 0 && (
                  <span className="absolute bottom-5 left-1 bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                    MAIN
                  </span>
                )}
                {/* Remove */}
                <button
                  type="button"
                  onClick={() => setConfirmRemove({ kind: 'image', index: idx })}
                  disabled={disabled}
                  className="absolute top-1 right-1 bg-red-600/90 text-white rounded-full p-0.5 shadow hover:bg-red-700"
                  aria-label="Remove image"
                >
                  <X size={11} />
                </button>
                {/* Reorder controls */}
                <div className="absolute inset-x-0 bottom-0 flex justify-between items-center px-1 py-0.5 bg-black/55">
                  <button
                    type="button"
                    onClick={() => moveImage(idx, -1)}
                    disabled={disabled || idx === 0}
                    className="text-white disabled:opacity-30 hover:text-blue-300"
                    aria-label="Move left"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(idx, 1)}
                    disabled={disabled || idx === imageCount - 1}
                    className="text-white disabled:opacity-30 hover:text-blue-300"
                    aria-label="Move right"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            ))}

            {/* Add card */}
            {canAddImage && (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={disabled}
                className="aspect-square rounded-md border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 flex flex-col items-center justify-center text-blue-600 transition-colors disabled:opacity-50"
              >
                <Upload size={18} />
                <span className="text-[10px] font-semibold mt-1">Upload</span>
              </button>
            )}
          </div>

          {/* + button on the right to add another */}
          {canAddImage && (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={disabled}
              aria-label="Add another image"
              className="shrink-0 w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-sm disabled:opacity-50"
            >
              <Plus size={18} />
            </button>
          )}
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png"
          multiple
          onChange={(e) => {
            handleImageSelect(e.target.files);
            if (imageInputRef.current) imageInputRef.current.value = '';
          }}
          className="hidden"
        />

        {imagesBelowMin && (
          <p className="mt-2 text-[11px] font-semibold text-red-600">
            Must upload at least {MIN_IMAGES} images ({imageCount}/{MIN_IMAGES} added).
          </p>
        )}
        {imageCount === 0 && (
          <p className="mt-2 text-[10px] text-gray-500">JPG / PNG / JPEG, up to 50 MB each.</p>
        )}

        {/* Upload progress */}
        {uploadProgress && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-md p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 text-[11px] text-gray-700 min-w-0">
                <Loader2 size={12} className="animate-spin text-blue-500 shrink-0" />
                <span className="truncate">
                  Uploading {uploadProgress.current}/{uploadProgress.total}
                  {uploadProgress.fileName && (
                    <span className="text-gray-400 ml-1">— {uploadProgress.fileName}</span>
                  )}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-blue-600 shrink-0 ml-2">
                {uploadProgress.percent}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ───── Video Section ───── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-[11px] sm:text-xs font-semibold text-gray-900">
            Product Videos <span className="text-gray-500 font-normal">(Optional, max {MAX_VIDEOS})</span>
          </label>
          <span className="text-[10px] text-gray-500">{data.videoUrls.length}/{MAX_VIDEOS}</span>
        </div>

        <div className="flex items-start gap-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1">
            {data.videoUrls.map((url, idx) => (
              <div
                key={`${url}-${idx}`}
                className="relative aspect-square rounded-md border border-gray-200 bg-black overflow-hidden"
              >
                <video src={url} className="w-full h-full object-cover" controls />
                <span className="absolute top-1 left-1 bg-black/65 text-white text-[9px] px-1.5 py-0.5 rounded font-semibold">
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmRemove({ kind: 'video', index: idx })}
                  disabled={disabled}
                  className="absolute top-1 right-1 bg-red-600/90 text-white rounded-full p-0.5 shadow hover:bg-red-700"
                  aria-label="Remove video"
                >
                  <X size={11} />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex justify-between items-center px-1 py-0.5 bg-black/55">
                  <button
                    type="button"
                    onClick={() => moveVideo(idx, -1)}
                    disabled={disabled || idx === 0}
                    className="text-white disabled:opacity-30 hover:text-blue-300"
                    aria-label="Move left"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveVideo(idx, 1)}
                    disabled={disabled || idx === data.videoUrls.length - 1}
                    className="text-white disabled:opacity-30 hover:text-blue-300"
                    aria-label="Move right"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            ))}

            {canAddVideo && (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={disabled}
                className="aspect-square rounded-md border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 flex flex-col items-center justify-center text-blue-600 transition-colors disabled:opacity-50"
              >
                <VideoIcon size={18} />
                <span className="text-[10px] font-semibold mt-1">Upload</span>
              </button>
            )}
          </div>

          {canAddVideo && (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={disabled}
              aria-label="Add another video"
              className="shrink-0 w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-sm disabled:opacity-50"
            >
              <Plus size={18} />
            </button>
          )}
        </div>

        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={(e) => {
            handleVideoSelect(e.target.files);
            if (videoInputRef.current) videoInputRef.current.value = '';
          }}
          className="hidden"
        />

        {data.videoUrls.length === 0 && (
          <p className="mt-2 text-[10px] text-gray-500">MP4 / WebM, up to 40 MB each.</p>
        )}
      </div>

      {/* ───── Product Image Guide Modal ───── */}
      {showGuide && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-gray-400">Guide</span>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="text-gray-500 hover:text-gray-800"
                aria-label="Close guide"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-4">
              <h2 className="text-sm sm:text-base font-bold text-gray-900 text-center mb-3">PRODUCT IMAGES GUIDE</h2>

              <ul className="space-y-2 text-[11px] sm:text-xs text-gray-700 list-disc list-outside pl-4">
                <li>Add high-resolution <strong>square</strong> images only (1000 × 1000 px).</li>
                <li>Upload a <strong>minimum of 5</strong> photos.</li>
                <li>Allowed formats: <strong>PNG, JPEG, JPG</strong>.</li>
                <li>Maximum size: <strong>50 MB per photo</strong>.</li>
              </ul>

              <p className="mt-4 mb-2 text-[11px] sm:text-xs font-semibold text-gray-900">Example layout</p>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-md bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 flex items-center justify-center"
                  >
                    <ImageIcon size={16} className="text-gray-400" />
                    <span className="absolute top-0.5 right-0.5 bg-green-500 text-white rounded-full p-0.5 shadow">
                      <Check size={9} strokeWidth={3} />
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-gray-500 text-center">
                Tick marks indicate each image meets the guide requirements.
              </p>
            </div>

            <div className="border-t border-gray-200 px-4 py-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Remove Confirmation Modal ───── */}
      {confirmRemove && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-xs rounded-xl shadow-2xl p-4">
            <h3 className="text-[12px] font-bold text-gray-900 mb-1">
              Remove this {confirmRemove.kind}?
            </h3>
            <p className="text-[11px] text-gray-600 mb-4">
              This will remove the {confirmRemove.kind} from your draft. You can re-upload it any time.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="px-3 py-1.5 text-[11px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAndRemove}
                className="px-3 py-1.5 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaStep;
