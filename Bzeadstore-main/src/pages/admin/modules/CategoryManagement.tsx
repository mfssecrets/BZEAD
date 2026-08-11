import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  FolderTree,
  Hash,
  Save,
  X,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Layers,
  Tag,
  Search,
} from 'lucide-react';
import { TableSkeleton } from '../../../components/common/Skeleton';
import {
  fetchAllCategories,
  fetchAllHsnCodes,
  createCategory,
  updateCategory,
  deleteCategory,
  createHsnCode,
  updateHsnCode,
  deleteHsnCode,
  type Category,
  type CategoryHsnCode,
} from '../../../lib/categoryService';

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

type ModalMode = 'add-category' | 'edit-category' | 'add-hsn' | 'edit-hsn' | null;

interface CategoryFormData {
  name: string;
  display_order: number;
  is_active: boolean;
  parent_id: string | null;
  level: number;
}

interface HsnFormData {
  category_slug: string;
  hsn_code: string;
  description: string;
}

/* Surface the REAL Postgres/PostgREST reason instead of a bare 'Save failed'.
   PostgrestError carries code/details/hint that the plain message omits. */
function describeSaveError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    if (parts.length > 0) {
      return e.code ? `${parts.join(' — ')} (${e.code})` : parts.join(' — ');
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Save failed';
}

/* ═══════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════ */

export default function CategoryManagement() {
  /* ── state ─────────────────────────────────────────────────── */
  const [categories, setCategories] = useState<Category[]>([]);
  const [hsnCodes, setHsnCodes] = useState<CategoryHsnCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // tree expand state
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [expandedL2, setExpandedL2] = useState<Set<string>>(new Set());

  // modal
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Category | CategoryHsnCode | null>(null);

  // form data
  const [catForm, setCatForm] = useState<CategoryFormData>({
    name: '',
    display_order: 0,
    is_active: true,
    parent_id: null,
    level: 1,
  });
  const [hsnForm, setHsnForm] = useState<HsnFormData>({
    category_slug: '',
    hsn_code: '',
    description: '',
  });

  // active tab
  const [tab, setTab] = useState<'tree' | 'hsn'>('tree');

  // HSN search
  const [hsnSearch, setHsnSearch] = useState('');

  // HSN cascading category selection
  const [hsnL1Id, setHsnL1Id] = useState<string>('');
  const [hsnL2Id, setHsnL2Id] = useState<string>('');
  const [hsnL3Id, setHsnL3Id] = useState<string>('');

  /* ── data loading ──────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, hsn] = await Promise.all([fetchAllCategories(), fetchAllHsnCodes()]);
      setCategories(cats);
      setHsnCodes(hsn);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-clear success message
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(t);
  }, [successMsg]);

  /* ── derived data ──────────────────────────────────────────── */
  const l1 = categories.filter(c => c.level === 1);
  const l2 = categories.filter(c => c.level === 2);
  const l3 = categories.filter(c => c.level === 3);

  const childrenOf = (parentId: string, list: Category[]) =>
    list.filter(c => c.parent_id === parentId);

  const hsnMap = new Map<string, CategoryHsnCode>();
  hsnCodes.forEach(h => hsnMap.set(h.category_slug, h));

  // Filtered HSN list
  const filteredHsn = hsnSearch.trim()
    ? hsnCodes.filter(h =>
        h.category_slug.toLowerCase().includes(hsnSearch.toLowerCase()) ||
        h.hsn_code.includes(hsnSearch) ||
        (h.description || '').toLowerCase().includes(hsnSearch.toLowerCase())
      )
    : hsnCodes;

  /* ── toggle helpers ────────────────────────────────────────── */
  const toggleL1 = (id: string) => {
    setExpandedL1(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleL2 = (id: string) => {
    setExpandedL2(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedL1(new Set(l1.map(c => c.id)));
    setExpandedL2(new Set(l2.map(c => c.id)));
  };
  const collapseAll = () => {
    setExpandedL1(new Set());
    setExpandedL2(new Set());
  };

  /* ── modal open helpers ────────────────────────────────────── */
  const openAddCategory = (level: number, parentId: string | null) => {
    const siblings = parentId
      ? categories.filter(c => c.parent_id === parentId)
      : categories.filter(c => c.level === 1);
    const nextOrder = siblings.length > 0
      ? Math.max(...siblings.map(s => s.display_order)) + 1
      : 1;
    setCatForm({ name: '', display_order: nextOrder, is_active: true, parent_id: parentId, level });
    setEditTarget(null);
    setModalMode('add-category');
  };

  const openEditCategory = (cat: Category) => {
    setCatForm({
      name: cat.name,
      display_order: cat.display_order,
      is_active: cat.is_active,
      parent_id: cat.parent_id,
      level: cat.level,
    });
    setEditTarget(cat);
    setModalMode('edit-category');
  };

  const openAddHsn = (categorySlug?: string) => {
    setHsnForm({ category_slug: categorySlug ?? '', hsn_code: '', description: '' });
    // Reverse-resolve cascading IDs if a slug was pre-filled
    if (categorySlug) {
      const cat = categories.find(c => c.slug === categorySlug);
      if (cat) {
        if (cat.level === 3) {
          setHsnL3Id(cat.id);
          const p2 = categories.find(c => c.id === cat.parent_id);
          setHsnL2Id(p2?.id ?? '');
          setHsnL1Id(p2?.parent_id ?? '');
        } else if (cat.level === 2) {
          setHsnL3Id('');
          setHsnL2Id(cat.id);
          setHsnL1Id(cat.parent_id ?? '');
        } else {
          setHsnL3Id('');
          setHsnL2Id('');
          setHsnL1Id(cat.id);
        }
      } else {
        setHsnL1Id(''); setHsnL2Id(''); setHsnL3Id('');
      }
    } else {
      setHsnL1Id(''); setHsnL2Id(''); setHsnL3Id('');
    }
    setEditTarget(null);
    setModalMode('add-hsn');
  };

  const openEditHsn = (hsn: CategoryHsnCode) => {
    setHsnForm({
      category_slug: hsn.category_slug,
      hsn_code: hsn.hsn_code,
      description: hsn.description ?? '',
    });
    // Reverse-resolve cascading IDs from the slug
    const cat = categories.find(c => c.slug === hsn.category_slug);
    if (cat) {
      if (cat.level === 3) {
        setHsnL3Id(cat.id);
        const p2 = categories.find(c => c.id === cat.parent_id);
        setHsnL2Id(p2?.id ?? '');
        setHsnL1Id(p2?.parent_id ?? '');
      } else if (cat.level === 2) {
        setHsnL3Id('');
        setHsnL2Id(cat.id);
        setHsnL1Id(cat.parent_id ?? '');
      } else {
        setHsnL3Id('');
        setHsnL2Id('');
        setHsnL1Id(cat.id);
      }
    } else {
      setHsnL1Id(''); setHsnL2Id(''); setHsnL3Id('');
    }
    setEditTarget(hsn);
    setModalMode('edit-hsn');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditTarget(null);
  };

  /* ── save handlers ─────────────────────────────────────────── */
  const handleSaveCategory = async () => {
    if (!catForm.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      if (modalMode === 'add-category') {
        await createCategory({
          name: catForm.name.trim(),
          parent_id: catForm.parent_id,
          level: catForm.level,
          display_order: catForm.display_order,
          is_active: catForm.is_active,
        });
        setSuccessMsg(`${levelLabel(catForm.level)} "${catForm.name.trim()}" created`);
      } else if (modalMode === 'edit-category' && editTarget) {
        await updateCategory((editTarget as Category).id, {
          name: catForm.name.trim(),
          display_order: catForm.display_order,
          is_active: catForm.is_active,
        });
        setSuccessMsg(`${levelLabel(catForm.level)} updated`);
      }
      closeModal();
      await loadData();
    } catch (err: unknown) {
      setError(describeSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHsn = async () => {
    // Derive category_slug from the deepest selected level
    let resolvedSlug = '';
    if (modalMode === 'add-hsn') {
      const deepestId = hsnL3Id || hsnL2Id || hsnL1Id;
      if (!deepestId) { setError('Please select at least a Category'); return; }
      const cat = categories.find(c => c.id === deepestId);
      if (!cat) { setError('Selected category not found'); return; }
      resolvedSlug = cat.slug;
    } else {
      resolvedSlug = hsnForm.category_slug;
    }

    if (!hsnForm.hsn_code.trim()) { setError('HSN code is required'); return; }
    const trimmedCode = hsnForm.hsn_code.trim();
    if (!/^\d{8}$/.test(trimmedCode)) { setError('HSN code must be exactly 8 digits'); return; }
    if (!hsnForm.description.trim()) { setError('Description is required'); return; }

    // Duplicate check for add mode
    if (modalMode === 'add-hsn' && hsnCodes.some(h => h.category_slug === resolvedSlug)) {
      setError(`HSN code already exists for "${resolvedSlug}"`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (modalMode === 'add-hsn') {
        await createHsnCode({
          category_slug: resolvedSlug,
          hsn_code: trimmedCode,
          description: hsnForm.description.trim(),
        });
        setSuccessMsg(`HSN code "${trimmedCode}" added`);
      } else if (modalMode === 'edit-hsn' && editTarget) {
        await updateHsnCode((editTarget as CategoryHsnCode).id, {
          hsn_code: trimmedCode,
          description: hsnForm.description.trim(),
        });
        setSuccessMsg('HSN code updated');
      }
      closeModal();
      await loadData();
    } catch (err: unknown) {
      setError(describeSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  /* ── delete handlers ───────────────────────────────────────── */
  const handleDeleteCategory = async (cat: Category) => {
    const children = categories.filter(c => c.parent_id === cat.id);
    const label = levelLabel(cat.level);
    const warn = children.length > 0
      ? `This ${label} has ${children.length} child item(s). Deleting will remove ALL children and their HSN codes. Continue?`
      : `Delete ${label} "${cat.name}"?`;
    if (!window.confirm(warn)) return;
    setError(null);
    try {
      await deleteCategory(cat.id);
      setSuccessMsg(`${label} "${cat.name}" deleted`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleDeleteHsn = async (hsn: CategoryHsnCode) => {
    if (!window.confirm(`Delete HSN code "${hsn.hsn_code}" for "${hsn.category_slug}"?`)) return;
    setError(null);
    try {
      await deleteHsnCode(hsn.id);
      setSuccessMsg(`HSN code deleted`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  /* ── helpers ───────────────────────────────────────────────── */
  const levelLabel = (level: number) =>
    level === 1 ? 'Category' : level === 2 ? 'Subcategory' : 'Product Type';

  const getParentBreadcrumb = (parentId: string | null): string => {
    if (!parentId) return '';
    const parent = categories.find(c => c.id === parentId);
    if (!parent) return '';
    if (parent.parent_id) {
      const grandparent = categories.find(c => c.id === parent.parent_id);
      return `${grandparent?.name ?? '?'} → ${parent.name}`;
    }
    return parent.name;
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6" role="status" aria-live="polite">
        <span className="sr-only">Loading categories…</span>
        <TableSkeleton rows={8} columns={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FolderTree className="w-6 h-6 sm:w-7 sm:h-7 text-amber-600" />
          Category Management
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          {l1.length} Categories · {l2.length} Subcategories · {l3.length} Product Types · {hsnCodes.length} HSN Codes
        </p>
      </div>

      {/* ── success banner ─────────────────────────────────── */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-green-700 text-sm flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── error banner ───────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── tabs ───────────────────────────────────────────── */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4 sm:gap-6">
          <button
            onClick={() => setTab('tree')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === 'tree' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            Category Tree
          </button>
          <button
            onClick={() => setTab('hsn')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === 'hsn' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Hash className="w-4 h-4" />
            HSN Codes
          </button>
        </nav>
      </div>

      {/* ══════════════════════════════════════════════════════
         TAB: CATEGORY TREE
         ══════════════════════════════════════════════════════ */}
      {tab === 'tree' && (
        <>
          {/* Action bar */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openAddCategory(1, null)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
            >
              <Plus className="w-4 h-4" /> Add Category
            </button>
            <button
              onClick={expandAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ChevronDown className="w-4 h-4" /> Expand All
            </button>
            <button
              onClick={collapseAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ChevronRight className="w-4 h-4" /> Collapse
            </button>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 ml-auto"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Tree */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {l1.length === 0 && (
              <p className="px-6 py-10 text-center text-gray-400">No categories found. Click "Add Category" to create one.</p>
            )}
            {l1.map(cat1 => {
              const isExpL1 = expandedL1.has(cat1.id);
              const subs = childrenOf(cat1.id, l2);
              const hsn1 = hsnMap.get(cat1.slug);

              return (
                <div key={cat1.id} className="border-b border-gray-100 last:border-b-0">
                  {/* ─── L1 CATEGORY ROW ─── */}
                  <div className="px-3 sm:px-4 py-3 bg-gray-50/50">
                    {/* Top line: expand + name + badges */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleL1(cat1.id)} className="p-1 rounded-lg hover:bg-gray-200 shrink-0">
                        {isExpL1 ? <ChevronDown className="w-5 h-5 text-gray-600" /> : <ChevronRight className="w-5 h-5 text-gray-600" />}
                      </button>
                      <Layers className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className={`font-semibold text-gray-900 text-sm sm:text-base ${!cat1.is_active ? 'line-through opacity-50' : ''}`}>
                        {cat1.name}
                      </span>
                    </div>
                    {/* Bottom line: badges + action buttons — ALWAYS VISIBLE */}
                    <div className="flex items-center gap-1.5 mt-2 pl-8 sm:pl-9 flex-wrap">
                      {hsn1 && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">{hsn1.hsn_code}</span>}
                      <span className="text-xs text-gray-400">{subs.length} sub</span>
                      <span className="flex-1" />
                      <button
                        onClick={() => openAddCategory(2, cat1.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 border border-green-200"
                      >
                        <Plus className="w-3 h-3" /> Sub
                      </button>
                      <button
                        onClick={() => openEditCategory(cat1)}
                        className="p-1 rounded hover:bg-blue-50 text-blue-600"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat1)}
                        className="p-1 rounded hover:bg-red-50 text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* ─── L2 SUBCATEGORY CHILDREN ─── */}
                  {isExpL1 && (
                    <div className="border-t border-gray-100">
                      {subs.length === 0 && (
                        <div className="pl-10 sm:pl-14 pr-4 py-3 text-sm text-gray-400 italic">
                          No subcategories.{' '}
                          <button
                            onClick={() => openAddCategory(2, cat1.id)}
                            className="text-amber-600 font-medium hover:underline"
                          >
                            + Add Subcategory
                          </button>
                        </div>
                      )}
                      {subs.map(cat2 => {
                        const isExpL2 = expandedL2.has(cat2.id);
                        const types = childrenOf(cat2.id, l3);
                        const hsn2 = hsnMap.get(cat2.slug);

                        return (
                          <div key={cat2.id} className="border-t border-gray-50">
                            {/* L2 row */}
                            <div className="pl-8 sm:pl-12 pr-3 sm:pr-4 py-2.5">
                              {/* Top: expand + name */}
                              <div className="flex items-center gap-2">
                                <button onClick={() => toggleL2(cat2.id)} className="p-1 rounded hover:bg-gray-200 shrink-0">
                                  {isExpL2 ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                </button>
                                <FolderTree className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className={`font-medium text-gray-700 text-sm ${!cat2.is_active ? 'line-through opacity-50' : ''}`}>
                                  {cat2.name}
                                </span>
                              </div>
                              {/* Bottom: badges + actions — ALWAYS VISIBLE */}
                              <div className="flex items-center gap-1.5 mt-1.5 pl-7 flex-wrap">
                                {hsn2 && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">{hsn2.hsn_code}</span>}
                                <span className="text-xs text-gray-400">{types.length} types</span>
                                <span className="flex-1" />
                                <button
                                  onClick={() => openAddCategory(3, cat2.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded hover:bg-purple-100 border border-purple-200"
                                >
                                  <Plus className="w-3 h-3" /> Type
                                </button>
                                <button
                                  onClick={() => openEditCategory(cat2)}
                                  className="p-1 rounded hover:bg-blue-50 text-blue-600"
                                  title="Edit"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(cat2)}
                                  className="p-1 rounded hover:bg-red-50 text-red-500"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* ─── L3 PRODUCT TYPE CHILDREN ─── */}
                            {isExpL2 && (
                              <div className="border-t border-gray-50">
                                {types.length === 0 && (
                                  <div className="pl-16 sm:pl-24 pr-4 py-2.5 text-sm text-gray-400 italic">
                                    No product types.{' '}
                                    <button
                                      onClick={() => openAddCategory(3, cat2.id)}
                                      className="text-purple-600 font-medium hover:underline"
                                    >
                                      + Add Product Type
                                    </button>
                                  </div>
                                )}
                                {types.map(cat3 => {
                                  const hsn3 = hsnMap.get(cat3.slug);
                                  return (
                                    <div
                                      key={cat3.id}
                                      className="pl-14 sm:pl-20 pr-3 sm:pr-4 py-2 border-t border-gray-50"
                                    >
                                      {/* Name row */}
                                      <div className="flex items-center gap-2">
                                        <Tag className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                        <span className={`text-sm text-gray-600 ${!cat3.is_active ? 'line-through opacity-50' : ''}`}>
                                          {cat3.name}
                                        </span>
                                      </div>
                                      {/* Badges + actions — ALWAYS VISIBLE */}
                                      <div className="flex items-center gap-1.5 mt-1 pl-6 flex-wrap">
                                        {hsn3 && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">{hsn3.hsn_code}</span>}
                                        <span className="flex-1" />
                                        <button
                                          onClick={() => openEditCategory(cat3)}
                                          className="p-1 rounded hover:bg-blue-50 text-blue-600"
                                          title="Edit"
                                        >
                                          <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteCategory(cat3)}
                                          className="p-1 rounded hover:bg-red-50 text-red-500"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
         TAB: HSN CODES
         ══════════════════════════════════════════════════════ */}
      {tab === 'hsn' && (
        <>
          {/* Action bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => openAddHsn()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
            >
              <Plus className="w-4 h-4" /> Add HSN Code
            </button>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search slug, code, description…"
                value={hsnSearch}
                onChange={e => setHsnSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 sm:ml-auto"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* HSN Cards */}
          <div className="space-y-2">
            {filteredHsn.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center text-gray-400">
                {hsnSearch ? 'No HSN codes match your search.' : 'No HSN codes found.'}
              </div>
            )}
            {filteredHsn.map(hsn => (
              <div key={hsn.id} className="bg-white rounded-lg border border-gray-200 px-3 sm:px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-gray-700 break-all">{hsn.category_slug}</span>
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono text-xs font-semibold shrink-0">{hsn.hsn_code}</span>
                    </div>
                    {hsn.description && (
                      <p className="text-xs text-gray-500 mt-1">{hsn.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditHsn(hsn)}
                      className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteHsn(hsn)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
         MODAL: ADD / EDIT CATEGORY
         ══════════════════════════════════════════════════════ */}
      {(modalMode === 'add-category' || modalMode === 'edit-category') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {modalMode === 'add-category' ? `Add ${levelLabel(catForm.level)}` : `Edit ${levelLabel(catForm.level)}`}
              </h2>
              <button onClick={closeModal} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            {/* Level badge */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                catForm.level === 1 ? 'bg-amber-50 text-amber-700' :
                catForm.level === 2 ? 'bg-blue-50 text-blue-700' :
                'bg-purple-50 text-purple-700'
              }`}>
                Level {catForm.level} — {levelLabel(catForm.level)}
              </span>
            </div>

            {/* Parent breadcrumb */}
            {catForm.parent_id && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Under: <span className="font-medium text-gray-700">{getParentBreadcrumb(catForm.parent_id)}</span>
              </div>
            )}

            {/* name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={catForm.name}
                onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                placeholder={`Enter ${levelLabel(catForm.level).toLowerCase()} name`}
                autoFocus
              />
            </div>

            {/* display order */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Order <span className="text-red-500">*</span></label>
              <input
                type="number"
                value={catForm.display_order}
                onChange={e => setCatForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                min={0}
              />
            </div>

            {/* active toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCatForm(f => ({ ...f, is_active: !f.is_active }))}
                className="flex items-center gap-2"
              >
                {catForm.is_active
                  ? <ToggleRight className="w-8 h-8 text-green-600" />
                  : <ToggleLeft className="w-8 h-8 text-gray-400" />}
                <span className="text-sm text-gray-700">{catForm.is_active ? 'Active' : 'Inactive'}</span>
              </button>
            </div>

            {/* actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSaveCategory}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {modalMode === 'add-category' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
         MODAL: ADD / EDIT HSN CODE
         ══════════════════════════════════════════════════════ */}
      {(modalMode === 'add-hsn' || modalMode === 'edit-hsn') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {modalMode === 'add-hsn' ? 'Add HSN Code' : 'Edit HSN Code'}
              </h2>
              <button onClick={closeModal} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            {/* category — cascading L1 → L2 → L3 */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Category <span className="text-red-500">*</span></label>
              {modalMode === 'add-hsn' ? (
                <>
                  {/* L1: Category */}
                  <select
                    value={hsnL1Id}
                    onChange={e => { setHsnL1Id(e.target.value); setHsnL2Id(''); setHsnL3Id(''); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  >
                    <option value="">— Select Category —</option>
                    {l1.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}{hsnMap.has(c.slug) ? ` ✓ HSN: ${hsnMap.get(c.slug)!.hsn_code}` : ''}
                      </option>
                    ))}
                  </select>

                  {/* L2: Subcategory — only if L1 is selected and has children */}
                  {hsnL1Id && l2.filter(c => c.parent_id === hsnL1Id).length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Subcategory <span className="text-gray-400">(optional)</span></label>
                      <select
                        value={hsnL2Id}
                        onChange={e => { setHsnL2Id(e.target.value); setHsnL3Id(''); }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      >
                        <option value="">— Assign at Category level —</option>
                        {l2.filter(c => c.parent_id === hsnL1Id).map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}{hsnMap.has(c.slug) ? ` ✓ HSN: ${hsnMap.get(c.slug)!.hsn_code}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* L3: Product Type — only if L2 is selected and has children */}
                  {hsnL2Id && l3.filter(c => c.parent_id === hsnL2Id).length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Product Type <span className="text-gray-400">(optional)</span></label>
                      <select
                        value={hsnL3Id}
                        onChange={e => setHsnL3Id(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      >
                        <option value="">— Assign at Subcategory level —</option>
                        {l3.filter(c => c.parent_id === hsnL2Id).map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}{hsnMap.has(c.slug) ? ` ✓ HSN: ${hsnMap.get(c.slug)!.hsn_code}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Selected path indicator */}
                  {hsnL1Id && (() => {
                    const deepestId = hsnL3Id || hsnL2Id || hsnL1Id;
                    const deepest = categories.find(c => c.id === deepestId);
                    const path: string[] = [];
                    const c1 = categories.find(c => c.id === hsnL1Id);
                    if (c1) path.push(c1.name);
                    if (hsnL2Id) { const c2 = categories.find(c => c.id === hsnL2Id); if (c2) path.push(c2.name); }
                    if (hsnL3Id) { const c3 = categories.find(c => c.id === hsnL3Id); if (c3) path.push(c3.name); }
                    return deepest ? (
                      <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-700">
                        Assigning to: <span className="font-semibold">{path.join(' → ')}</span>
                        <span className="ml-1 text-amber-500">({deepest.slug})</span>
                      </div>
                    ) : null;
                  })()}
                </>
              ) : (
                <input
                  type="text"
                  value={hsnForm.category_slug}
                  disabled
                  className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-500"
                />
              )}
            </div>

            {/* hsn code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={hsnForm.hsn_code}
                onChange={e => setHsnForm(f => ({ ...f, hsn_code: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                placeholder="e.g. 85171210"
                maxLength={8}
              />
            </div>

            {/* description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={hsnForm.description}
                onChange={e => setHsnForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                placeholder="e.g. Smartphones"
              />
            </div>

            {/* actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSaveHsn}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {modalMode === 'add-hsn' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
