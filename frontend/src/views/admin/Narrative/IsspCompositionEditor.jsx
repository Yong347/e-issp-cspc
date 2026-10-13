import React, { useEffect, useState } from "react";
import { useCycle } from "../../../context/CycleContext";
import {
  getIsspDocumentComposition,
  saveIsspDocumentComposition,
  uploadIsspCompositionAttachment
} from "../../../api/admin";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  FilePlus2,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2
} from "lucide-react";

const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createSection = (title = "New section") => ({
  id: createId(),
  title,
  children: [],
  blocks: []
});

const createBlock = (type) => ({
  id: createId(),
  type,
  title: "",
  content: "",
  items: [],
  columns: [],
  rows: [],
  questions: [],
  file_key: null,
  file_name: null
});

function updateSectionTree(sections, sectionId, update) {
  return sections.map((section) => {
    if (section.id === sectionId) return update(section);
    return { ...section, children: updateSectionTree(section.children || [], sectionId, update) };
  });
}

function removeSectionTree(sections, sectionId) {
  return sections
    .filter((section) => section.id !== sectionId)
    .map((section) => ({ ...section, children: removeSectionTree(section.children || [], sectionId) }));
}

function moveSectionTree(sections, sectionId, direction) {
  const currentIndex = sections.findIndex((section) => section.id === sectionId);
  if (currentIndex >= 0) {
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return sections;
    const next = [...sections];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    return next;
  }
  return sections.map((section) => ({
    ...section,
    children: moveSectionTree(section.children || [], sectionId, direction)
  }));
}

function toLines(value) {
  return (value || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function tableToText(block) {
  return [block.columns || [], ...(block.rows || [])].map((row) => row.join(" | ")).join("\n");
}

function parseTable(value) {
  const lines = value.split("\n").map((line) => line.split("|").map((cell) => cell.trim()));
  const columns = lines.shift()?.filter(Boolean) || [];
  const rows = lines.filter((row) => row.some(Boolean)).map((row) =>
    Array.from({ length: columns.length }, (_, index) => row[index] || "")
  );
  return { columns, rows };
}

function BlockEditor({ block, onChange, onRemove, onUpload }) {
  const label = {
    paragraph: "Paragraph",
    bullet_list: "Bulleted list",
    numbered_list: "Numbered list",
    table: "Table",
    survey: "Survey questions",
    attachment: "Uploaded attachment"
  }[block.type];

  return (
    <div className="border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
        <button type="button" onClick={onRemove} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${label.toLowerCase()}`} title="Remove block">
          <Trash2 size={16} />
        </button>
      </div>
      {block.type !== "attachment" && (
        <input
          value={block.title || ""}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Block heading (optional)"
          className="mb-2 w-full border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        />
      )}
      {block.type === "paragraph" && (
        <textarea
          value={block.content || ""}
          onChange={(event) => onChange({ content: event.target.value })}
          rows={4}
          placeholder="Write the section content"
          className="w-full border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        />
      )}
      {(block.type === "bullet_list" || block.type === "numbered_list" || block.type === "survey") && (
        <textarea
          value={(block.type === "survey" ? block.questions : block.items || []).join("\n")}
          onChange={(event) => onChange(block.type === "survey" ? { questions: toLines(event.target.value) } : { items: toLines(event.target.value) })}
          rows={4}
          placeholder={block.type === "survey" ? "Enter one question per line" : "Enter one item per line"}
          className="w-full border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        />
      )}
      {block.type === "table" && (
        <textarea
          value={tableToText(block)}
          onChange={(event) => onChange(parseTable(event.target.value))}
          rows={5}
          placeholder={'Column A | Column B\nValue 1 | Value 2'}
          className="w-full border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-950"
        />
      )}
      {block.type === "attachment" && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
            <FilePlus2 size={16} />
            <span>{block.file_name || "Upload a file"}</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              className="sr-only"
              onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])}
            />
          </label>
          {block.file_key && <span className="text-xs text-emerald-700 dark:text-emerald-400">Uploaded and linked to this ISSP</span>}
        </div>
      )}
    </div>
  );
}

export default function IsspCompositionEditor() {
  const { activeCycle, cycleLoading } = useCycle();
  const [composition, setComposition] = useState({ version: 1, sections: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let alive = true;
    if (cycleLoading || !activeCycle) return undefined;
    setLoading(true);
    setError("");
    getIsspDocumentComposition(null, activeCycle)
      .then((data) => {
        if (!alive) return;
        setComposition({ version: 1, sections: data.sections || [] });
        setSavedAt(data.updated_at || null);
      })
      .catch((loadError) => alive && setError(loadError.message || "Unable to load this ISSP composition."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [activeCycle, cycleLoading]);

  const updateSection = (sectionId, updater) => {
    setComposition((current) => ({ ...current, sections: updateSectionTree(current.sections, sectionId, updater) }));
  };

  const updateBlock = (sectionId, blockId, patch) => updateSection(sectionId, (section) => ({
    ...section,
    blocks: section.blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block)
  }));

  const uploadAttachment = async (sectionId, blockId, file) => {
    setUploadingId(blockId);
    setError("");
    try {
      const result = await uploadIsspCompositionAttachment(null, activeCycle, file);
      updateBlock(sectionId, blockId, { file_key: result.file_key, file_name: result.file_name });
    } catch (uploadError) {
      setError(uploadError.message || "Attachment upload failed.");
    } finally {
      setUploadingId(null);
    }
  };

  const addSection = (parentId = null) => {
    const section = createSection();
    setComposition((current) => ({
      ...current,
      sections: parentId
        ? updateSectionTree(current.sections, parentId, (parent) => ({ ...parent, children: [...(parent.children || []), section] }))
        : [...current.sections, section]
    }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await saveIsspDocumentComposition(null, activeCycle, composition);
      setSavedAt(result.updated_at || new Date().toISOString());
      setNotice("Composition saved. New sections will be included the next time this ISSP is generated.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save this ISSP composition.");
    } finally {
      setSaving(false);
    }
  };

  const renderSection = (section, depth = 0) => (
    <section key={section.id} className="border-l-2 border-emerald-600 pl-4" style={{ marginLeft: depth ? 18 : 0 }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={section.title}
          onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))}
          aria-label="Section title"
          className="min-w-[220px] flex-1 border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-600 dark:bg-slate-950"
        />
        <button type="button" onClick={() => setComposition((current) => ({ ...current, sections: moveSectionTree(current.sections, section.id, -1) }))} className="rounded p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Move section up" title="Move up"><ArrowUp size={16} /></button>
        <button type="button" onClick={() => setComposition((current) => ({ ...current, sections: moveSectionTree(current.sections, section.id, 1) }))} className="rounded p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Move section down" title="Move down"><ArrowDown size={16} /></button>
        <button type="button" onClick={() => addSection(section.id)} className="inline-flex items-center gap-1 border border-slate-300 px-2.5 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"><Plus size={14} /> Subsection</button>
        <button type="button" onClick={() => setComposition((current) => ({ ...current, sections: removeSectionTree(current.sections, section.id) }))} className="rounded p-2 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950" aria-label="Delete section" title="Delete section"><Trash2 size={16} /></button>
      </div>

      <div className="mb-3 grid gap-3">
        {section.blocks.map((block) => (
          <BlockEditor
            key={block.id}
            block={block}
            onChange={(patch) => updateBlock(section.id, block.id, patch)}
            onRemove={() => updateSection(section.id, (current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) }))}
            onUpload={(file) => uploadAttachment(section.id, block.id, file)}
          />
        ))}
      </div>
      {uploadingId && section.blocks.some((block) => block.id === uploadingId) && (
        <p className="mb-3 flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Uploading attachment...</p>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["paragraph", "Paragraph"],
          ["bullet_list", "Bulleted list"],
          ["numbered_list", "Numbered list"],
          ["table", "Table"],
          ["survey", "Survey questions"],
          ["attachment", "Upload file"]
        ].map(([type, label]) => (
          <button
            key={type}
            type="button"
            onClick={() => updateSection(section.id, (current) => ({ ...current, blocks: [...current.blocks, createBlock(type)] }))}
            className="border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:border-emerald-600 hover:text-emerald-700 dark:border-slate-600 dark:text-slate-300"
          >+ {label}</button>
        ))}
      </div>
      {(section.children || []).map((child) => renderSection(child, depth + 1))}
    </section>
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"><FileText size={15} /> ISSP composition</div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Supplemental sections</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Cycle {activeCycle || "..."}. Add document sections without changing validated planning modules.</p>
        </div>
        <button type="button" onClick={save} disabled={saving || loading || cycleLoading} className="inline-flex items-center gap-2 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Saving" : "Save changes"}
        </button>
      </header>

      <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        This first editor manages additional sections and subsections. The official DICT sections remain generated from the existing planning modules.
      </div>

      {error && <div role="alert" className="flex items-start gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
      {notice && <div role="status" className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}
      {loading || cycleLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Loading composition...</div>
      ) : (
        <div className="space-y-5">
          {composition.sections.length ? composition.sections.map((section) => renderSection(section)) : (
            <div className="border border-dashed border-slate-300 px-5 py-10 text-center dark:border-slate-700">
              <FileText className="mx-auto mb-3 text-slate-400" size={24} />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No supplemental sections yet</p>
              <p className="mt-1 text-xs text-slate-500">Add sections for cycle-specific content to include with the generated ISSP.</p>
            </div>
          )}
          <button type="button" onClick={() => addSection()} className="inline-flex items-center gap-2 border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"><Plus size={16} /> Add section</button>
          {savedAt && <p className="text-xs text-slate-500">Last saved {new Date(savedAt).toLocaleString()}</p>}
        </div>
      )}
    </main>
  );
}
