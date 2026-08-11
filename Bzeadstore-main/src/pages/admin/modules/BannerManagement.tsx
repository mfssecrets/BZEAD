import { useCallback, useEffect, useState, useRef } from 'react';
import { Loader2, Plus, Trash2, Eye, EyeOff, Upload, ArrowUp, ArrowDown, RefreshCw, Video, Link as LinkIcon, X } from 'lucide-react';
import { ListSkeleton } from '../../../components/common/Skeleton';
import {
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../../../lib/adminService';
import { supabase } from '../../../lib/supabase';
import type { Banner } from '../../../types';

/* ───────── banner image uploader ───────── */

function getBucketForType(type: 'hero' | 'ad' | 'video'): string {
  switch (type) {
    case 'hero': return 'hero-banners';
    case 'ad': return 'ad-banners';
    case 'video': return 'video-ads';
  }
}

interface UploadResult { publicUrl: string; bucket: string; path: string }

function uploadBannerImage(file: File, type: 'hero' | 'ad' | 'video' = 'hero'): Promise<UploadResult> {
  return new Promise(async (resolve, reject) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) { reject(new Error('Only JPEG, PNG, or WebP')); return; }
    if (file.size > 5 * 1024 * 1024) { reject(new Error('Max 5 MB')); return; }

    const ext = file.name.split('.').pop() || 'png';
    const bucket = getBucketForType(type);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type });

    if (error) { reject(new Error(error.message)); return; }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    resolve({ publicUrl: data.publicUrl, bucket, path });
  });
}

function uploadVideoFile(file: File): Promise<UploadResult> {
  return new Promise(async (resolve, reject) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowed.includes(file.type)) { reject(new Error('Only MP4, WebM, or MOV files')); return; }
    if (file.size > 500 * 1024 * 1024) { reject(new Error('Max 500 MB')); return; }

    const ext = file.name.split('.').pop() || 'mp4';
    const bucket = 'video-ads';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) { reject(new Error(error.message)); return; }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    resolve({ publicUrl: data.publicUrl, bucket, path });
  });
}

/** Remove an uploaded file from storage (best-effort) */
async function removeStorageFile(imageUrl: string) {
  for (const bucket of ['hero-banners', 'ad-banners', 'video-ads']) {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = imageUrl.indexOf(marker);
    if (idx !== -1) {
      const path = decodeURIComponent(imageUrl.slice(idx + marker.length));
      await supabase.storage.from(bucket).remove([path]);
      return;
    }
  }
}

/* ───────── YouTube helpers ───────── */

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.trim().match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function getYouTubeThumbnail(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function getYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}`;
}

/* ───────── main component ───────── */

export default function BannerManagement() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [videoMode, setVideoMode] = useState<'url' | 'file'>('file');
  const [videoUploadProgress, setVideoUploadProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ action: 'new' | 'replace'; bannerId?: string; type: 'hero' | 'ad'; adSlot?: number }>({ action: 'new', type: 'hero' });

  const load = useCallback(async () => {
    setLoading(true);
    const { banners: data, error: err } = await getAllBanners();
    if (err) setError(err);
    else setBanners(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); }
  }, [success]);

  const triggerUpload = (action: 'new' | 'replace', type: 'hero' | 'ad', bannerId?: string, adSlot?: number) => {
    uploadTarget.current = { action, type, bannerId, adSlot };
    fileRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const { action, type, bannerId, adSlot } = uploadTarget.current;
    const targetId = action === 'replace' ? bannerId! : `new-${type}${adSlot ? `-${adSlot}` : ''}`;
    setUploading(targetId);
    setError(null);

    try {
      const uploaded = await uploadBannerImage(file, type);

      try {
        if (action === 'replace' && bannerId) {
          // Fetch old banner to clean up its storage file
          const oldBanner = banners.find((b) => b.id === bannerId);
          const { error: err } = await updateBanner(bannerId, { image_url: uploaded.publicUrl });
          if (err) throw new Error(err);
          if (oldBanner) removeStorageFile(oldBanner.image_url);
          setSuccess('Banner image replaced');
        } else {
          // Re-fetch latest banners to avoid stale closure
          const { banners: latest } = await getAllBanners();
          const sameType = latest.filter((b) => b.banner_type === type && (type !== 'ad' || b.ad_slot === adSlot));
          if (type === 'ad' && sameType.length >= 5) {
            throw new Error(`Ad Banner ${adSlot} already has 5 banners (maximum).`);
          }
          const { error: err } = await createBanner({
            title: `${type === 'hero' ? 'Hero' : `Ad Slot ${adSlot}`} Banner ${sameType.length + 1}`,
            image_url: uploaded.publicUrl,
            is_active: true,
            position: sameType.length,
            banner_type: type,
            ...(type === 'ad' && adSlot ? { ad_slot: adSlot } : {}),
          });
          if (err) throw new Error(err);
          setSuccess(`${type === 'hero' ? 'Hero' : `Ad Banner ${adSlot}`} banner added`);
        }
      } catch (dbErr) {
        // DB failed — remove the already-uploaded file to avoid orphans
        await supabase.storage.from(uploaded.bucket).remove([uploaded.path]);
        throw dbErr;
      }
      load();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (id: string) => {
    const banner = banners.find((b) => b.id === id);
    const { error: err } = await deleteBanner(id);
    if (err) setError(err);
    else {
      // Clean up storage file
      if (banner) removeStorageFile(banner.image_url);
      setSuccess('Banner deleted'); setDeleteConfirm(null); load();
    }
  };

  /* ── Video Ad handlers ── */
  const openVideoDialog = (bannerId?: string) => {
    if (bannerId) {
      const b = banners.find((x) => x.id === bannerId);
      setVideoUrlInput(b?.video_url || '');
      setEditingVideoId(bannerId);
    } else {
      setVideoUrlInput('');
      setEditingVideoId(null);
    }
    setShowVideoDialog(true);
  };

  const handleSaveVideo = async () => {
    const videoId = extractYouTubeId(videoUrlInput);
    if (!videoId) { setError('Invalid YouTube URL. Paste a valid YouTube link or video ID.'); return; }

    const embedUrl = getYouTubeEmbedUrl(videoId);
    const thumbnail = getYouTubeThumbnail(videoId);
    setUploading(editingVideoId || 'new-video');
    setError(null);

    try {
      if (editingVideoId) {
        const { error: err } = await updateBanner(editingVideoId, { video_url: embedUrl, image_url: thumbnail });
        if (err) throw new Error(err);
        setSuccess('Video ad updated');
      } else {
        const videoAds = banners.filter((b) => b.banner_type === 'video');
        const { error: err } = await createBanner({
          title: `Video Ad ${videoAds.length + 1}`,
          image_url: thumbnail,
          video_url: embedUrl,
          is_active: true,
          position: videoAds.length,
          banner_type: 'video',
        });
        if (err) throw new Error(err);
        setSuccess('Video ad added');
      }
      setShowVideoDialog(false);
      setVideoUrlInput('');
      setEditingVideoId(null);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to save video ad');
    } finally {
      setUploading(null);
    }
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading('new-video');
    setVideoUploadProgress('Uploading video...');
    setError(null);
    try {
      const uploaded = await uploadVideoFile(file);
      const videoAds = banners.filter((b) => b.banner_type === 'video');
      const { error: err } = await createBanner({
        title: `Video Ad ${videoAds.length + 1}`,
        image_url: uploaded.publicUrl,
        video_url: uploaded.publicUrl,
        is_active: true,
        position: videoAds.length,
        banner_type: 'video',
      });
      if (err) {
        await supabase.storage.from(uploaded.bucket).remove([uploaded.path]);
        throw new Error(err);
      }
      setSuccess('Video ad uploaded');
      setShowVideoDialog(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(null);
      setVideoUploadProgress(null);
    }
  };

  const toggleActive = async (b: Banner) => {
    const { error: err } = await updateBanner(b.id, { is_active: !b.is_active });
    if (err) setError(err);
    else load();
  };

  const movePosition = async (b: Banner, direction: 'up' | 'down') => {
    const sameType = banners.filter((x) => x.banner_type === b.banner_type && (b.banner_type !== 'ad' || x.ad_slot === b.ad_slot));
    const idx = sameType.findIndex((x) => x.id === b.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameType.length) return;
    const other = sameType[swapIdx];
    await Promise.all([
      updateBanner(b.id, { position: other.position }),
      updateBanner(other.id, { position: b.position }),
    ]);
    load();
  };

  if (loading) {
    return (
      <div className="space-y-8" role="status" aria-live="polite">
        <span className="sr-only">Loading banners…</span>
        <ListSkeleton rows={5} withThumb />
      </div>
    );
  }

  const heroBanners = banners.filter((b) => b.banner_type === 'hero');
  const adSlot1 = banners.filter((b) => b.banner_type === 'ad' && b.ad_slot === 1);
  const adSlot2 = banners.filter((b) => b.banner_type === 'ad' && b.ad_slot === 2);
  const adSlot3 = banners.filter((b) => b.banner_type === 'ad' && b.ad_slot === 3);
  const videoBanners = banners.filter((b) => b.banner_type === 'video');

  return (
    <div className="space-y-8">
      <input type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
      <input type="file" ref={videoFileRef} accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleVideoFileChange} />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Banner Management</h1>
        <p className="text-sm text-gray-500 mt-1">Upload, replace, reorder, or delete homepage banners. Recommended size: <strong>1920 × 250 px</strong></p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-4">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>
      )}

      {/* ── Hero Carousel Banners ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Hero Carousel Banners (Top Slider)</h2>
          <button
            onClick={() => triggerUpload('new', 'hero')}
            disabled={uploading === 'new-hero'}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium disabled:opacity-50"
          >
            {uploading === 'new-hero' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add Banner
          </button>
        </div>

        {heroBanners.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-10 text-center">
            <Upload size={32} className="mx-auto mb-2 text-gray-400" />
            <p className="text-gray-500 text-sm">No hero banners. Click "Add Banner" to upload.</p>
            <p className="text-gray-400 text-xs mt-1">Recommended: 1920 × 250 px (wide banner)</p>
          </div>
        ) : (
          <div className="space-y-3">
            {heroBanners.map((b, idx) => (
              <BannerRow
                key={b.id}
                banner={b}
                index={idx}
                total={heroBanners.length}
                uploading={uploading === b.id}
                onReplace={() => triggerUpload('replace', 'hero', b.id)}
                onDelete={() => setDeleteConfirm(b.id)}
                onToggle={() => toggleActive(b)}
                onMoveUp={() => movePosition(b, 'up')}
                onMoveDown={() => movePosition(b, 'down')}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Ad Banners — 3 Slots (Between Product Sections) ── */}
      {([
        { slot: 1, label: 'Ad Banners 1 (After Featured Products)', items: adSlot1 },
        { slot: 2, label: 'Ad Banners 2 (After Hot Deals)', items: adSlot2 },
        { slot: 3, label: 'Ad Banners 3 (After Trending)', items: adSlot3 },
      ] as const).map(({ slot, label, items }) => (
        <section key={slot}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{label}</h2>
              <p className="text-xs text-gray-500 mt-0.5">Max 5 banners. Auto-rotates every 7 seconds on homepage.</p>
            </div>
            <button
              onClick={() => triggerUpload('new', 'ad', undefined, slot)}
              disabled={!!uploading || items.length >= 5}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium disabled:opacity-50"
            >
              {uploading === `new-ad-${slot}` ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Banner {items.length >= 5 ? '(Full)' : `(${items.length}/5)`}
            </button>
          </div>

          {items.length === 0 ? (
            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
              <Upload size={28} className="mx-auto mb-2 text-gray-400" />
              <p className="text-gray-500 text-sm">No banners in slot {slot}. Click "Add Banner" to upload.</p>
              <p className="text-gray-400 text-xs mt-1">Recommended: 1920 × 250 px (wide banner)</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((b, idx) => (
                <BannerRow
                  key={b.id}
                  banner={b}
                  index={idx}
                  total={items.length}
                  uploading={uploading === b.id}
                  onReplace={() => triggerUpload('replace', 'ad', b.id, slot)}
                  onDelete={() => setDeleteConfirm(b.id)}
                  onToggle={() => toggleActive(b)}
                  onMoveUp={() => movePosition(b, 'up')}
                  onMoveDown={() => movePosition(b, 'down')}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {/* ── Video Ads (Above Header — YouTube) ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Video Ads (Above Header — YouTube)</h2>
            <p className="text-xs text-gray-500 mt-0.5">Displayed above the header on homepage. Recommended: 1920 × 1080 (16:9 YouTube video).</p>
          </div>
          <button
            onClick={() => openVideoDialog()}
            disabled={!!uploading}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium disabled:opacity-50"
          >
            {uploading === 'new-video' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add Video Ad
          </button>
        </div>

        {videoBanners.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-10 text-center">
            <Video size={32} className="mx-auto mb-2 text-gray-400" />
            <p className="text-gray-500 text-sm">No video ads. Click "Add Video Ad" to paste a YouTube URL.</p>
            <p className="text-gray-400 text-xs mt-1">Supports YouTube links, embed URLs, and video IDs</p>
          </div>
        ) : (
          <div className="space-y-3">
            {videoBanners.map((b, idx) => (
              <div key={b.id} className={`bg-white rounded-xl border overflow-hidden shadow-sm ${!b.is_active ? 'opacity-50' : ''}`}>
                {/* 16:9 aspect ratio preview */}
                <div className="relative bg-black" style={{ aspectRatio: '16/9', maxHeight: 280 }}>
                  {b.video_url ? (
                    /\.(mp4|webm|mov|mpeg|avi)(\?|$)/i.test(b.video_url) ? (
                      <video
                        key={b.video_url}
                        src={b.video_url}
                        className="w-full h-full object-contain"
                        controls
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <iframe
                        src={b.video_url}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={b.title}
                      />
                    )
                  ) : (
                    <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
                  )}
                  {!b.is_active && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="bg-red-600 text-white text-xs px-3 py-1 rounded-full font-medium">HIDDEN</span>
                    </div>
                  )}
                  {uploading === b.id && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="animate-spin h-8 w-8 text-white" />
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 px-3 py-2 border-t bg-gray-50 flex-wrap">
                  <span className="text-xs text-gray-500 font-medium mr-auto truncate max-w-[200px]" title={b.video_url || ''}>
                    #{idx + 1} — {b.video_url ? (/\.(mp4|webm|mov|mpeg|avi)(\?|$)/i.test(b.video_url) ? 'Uploaded video' : 'YouTube embed') : 'No URL'}
                  </span>

                  <button onClick={() => movePosition(b, 'up')} disabled={idx === 0} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30" title="Move up">
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => movePosition(b, 'down')} disabled={idx === videoBanners.length - 1} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30" title="Move down">
                    <ArrowDown size={14} />
                  </button>

                  <div className="w-px h-5 bg-gray-300 mx-1" />

                  <button onClick={() => openVideoDialog(b.id)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-100">
                    <RefreshCw size={12} /> Change URL
                  </button>
                  <button onClick={() => toggleActive(b)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-100">
                    {b.is_active ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}
                  </button>
                  <button onClick={() => setDeleteConfirm(b.id)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Video Dialog — Upload File OR YouTube URL */}
      {showVideoDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{editingVideoId ? 'Change Video' : 'Add Video Ad'}</h3>
              <button onClick={() => { setShowVideoDialog(false); setVideoUrlInput(''); setEditingVideoId(null); setVideoMode('file'); }} className="p-1 rounded hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {/* Mode tabs — only shown when adding new (not editing existing YouTube) */}
            {!editingVideoId && (
              <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4 text-sm font-medium">
                <button
                  onClick={() => setVideoMode('file')}
                  className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${videoMode === 'file' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  <Upload size={14} /> Upload Video File
                </button>
                <button
                  onClick={() => setVideoMode('url')}
                  className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${videoMode === 'url' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  <LinkIcon size={14} /> YouTube URL
                </button>
              </div>
            )}

            {/* ── Upload file tab ── */}
            {videoMode === 'file' && !editingVideoId && (
              <div>
                <button
                  onClick={() => videoFileRef.current?.click()}
                  disabled={!!uploading}
                  className="w-full border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center gap-3 hover:border-amber-400 hover:bg-amber-50 transition-colors disabled:opacity-50"
                >
                  {uploading === 'new-video' ? (
                    <>
                      <Loader2 size={32} className="text-amber-500 animate-spin" />
                      <span className="text-sm text-gray-600">{videoUploadProgress || 'Uploading...'}</span>
                    </>
                  ) : (
                    <>
                      <Upload size={32} className="text-gray-400" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-700">Click to select a video file</p>
                        <p className="text-xs text-gray-400 mt-1">MP4, WebM, or MOV — max 500 MB</p>
                      </div>
                    </>
                  )}
                </button>
                <div className="flex justify-end mt-4">
                  <button onClick={() => { setShowVideoDialog(false); setVideoMode('file'); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                </div>
              </div>
            )}

            {/* ── YouTube URL tab ── */}
            {(videoMode === 'url' || editingVideoId) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">YouTube Video URL</label>
                <div className="relative">
                  <LinkIcon size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    value={videoUrlInput}
                    onChange={(e) => setVideoUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Paste any YouTube link, embed URL, short URL (youtu.be/...), or just the video ID.</p>

                {extractYouTubeId(videoUrlInput) && (
                  <div className="mt-4 rounded-lg overflow-hidden border bg-black" style={{ aspectRatio: '16/9' }}>
                    <iframe
                      src={getYouTubeEmbedUrl(extractYouTubeId(videoUrlInput)!)}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title="Preview"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-5">
                  <button onClick={() => { setShowVideoDialog(false); setVideoUrlInput(''); setEditingVideoId(null); setVideoMode('file'); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                  <button
                    onClick={handleSaveVideo}
                    disabled={!videoUrlInput.trim() || !!uploading}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
                    {editingVideoId ? 'Update Video' : 'Add Video Ad'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Banner?</h3>
            <p className="text-sm text-gray-600 mb-4">This banner will be removed from the homepage.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Banner Row ───────── */

function BannerRow({
  banner: b,
  index,
  total,
  uploading,
  onReplace,
  onDelete,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  banner: Banner;
  index: number;
  total: number;
  uploading: boolean;
  onReplace: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-sm ${!b.is_active ? 'opacity-50' : ''}`}>
      {/* Banner preview — same aspect ratio as homepage */}
      <div className="relative" style={{ aspectRatio: '1920/250' }}>
        <img
          src={b.image_url}
          alt={b.title}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.src = '/images/logo/bzead-logo.png'; }}
        />
        {!b.is_active && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-red-600 text-white text-xs px-3 py-1 rounded-full font-medium">HIDDEN</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="animate-spin h-8 w-8 text-white" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-t bg-gray-50">
        <span className="text-xs text-gray-500 font-medium mr-auto">#{index + 1}</span>

        <button onClick={onMoveUp} disabled={index === 0} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30" title="Move up">
          <ArrowUp size={14} />
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30" title="Move down">
          <ArrowDown size={14} />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <button onClick={onReplace} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-100">
          <RefreshCw size={12} /> Replace
        </button>
        <button onClick={onToggle} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-100">
          {b.is_active ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Show</>}
        </button>
        <button onClick={onDelete} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </div>
  );
}
