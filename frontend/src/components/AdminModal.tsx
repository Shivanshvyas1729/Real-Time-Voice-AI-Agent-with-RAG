import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Building2,
  Cpu,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Trash2,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import {
  Tenant,
  Equipment,
  getTenants,
  createTenant,
  createEquipment,
  uploadEquipmentDocuments,
} from "../utils/api";

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentList: Equipment[];
  onEquipmentCreated?: (newEquipment: Equipment) => void;
  selectedEquipmentId?: string;
}

type TabType = "tenants" | "equipment" | "documents";

export default function AdminModal({
  isOpen,
  onClose,
  equipmentList,
  onEquipmentCreated,
  selectedEquipmentId,
}: AdminModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("equipment");

  // Tenants state
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantDesc, setTenantDesc] = useState("");
  const [tenantSubmitting, setTenantSubmitting] = useState(false);
  const [tenantMsg, setTenantMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Equipment state
  const [eqName, setEqName] = useState("");
  const [eqDesc, setEqDesc] = useState("");
  const [eqTenantId, setEqTenantId] = useState("");
  const [eqSubmitting, setEqSubmitting] = useState(false);
  const [eqMsg, setEqMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Document state
  const [docEquipmentId, setDocEquipmentId] = useState<string>(selectedEquipmentId || "");
  const [docDescription, setDocDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [docMsg, setDocMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch tenants
  const loadTenants = async () => {
    setLoadingTenants(true);
    try {
      const data = await getTenants();
      setTenants(data);
      if (data.length > 0 && !eqTenantId) {
        setEqTenantId(data[0].tenant_id);
      }
    } catch (err: any) {
      console.error("Failed to load tenants:", err);
    } finally {
      setLoadingTenants(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTenants();
      if (selectedEquipmentId) {
        setDocEquipmentId(selectedEquipmentId);
      } else if (equipmentList.length > 0) {
        setDocEquipmentId(equipmentList[0]._id || "");
      }
      setTenantMsg(null);
      setEqMsg(null);
      setDocMsg(null);
    }
  }, [isOpen, selectedEquipmentId, equipmentList]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !tenantSubmitting && !eqSubmitting && !docSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, tenantSubmitting, eqSubmitting, docSubmitting, onClose]);

  if (!isOpen) return null;

  // --- Handlers ---
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setTenantMsg(null);

    const cleanId = tenantId.trim().toLowerCase();
    const cleanName = tenantName.trim();

    if (!cleanId || !cleanName) {
      setTenantMsg({ type: "error", text: "Tenant Identifier and Name are required." });
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
      setTenantMsg({
        type: "error",
        text: "Tenant Identifier must only contain alphanumeric characters, hyphens, or underscores.",
      });
      return;
    }

    setTenantSubmitting(true);
    try {
      const created = await createTenant({
        tenant_id: cleanId,
        name: cleanName,
        description: tenantDesc.trim(),
      });
      setTenantMsg({
        type: "success",
        text: `Tenant "${created.name}" (${created.tenant_id}) created successfully!`,
      });
      setTenantId("");
      setTenantName("");
      setTenantDesc("");
      loadTenants();
      // Auto set this as selected tenant in equipment tab
      setEqTenantId(created.tenant_id);
    } catch (err: any) {
      const errorDetail = err?.response?.data?.detail || err?.message || "Failed to create tenant";
      setTenantMsg({ type: "error", text: errorDetail });
    } finally {
      setTenantSubmitting(false);
    }
  };

  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setEqMsg(null);

    const name = eqName.trim();
    const desc = eqDesc.trim();
    const tenant = eqTenantId.trim();

    if (!name || !desc) {
      setEqMsg({ type: "error", text: "Equipment name and description are required." });
      return;
    }

    if (!tenant) {
      setEqMsg({ type: "error", text: "Please select or specify a Tenant for this equipment." });
      return;
    }

    setEqSubmitting(true);
    try {
      const newEq = await createEquipment({
        name,
        description: desc,
        tenant_id: tenant,
        is_active: true,
      });

      setEqMsg({
        type: "success",
        text: `Equipment "${newEq.name}" created successfully!`,
      });
      setEqName("");
      setEqDesc("");
      onEquipmentCreated?.(newEq);
      // Auto set target in documents tab
      if (newEq._id) {
        setDocEquipmentId(newEq._id);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        setEqMsg({
          type: "error",
          text: `Equipment with the name "${name}" already exists for tenant "${tenant}".`,
        });
      } else {
        const errorDetail = err?.response?.data?.detail || err?.message || "Failed to create equipment";
        setEqMsg({ type: "error", text: errorDetail });
      }
    } finally {
      setEqSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);

    // Validate supported formats: pdf, docx, txt, md
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    const allowedExtensions = [".pdf", ".docx", ".txt", ".md"];
    filesArray.forEach((file) => {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (allowedExtensions.includes(ext)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      setDocMsg({
        type: "error",
        text: `Unsupported file format(s): ${invalidFiles.join(", ")}. Only .pdf, .docx, .txt, and .md are supported.`,
      });
    } else {
      setDocMsg(null);
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadDocuments = async (e: React.FormEvent) => {
    e.preventDefault();
    setDocMsg(null);

    if (!docEquipmentId) {
      setDocMsg({ type: "error", text: "Please select an equipment to attach documents to." });
      return;
    }

    if (selectedFiles.length === 0) {
      setDocMsg({ type: "error", text: "Please select at least one document to upload." });
      return;
    }

    setDocSubmitting(true);
    try {
      const res = await uploadEquipmentDocuments(docEquipmentId, selectedFiles, docDescription);
      setDocMsg({
        type: "success",
        text: `Successfully ingested and embedded ${res.count} document(s) for RAG!`,
      });
      setSelectedFiles([]);
      setDocDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      const errorDetail = err?.response?.data?.detail || err?.message || "Failed to upload and embed documents";
      setDocMsg({ type: "error", text: errorDetail });
    } finally {
      setDocSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Admin Control Center</h2>
              <p className="text-xs text-slate-400">
                Manage tenants, physical equipment, and knowledge base documents
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={tenantSubmitting || eqSubmitting || docSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-800/40 px-6 pt-2 gap-2">
          <button
            onClick={() => setActiveTab("equipment")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === "equipment"
                ? "border-blue-500 text-blue-400 bg-slate-800/50 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="h-4 w-4" />
            Equipment
          </button>

          <button
            onClick={() => setActiveTab("documents")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === "documents"
                ? "border-blue-500 text-blue-400 bg-slate-800/50 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <UploadCloud className="h-4 w-4" />
            Upload Documents
          </button>

          <button
            onClick={() => setActiveTab("tenants")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === "tenants"
                ? "border-blue-500 text-blue-400 bg-slate-800/50 rounded-t-lg"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Tenants
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {/* ================= TAB 1: EQUIPMENT ================= */}
          {activeTab === "equipment" && (
            <div className="space-y-6">
              {eqMsg && (
                <div
                  className={`p-3.5 rounded-xl text-sm flex items-start gap-2.5 ${
                    eqMsg.type === "success"
                      ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/60"
                      : "bg-red-950/50 text-red-300 border border-red-800/60"
                  }`}
                >
                  {eqMsg.type === "success" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                  )}
                  <span>{eqMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleCreateEquipment} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Equipment Name *
                    </label>
                    <input
                      type="text"
                      value={eqName}
                      onChange={(e) => setEqName(e.target.value)}
                      placeholder="e.g. Hydraulic Pump H-400"
                      required
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Assigned Tenant *
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={eqTenantId}
                        onChange={(e) => setEqTenantId(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {tenants.map((t) => (
                          <option key={t.tenant_id} value={t.tenant_id}>
                            {t.name} ({t.tenant_id})
                          </option>
                        ))}
                        {tenants.length === 0 && <option value="mvp_tenant">Default (mvp_tenant)</option>}
                      </select>
                      <button
                        type="button"
                        onClick={() => setActiveTab("tenants")}
                        className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 hover:text-white transition-all flex items-center gap-1"
                        title="Add new tenant"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        New
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Equipment Description *
                  </label>
                  <textarea
                    rows={3}
                    value={eqDesc}
                    onChange={(e) => setEqDesc(e.target.value)}
                    placeholder="Provide technical details, operation bay, purpose, or model serial..."
                    required
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={eqSubmitting || !eqName.trim() || !eqDesc.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30 transition-all"
                  >
                    {eqSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Equipment...
                      </>
                    ) : (
                      <>
                        <PlusCircle className="h-4 w-4" />
                        Create Equipment
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Registered Equipment List */}
              <div className="pt-4 border-t border-slate-800">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Existing Equipment ({equipmentList.length})
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {equipmentList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No equipment registered yet.</p>
                  ) : (
                    equipmentList.map((eq) => (
                      <div
                        key={eq._id || eq.name}
                        className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/80 flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-100">{eq.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/50">
                              {eq.tenant_id}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-1">{eq.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (eq._id) {
                              setDocEquipmentId(eq._id);
                              setActiveTab("documents");
                            }
                          }}
                          className="px-2.5 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded-lg border border-blue-800/40 transition-all"
                        >
                          Upload Docs
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: UPLOAD DOCUMENTS ================= */}
          {activeTab === "documents" && (
            <div className="space-y-6">
              {docMsg && (
                <div
                  className={`p-3.5 rounded-xl text-sm flex items-start gap-2.5 ${
                    docMsg.type === "success"
                      ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/60"
                      : "bg-red-950/50 text-red-300 border border-red-800/60"
                  }`}
                >
                  {docMsg.type === "success" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                  )}
                  <span>{docMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleUploadDocuments} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Target Equipment *
                  </label>
                  {equipmentList.length === 0 ? (
                    <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-300 text-xs flex items-center justify-between">
                      <span>No equipment available. Please register equipment first.</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab("equipment")}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium"
                      >
                        Create Equipment
                      </button>
                    </div>
                  ) : (
                    <select
                      value={docEquipmentId}
                      onChange={(e) => setDocEquipmentId(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">-- Choose Equipment --</option>
                      {equipmentList.map((eq) => (
                        <option key={eq._id} value={eq._id}>
                          {eq.name} (Tenant: {eq.tenant_id})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* File Dropzone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Upload Manuals / Knowledge Files *
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-blue-500/70 bg-slate-800/40 hover:bg-slate-800/70 p-6 rounded-2xl cursor-pointer text-center transition-all group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt,.md"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-3 rounded-full bg-slate-800 group-hover:bg-blue-600/20 text-slate-400 group-hover:text-blue-400 transition-colors border border-slate-700">
                        <UploadCloud className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-medium text-slate-200">
                        Click to select or drag & drop files
                      </p>
                      <p className="text-xs text-slate-500">
                        Supported formats: <span className="text-slate-400 font-mono">.pdf, .docx, .txt, .md</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Selected Files Preview */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Selected Files ({selectedFiles.length})
                    </p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                            <span className="truncate text-slate-200 font-medium">{file.name}</span>
                            <span className="text-slate-500 text-[10px]">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="text-slate-400 hover:text-red-400 p-1 rounded transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Document Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={docDescription}
                    onChange={(e) => setDocDescription(e.target.value)}
                    placeholder="e.g. 2026 Operator Manual & Troubleshooting Matrix"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={docSubmitting || !docEquipmentId || selectedFiles.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30 transition-all"
                  >
                    {docSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extracting & Indexing Embeddings...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-4 w-4" />
                        Upload & Index Documents
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ================= TAB 3: TENANTS ================= */}
          {activeTab === "tenants" && (
            <div className="space-y-6">
              {tenantMsg && (
                <div
                  className={`p-3.5 rounded-xl text-sm flex items-start gap-2.5 ${
                    tenantMsg.type === "success"
                      ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/60"
                      : "bg-red-950/50 text-red-300 border border-red-800/60"
                  }`}
                >
                  {tenantMsg.type === "success" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                  )}
                  <span>{tenantMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleCreateTenant} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Tenant Identifier (Slug) *
                    </label>
                    <input
                      type="text"
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                      placeholder="e.g. chicago_plant"
                      required
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Alphanumeric characters, hyphens, and underscores only.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Organization / Facility Name *
                    </label>
                    <input
                      type="text"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="e.g. Chicago Manufacturing Plant"
                      required
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Tenant Description
                  </label>
                  <input
                    type="text"
                    value={tenantDesc}
                    onChange={(e) => setTenantDesc(e.target.value)}
                    placeholder="Optional description of this tenant namespace..."
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={tenantSubmitting || !tenantId.trim() || !tenantName.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30 transition-all"
                  >
                    {tenantSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Tenant...
                      </>
                    ) : (
                      <>
                        <PlusCircle className="h-4 w-4" />
                        Create Tenant
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Registered Tenants List */}
              <div className="pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Active Tenants ({tenants.length})
                  </h3>
                  <button
                    onClick={loadTenants}
                    disabled={loadingTenants}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingTenants ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {tenants.map((t) => (
                    <div
                      key={t.tenant_id}
                      className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/80 flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">{t.name}</span>
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                            {t.tenant_id}
                          </span>
                        </div>
                        {t.description && (
                          <p className="text-xs text-slate-400 line-clamp-1">{t.description}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-emerald-400 font-medium px-2 py-0.5 bg-emerald-950/40 rounded-full border border-emerald-800/40">
                        Active
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
