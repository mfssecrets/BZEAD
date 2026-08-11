import React, { useState, useRef, useEffect } from 'react';
import { logger } from '../../utils/logger';
import { 
  ArrowLeft, CheckCircle2, X, Loader2, Image, 
  FileStack, CreditCard, Landmark, Upload
} from 'lucide-react';
import {
  getKYCRequirementsByCountry,
  uploadVerificationDocument,
  finalizeVerificationSubmission,
} from '../../lib/kycService';

interface SellerVerifyUploadsProps {
  onBack: () => void;
  onComplete: () => void;
  sellerCountry?: string;
  sellerRegistrationType?: string;
  sellerId: string;
}

interface UploadItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  progress: number;
  status: 'idle' | 'uploading' | 'completed';
  fileName: string | null;
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 
  'application/pdf', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const MAX_SIZE_MB = 10;

const SellerVerifyUploads: React.FC<SellerVerifyUploadsProps> = ({ 
  onBack, 
  onComplete,
  sellerCountry = 'India',
  sellerId,
}) => {
  // Map of docId -> uploaded file reference (kept until final submit)
  const uploadedFiles = useRef<Record<string, File>>({});
  const uploadedUrls = useRef<Record<string, string>>({});
  const [uploads, setUploads] = useState<UploadItem[]>([
    { id: 'seller-img', label: 'Seller Image', icon: <Image size={24} />, progress: 0, status: 'idle', fileName: null },
    { id: 'addr-f', label: 'Seller Address Proof – Front Side', icon: <FileStack size={24} />, progress: 0, status: 'idle', fileName: null },
    { id: 'addr-b', label: 'Seller Address Proof – Back Side', icon: <FileStack size={24} />, progress: 0, status: 'idle', fileName: null },
    { id: 'biz-addr-f', label: 'Business Address Proof – Front Side', icon: <Landmark size={24} />, progress: 0, status: 'idle', fileName: null },
    { id: 'biz-addr-b', label: 'Business Address Proof – Back Side', icon: <Landmark size={24} />, progress: 0, status: 'idle', fileName: null },
    { id: 'tax-id', label: 'Tax ID Proof (Personal Or Business)', icon: <CreditCard size={24} />, progress: 0, status: 'idle', fileName: null },
    { id: 'bank-stmt', label: 'Bank Statement Or Cancelled Cheque', icon: <Landmark size={24} />, progress: 0, status: 'idle', fileName: null }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadId = useRef<string | null>(null);

  // Fetch KYC requirements for seller's country
  useEffect(() => {
    const fetchKYCRequirements = async () => {
      try {
        await getKYCRequirementsByCountry(sellerCountry);
        // In the future, dynamically generate upload fields based on requirements
      } catch (error) {
        logger.error(error as Error, { context: 'Failed to fetch KYC requirements' });
      }
    };
    
    fetchKYCRequirements();
  }, [sellerCountry]);

  const handleTriggerUpload = (id: string) => {
    activeUploadId.current = id;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = activeUploadId.current;
    if (!file || !id) return;

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMessage('Invalid file type. Only JPEG, PNG, DOC, and PDF are accepted.');
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`);
      return;
    }

    setErrorMessage(null);
    handleRealUpload(id, file);
  };

  const handleRealUpload = async (id: string, file: File) => {
    // Keep a reference to the file for final submission
    uploadedFiles.current[id] = file;

    setUploads(prev => prev.map(u => {
      if (u.id === id) return { ...u, status: 'uploading', progress: 0, fileName: file.name };
      return u;
    }));

    const result = await uploadVerificationDocument(
      sellerId,
      id,
      file,
      (progress) => {
        setUploads(prev => prev.map(u => {
          if (u.id === id) return { ...u, progress };
          return u;
        }));
      }
    );

    if (result.success) {
      uploadedUrls.current[id] = result.url || '';
      setUploads(prev => prev.map(u => {
        if (u.id === id) return { ...u, status: 'completed', progress: 100 };
        return u;
      }));
    } else {
      setErrorMessage(`Upload failed for document: ${result.error}`);
      setUploads(prev => prev.map(u => {
        if (u.id === id) return { ...u, status: 'idle', progress: 0, fileName: null };
        return u;
      }));
    }
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await finalizeVerificationSubmission(sellerId, uploadedUrls.current);

      if (result.success) {
        const vId = `BZ-VRF-${Math.floor(100000 + Math.random() * 900000)}`;
        setSubmissionId(vId);

        // Redirect after 2 seconds
        setTimeout(() => {
          onComplete();
        }, 2000);
      } else {
        setErrorMessage(`Submission failed: ${result.error}`);
      }
    } catch (error) {
      logger.error(error as Error, { context: 'handleFinalSubmit' });
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAllCompleted = uploads.every(u => u.status === 'completed');

  if (submissionId) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-6 z-[10002] text-gray-900 font-sans text-center">
        <div className="w-24 h-24 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(34,197,94,0.1)]">
          <CheckCircle2 size={56} className="text-green-500 animate-in zoom-in duration-500" />
        </div>
        <h2 className="text-xl font-semibold mb-4">Successfully Submitted</h2>
        <div className="bg-white border border-gray-300 rounded-2xl px-5 py-3 mb-8">
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Seller Verification ID</p>
          <p className="text-xl font-mono text-green-600 font-bold">{submissionId}</p>
        </div>
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="animate-spin" size={18} />
          <p className="text-sm font-medium">Redirecting To Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans pb-16 sm:pb-24">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-4 sm:pt-12">
        <button 
          onClick={onBack}
          disabled={isSubmitting}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors mb-4 sm:mb-12 group disabled:opacity-30"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-semibold">Back To Details</span>
        </button>

        <header className="mb-4 sm:mb-16">
          <h1 className="text-lg sm:text-4xl font-semibold mb-1 sm:mb-3">Document Upload</h1>
          <p className="text-gray-500 text-xs sm:text-sm font-medium">Upload clear copies of the required documents for verification.</p>
        </header>

        {errorMessage && (
          <div className="mb-4 sm:mb-8 p-3 sm:p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded-xl flex items-center gap-2 sm:gap-3 animate-in slide-in-from-top-2">
            <X size={16} className="shrink-0" />
            {errorMessage}
          </div>
        )}

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".jpg,.jpeg,.png,.doc,.docx,.pdf"
          onChange={handleFileChange}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
          {uploads.map((item) => (
            <div 
              key={item.id}
              className={`bg-white border-2 rounded-3xl p-8 transition-all relative overflow-hidden flex flex-col items-center text-center justify-center min-h-[220px] ${
                item.status === 'completed' ? 'border-green-300' : 
                item.status === 'uploading' ? 'border-yellow-400' : 'border-gray-300 hover:border-gray-400 border-dashed'
              }`}
            >
              {item.status === 'idle' && (
                <>
                  <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-600 mb-4 group-hover:bg-yellow-500/5 transition-colors">{item.icon}</div>
                  <h3 className="text-sm font-semibold mb-2">{item.label}</h3>
                  <p className="text-[10px] text-gray-500 mb-6 uppercase tracking-widest font-bold">JPEG, PNG, DOC Or PDF (Max 10MB)</p>
                  <button 
                    onClick={() => handleTriggerUpload(item.id)}
                    className="bg-white text-black font-bold py-2.5 px-8 rounded-xl text-[10px] hover:bg-yellow-500 transition-colors uppercase tracking-widest"
                  >
                    Select File
                  </button>
                </>
              )}

              {item.status === 'uploading' && (
                <>
                  <Loader2 className="animate-spin text-yellow-500 mb-4" size={24} />
                  <h3 className="text-sm font-semibold mb-2">Uploading Indication...</h3>
                  <div className="w-full max-w-[160px] h-1.5 bg-gray-50 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-yellow-500 transition-all duration-300" style={{ width: `${item.progress}%` }}></div>
                  </div>
                  <span className="text-xs font-bold text-yellow-500">{item.progress}%</span>
                  <p className="text-[10px] text-gray-500 mt-2 truncate max-w-[200px]">{item.fileName}</p>
                </>
              )}

              {item.status === 'completed' && (
                <>
                  <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center text-green-500 mb-4">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">{item.label}</h3>
                  <p className="text-[10px] text-gray-500 mb-3 truncate max-w-[200px] italic">{item.fileName}</p>
                  <span className="text-[10px] font-black uppercase text-green-500 tracking-widest">Upload Completed</span>
                  <button 
                    onClick={() => setUploads(prev => prev.map(u => u.id === item.id ? {...u, status: 'idle', progress: 0, fileName: null} : u))}
                    className="absolute top-4 right-4 text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 bg-white border border-gray-300 rounded-[2.5rem] p-4 sm:p-10 relative overflow-hidden">
          {isSubmitting && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-4">
              <Loader2 className="animate-spin text-yellow-500" size={24} />
              <p className="text-sm font-bold text-gray-900 uppercase tracking-[0.2em]">Synchronizing Storage...</p>
            </div>
          )}
          
          <div className="flex items-center justify-between gap-8 flex-wrap">
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-1">Final Submission</h3>
              <p className="text-gray-500 text-xs font-medium">By submitting, you confirm that all files belong to you and are legally valid copies.</p>
            </div>
            <button 
              disabled={!isAllCompleted || isSubmitting}
              onClick={handleFinalSubmit}
              className={`px-6 sm:px-12 py-3 sm:py-4 rounded-2xl font-bold transition-all shadow-2xl flex items-center gap-3 uppercase text-xs tracking-widest ${
                isAllCompleted 
                  ? 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-yellow-500/20 active:scale-95' 
                  : 'bg-gray-50 text-gray-600 cursor-not-allowed border border-gray-200'
              }`}
            >
              {isSubmitting ? 'Processing' : 'Submit Application'}
              {!isSubmitting && <Upload size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SellerVerifyUploads;
