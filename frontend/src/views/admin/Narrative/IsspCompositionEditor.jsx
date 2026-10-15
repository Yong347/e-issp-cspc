import React, { useEffect, useState } from "react";
import { useCycle } from "../../../context/CycleContext";
import {
  getIsspDocumentComposition,
  saveIsspDocumentComposition,
  listIsspCompositionVersions,
  getIsspCompositionVersion,
  uploadIsspCompositionAttachment
} from "../../../api/admin";
import {
  AlertCircle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Copy,
  FilePlus2,
  FileText,
  Eye,
  EyeOff,
  Italic,
  Loader2,
  MinusSquare,
  Plus,
  Save,
  Trash2,
  Underline
} from "lucide-react";

const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createSection = (title = "New section", parentOfficialKey = null) => ({
  id: createId(),
  title,
  parent_official_key: parentOfficialKey,
  insert_before_official_key: null,
  children: [],
  blocks: []
});

const createBlock = (type) => ({
  id: createId(),
  type,
  title: "",
  content: "",
  text_bold: false,
  text_italic: false,
  text_underline: false,
  text_align: "left",
  callout_style: "info",
  items: type === "checklist" ? [""] : [],
  states: type === "checklist" ? ["unchecked"] : [],
  columns: type === "table" ? ["Column 1", "Column 2"] : [],
  rows: type === "table" ? [["", ""]] : [],
  questions: [],
  file_key: null,
  file_name: null
});

function insertSectionAfterTree(sections, sectionId, newSection) {
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index >= 0) {
    const next = [...sections];
    next.splice(index + 1, 0, {
      ...newSection,
      parent_official_key: sections[index].parent_official_key || null,
      insert_before_official_key: sections[index].insert_before_official_key || null
    });
    return next;
  }
  return sections.map((section) => ({
    ...section,
    children: insertSectionAfterTree(section.children || [], sectionId, newSection)
  }));
}

function cloneSectionWithNewIds(section) {
  return {
    ...section,
    id: createId(),
    title: `${section.title} (copy)`,
    blocks: (section.blocks || []).map((block) => ({ ...block, id: createId() })),
    children: (section.children || []).map((child) => cloneSectionWithNewIds(child))
  };
}

function moveItem(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const CHECK_STATES = ["unchecked", "checked", "crossed"];
const CHECK_SYMBOLS = { unchecked: "", checked: "✓", crossed: "✕" };
const CHECK_STYLES = {
  unchecked: "border-slate-400 text-transparent",
  checked: "border-emerald-600 bg-emerald-50 text-emerald-700",
  crossed: "border-rose-600 bg-rose-50 text-rose-700"
};

function ChecklistEditor({ block, onChange }) {
  const items = block.items?.length ? block.items : [""];
  const states = items.map((_, index) => block.states?.[index] || "unchecked");
  const update = (nextItems, nextStates) => onChange({ items: nextItems, states: nextStates });
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => update(items, states.map((state, i) => i === index ? CHECK_STATES[(CHECK_STATES.indexOf(state) + 1) % CHECK_STATES.length] : state))}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 text-base font-bold ${CHECK_STYLES[states[index]]}`}
            aria-label={`Item ${index + 1} is ${states[index]}. Click to change.`}
            title="Click to switch: empty, checked, crossed"
          >{CHECK_SYMBOLS[states[index]]}</button>
          <input
            value={item}
            onChange={(event) => update(items.map((value, i) => i === index ? event.target.value : value), states)}
            placeholder="Checklist item"
            className={`flex-1 ${inputClass}`}
          />
          <button type="button" onClick={() => update(moveItem(items, index, -1), moveItem(states, index, -1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Move item up"><ArrowUp size={14} /></button>
          <button type="button" onClick={() => update(moveItem(items, index, 1), moveItem(states, index, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Move item down"><ArrowDown size={14} /></button>
          <button type="button" onClick={() => items.length > 1 && update(items.filter((_, i) => i !== index), states.filter((_, i) => i !== index))} disabled={items.length <= 1} className="rounded-lg p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-30" aria-label="Remove item"><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={() => update([...items, ""], [...states, "unchecked"])} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"><Plus size={13} /> Add item</button>
      <p className="text-xs text-slate-500">Click a box to cycle: empty → ✓ checked → ✕ crossed.</p>
    </div>
  );
}

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

function collectSectionIds(sections, sectionId) {
  const found = sections.find((section) => section.id === sectionId);
  if (!found) {
    return sections.flatMap((section) => collectSectionIds(section.children || [], sectionId));
  }
  const ids = [found.id];
  for (const child of found.children || []) {
    ids.push(...collectSectionIds([child], child.id));
  }
  return ids;
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

function moveOutlineTree(sections, sectionKey, direction) {
  const currentIndex = sections.findIndex((section) => section.key === sectionKey);
  if (currentIndex >= 0) {
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return sections;
    const next = [...sections];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    return next;
  }
  return sections.map((section) => ({
    ...section,
    children: moveOutlineTree(section.children || [], sectionKey, direction)
  }));
}

function toLines(value) {
  return (value || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

const BLOCK_LABELS = {
  paragraph: "Paragraph",
  bullet_list: "Bulleted list",
  numbered_list: "Numbered list",
  checklist: "Checklist",
  table: "Table",
  survey: "Survey questions",
  attachment: "Uploaded attachment",
  page_break: "Page break",
  callout: "Callout box"
};

function validateSections(sections, path = []) {
  const problems = [];
  sections.forEach((section) => {
    const sectionPath = [...path, section.title || "Untitled section"];
    const where = sectionPath.join(" > ");
    if (!section.title?.trim()) problems.push(`A section has no title (${where}).`);
    (section.blocks || []).forEach((block, index) => {
      const name = `${where}: ${BLOCK_LABELS[block.type]} #${index + 1}`;
      if (block.type === "paragraph" && !block.content?.trim()) problems.push(`${name} is empty. Write some text or remove it.`);
      if ((block.type === "bullet_list" || block.type === "numbered_list") && !(block.items || []).length) problems.push(`${name} needs at least one item.`);
      if (block.type === "checklist" && !(block.items || []).some((item) => item.trim())) problems.push(`${name} needs at least one item with text.`);
      if (block.type === "survey" && !(block.questions || []).length) problems.push(`${name} needs at least one question.`);
      if (block.type === "table" && !(block.columns || []).some((column) => column.trim())) problems.push(`${name} needs at least one column heading.`);
      if (block.type === "attachment" && !(block.file_key && block.file_name)) problems.push(`${name} has no uploaded file yet.`);
      if (block.type === "callout" && !block.content?.trim()) problems.push(`${name} is empty. Write some text or remove it.`);
    });
    problems.push(...validateSections(section.children || [], sectionPath));
  });
  return problems;
}

function formatRecordValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const inputClass = "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950";

function TableEditor({ block, onChange }) {
  const columns = block.columns || [];
  const rows = block.rows || [];

  const setColumn = (index, value) => onChange({ columns: columns.map((column, i) => i === index ? value : column) });
  const setCell = (rowIndex, colIndex, value) => onChange({
    rows: rows.map((row, i) => i === rowIndex ? row.map((cell, j) => j === colIndex ? value : cell) : row)
  });
  const addColumn = () => onChange({
    columns: [...columns, `Column ${columns.length + 1}`],
    rows: rows.map((row) => [...row, ""])
  });
  const removeColumn = (index) => onChange({
    columns: columns.filter((_, i) => i !== index),
    rows: rows.map((row) => row.filter((_, i) => i !== index))
  });
  const addRow = () => onChange({ rows: [...rows, columns.map(() => "")] });
  const removeRow = (index) => onChange({ rows: rows.filter((_, i) => i !== index) });

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              {columns.map((column, index) => (
                <th key={index} className="p-1.5 align-top">
                  <div className="flex items-center gap-1">
                    <input
                      value={column}
                      onChange={(event) => setColumn(index, event.target.value)}
                      aria-label={`Column ${index + 1} heading`}
                      placeholder={`Column ${index + 1}`}
                      className="w-full min-w-[110px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-semibold dark:border-slate-600 dark:bg-slate-950"
                    />
                    <button type="button" onClick={() => removeColumn(index)} disabled={columns.length <= 1} className="rounded-lg p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30" aria-label={`Remove column ${index + 1}`} title="Remove column"><Trash2 size={14} /></button>
                  </div>
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-slate-200 dark:border-slate-700">
                {columns.map((_, colIndex) => (
                  <td key={colIndex} className="p-1.5">
                    <input
                      value={row[colIndex] || ""}
                      onChange={(event) => setCell(rowIndex, colIndex, event.target.value)}
                      aria-label={`Row ${rowIndex + 1}, ${columns[colIndex] || `column ${colIndex + 1}`}`}
                      className="w-full min-w-[110px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
                    />
                  </td>
                ))}
                <td className="p-1.5">
                  <button type="button" onClick={() => removeRow(rowIndex)} className="rounded-lg p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove row ${rowIndex + 1}`} title="Remove row"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="p-3 text-center text-xs text-slate-500">No rows yet. Click “Add row”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"><Plus size={14} /> Add row</button>
        <button type="button" onClick={addColumn} disabled={columns.length >= 20} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"><Plus size={14} /> Add column</button>
      </div>
    </div>
  );
}

function BlockEditor({ block, onChange, onRemove, onUpload, uploading, onMove, onDuplicate }) {
  const label = BLOCK_LABELS[block.type];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Move block up" title="Move up"><ArrowUp size={16} /></button>
          <button type="button" onClick={() => onMove(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Move block down" title="Move down"><ArrowDown size={16} /></button>
          <button type="button" onClick={onDuplicate} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Duplicate ${label.toLowerCase()}`} title="Duplicate block"><Copy size={16} /></button>
          <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${label.toLowerCase()}`} title="Remove block">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {block.type !== "page_break" && (
        <input
          value={block.title || ""}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder={block.type === "attachment" ? "Image title, shown as a section-style header (optional)" : "Block heading (optional)"}
          className={`mb-2 ${inputClass}`}
        />
      )}
      {block.type === "attachment" && (
        <textarea
          value={block.content || ""}
          onChange={(event) => onChange({ content: event.target.value })}
          rows={3}
          placeholder="Paragraph shown above the image (optional)"
          className={`mb-2 ${inputClass}`}
        />
      )}
      {block.type === "paragraph" && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-950/40">
            <button type="button" onClick={() => onChange({ text_bold: !block.text_bold })} aria-pressed={!!block.text_bold} className={`rounded-lg p-1.5 ${block.text_bold ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"}`} title="Bold"><Bold size={14} /></button>
            <button type="button" onClick={() => onChange({ text_italic: !block.text_italic })} aria-pressed={!!block.text_italic} className={`rounded-lg p-1.5 ${block.text_italic ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"}`} title="Italic"><Italic size={14} /></button>
            <button type="button" onClick={() => onChange({ text_underline: !block.text_underline })} aria-pressed={!!block.text_underline} className={`rounded-lg p-1.5 ${block.text_underline ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"}`} title="Underline"><Underline size={14} /></button>
            <span className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700" />
            {[["left", AlignLeft, "Align left"], ["center", AlignCenter, "Align center"], ["right", AlignRight, "Align right"], ["justify", AlignJustify, "Justify"]].map(([value, Icon, titleText]) => (
              <button key={value} type="button" onClick={() => onChange({ text_align: value })} aria-pressed={(block.text_align || "left") === value} className={`rounded-lg p-1.5 ${(block.text_align || "left") === value ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"}`} title={titleText}><Icon size={14} /></button>
            ))}
          </div>
          <textarea
            value={block.content || ""}
            onChange={(event) => onChange({ content: event.target.value })}
            rows={4}
            placeholder="Write the section content"
            style={{
              fontWeight: block.text_bold ? "bold" : "normal",
              fontStyle: block.text_italic ? "italic" : "normal",
              textDecoration: block.text_underline ? "underline" : "none",
              textAlign: block.text_align || "left"
            }}
            className={inputClass}
          />
        </>
      )}
      {block.type === "callout" && (
        <>
          <div className="mb-2 flex gap-2">
            {[["info", "Info (blue)"], ["warning", "Warning (amber)"], ["success", "Success (green)"]].map(([value, labelText]) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange({ callout_style: value })}
                className={`rounded-xl border px-2.5 py-1.5 text-xs font-medium ${(block.callout_style || "info") === value
                  ? { info: "border-blue-600 bg-blue-50 text-blue-800", warning: "border-amber-600 bg-amber-50 text-amber-800", success: "border-emerald-600 bg-emerald-50 text-emerald-800" }[value]
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}
              >{labelText}</button>
            ))}
          </div>
          <textarea
            value={block.content || ""}
            onChange={(event) => onChange({ content: event.target.value })}
            rows={3}
            placeholder="Note or warning text shown in a highlighted box"
            className={inputClass}
          />
        </>
      )}
      {block.type === "page_break" && (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-600"><MinusSquare size={16} /> Everything after this starts on a new page.</p>
      )}
      {(block.type === "bullet_list" || block.type === "numbered_list" || block.type === "survey") && (
        <>
          <textarea
            value={block.type === "survey" ? (block.questionsText ?? (block.questions || []).join("\n")) : (block.itemsText ?? (block.items || []).join("\n"))}
            onChange={(event) => onChange(block.type === "survey"
              ? { questionsText: event.target.value, questions: toLines(event.target.value) }
              : { itemsText: event.target.value, items: toLines(event.target.value) })}
            rows={4}
            placeholder={block.type === "survey" ? "Enter one question per line" : "Enter one item per line"}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-500">{block.type === "survey" ? "One question per line." : "One item per line."}</p>
        </>
      )}
      {block.type === "checklist" && <ChecklistEditor block={block} onChange={onChange} />}
      {block.type === "table" && <TableEditor block={block} onChange={onChange} />}
      {block.type === "attachment" && (
        <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center dark:border-slate-600">
          {uploading ? (
            <p className="flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Uploading...</p>
          ) : block.file_key ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400"><FileText size={16} /> {block.file_name}</span>
              <label className="cursor-pointer rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                Replace file
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload(file); }} />
              </label>
              <button type="button" onClick={() => onChange({ file_key: null, file_name: null })} className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-slate-600">Remove file</button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer flex-col items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              <FilePlus2 size={22} className="text-slate-400" />
              <span>Click to choose a file</span>
              <span className="text-xs font-normal text-slate-500">PDF, Word, Excel, PNG or JPG</span>
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload(file); }} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default function IsspCompositionEditor() {
  const { activeCycle, cycleLoading } = useCycle();
  const [composition, setComposition] = useState({ version: 2, sections: [], official_sections: {} });
  const [outline, setOutline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const isDirty = snapshot !== null && JSON.stringify(composition) !== snapshot;
  const [versions, setVersions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const refreshVersions = () => {
    if (!activeCycle) return;
    listIsspCompositionVersions(null, activeCycle).then(setVersions).catch(() => setVersions([]));
  };

  const restoreVersion = async (versionId) => {
    if (isDirty && !window.confirm("Load this version? Your current unsaved changes will be replaced.")) return;
    setError("");
    try {
      const data = await getIsspCompositionVersion(null, activeCycle, versionId);
      setComposition({ version: 2, sections: data.sections || [], official_sections: data.official_sections || {} });
      setOutline(data.outline || []);
      setNotice("Older version loaded into the editor. Click Save changes to make it the current version.");
    } catch (restoreError) {
      setError(restoreError.message || "Unable to load that version.");
    }
  };

  useEffect(() => { refreshVersions(); }, [activeCycle, savedAt]);
  useEffect(() => {
    let alive = true;
    if (cycleLoading || !activeCycle) return undefined;
    setLoading(true);
    setError("");
    getIsspDocumentComposition(null, activeCycle)
      .then((data) => {
        if (!alive) return;
        const loaded = {
          version: 2,
          sections: data.sections || [],
          official_sections: data.official_sections || {}
        };
        setComposition(loaded);
        setSnapshot(JSON.stringify(loaded));
        setOutline(data.outline || []);
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

  const updateOfficialSection = (sectionKey, patch) => {
    setComposition((current) => ({
      ...current,
      official_sections: {
        ...current.official_sections,
        [sectionKey]: { ...(current.official_sections[sectionKey] || {}), ...patch }
      }
    }));
  };

  const deleteCustomSection = (sectionId) => {
    setComposition((current) => {
      const removedIds = new Set(collectSectionIds(current.sections, sectionId));
      return {
        ...current,
        sections: removeSectionTree(current.sections, sectionId),
        official_sections: Object.fromEntries(
          Object.entries(current.official_sections).map(([key, setting]) => [
            key,
            removedIds.has(setting.replacement_section_id)
              ? { ...setting, replacement_section_id: null }
              : setting
          ])
        )
      };
    });
  };

  const moveOfficialSection = (sectionKey, siblings, direction) => {
    const currentIndex = siblings.findIndex((section) => section.key === sectionKey);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    setOutline((current) => moveOutlineTree(current, sectionKey, direction));
    setComposition((current) => ({
      ...current,
      official_sections: {
        ...current.official_sections,
        ...Object.fromEntries(reordered.map((section, index) => [
          section.key,
          { ...(current.official_sections[section.key] || {}), order: index }
        ]))
      }
    }));
  };

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

  const addSectionAfter = (sectionId) => {
    setComposition((current) => ({
      ...current,
      sections: insertSectionAfterTree(current.sections, sectionId, createSection())
    }));
  };

  const addSectionAtStart = () => {
    setComposition((current) => ({
      ...current,
      sections: [{ ...createSection(), insert_before_official_key: current.sections.find((section) => !section.parent_official_key)?.insert_before_official_key || null }, ...current.sections]
    }));
  };

  const addOfficialSubsection = (parentOfficialKey) => {
    const section = createSection("New subsection", parentOfficialKey);
    setComposition((current) => ({ ...current, sections: [...current.sections, section] }));
  };

  const save = async () => {
    setError("");
    setNotice("");
    const problems = validateSections(composition.sections);
    if (problems.length) {
      setError(`Please fix the following before saving:\n• ${problems.join("\n• ")}`);
      return;
    }
    setSaving(true);
    try {
      const result = await saveIsspDocumentComposition(null, activeCycle, composition);
      const saved = {
        version: 2,
        sections: result.sections || composition.sections,
        official_sections: result.official_sections || composition.official_sections
      };
      setSavedAt(result.updated_at || new Date().toISOString());
      setOutline(result.outline || []);
      setComposition(saved);
      setSnapshot(JSON.stringify(saved));
      setNotice("Saved. Next step: open the Dashboard and click Compile PDF / Compile Word. The Vault only shows the last compiled file until you compile again.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save this ISSP composition.");
    } finally {
      setSaving(false);
    }
  };

  const replacedSectionIds = new Set(
    Object.values(composition.official_sections).map((setting) => setting.replacement_section_id).filter(Boolean)
  );

  const renderSection = (section, depth = 0) => (
    <section key={section.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-xs dark:border-slate-700 dark:bg-slate-950/20" style={{ marginLeft: depth ? 18 : 0 }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={section.title}
          onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))}
          aria-label="Section title"
          className="min-w-[220px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-600 dark:bg-slate-950"
        />
        <button type="button" onClick={() => setComposition((current) => ({ ...current, sections: moveSectionTree(current.sections, section.id, -1) }))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Move section up" title="Move up"><ArrowUp size={16} /></button>
        <button type="button" onClick={() => setComposition((current) => ({ ...current, sections: moveSectionTree(current.sections, section.id, 1) }))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Move section down" title="Move down"><ArrowDown size={16} /></button>
        <button type="button" onClick={() => addSection(section.id)} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-2.5 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"><Plus size={14} /> Subsection</button>
        <button type="button" onClick={() => addSectionAfter(section.id)} className="inline-flex items-center gap-1 rounded-xl border border-emerald-700 px-2.5 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"><Plus size={14} /> Section below</button>
        <button
          type="button"
          onClick={() => setComposition((current) => ({ ...current, sections: insertSectionAfterTree(current.sections, section.id, cloneSectionWithNewIds(section)) }))}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-2.5 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        ><Copy size={14} /> Duplicate</button>
        <button type="button" onClick={() => deleteCustomSection(section.id)} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950" aria-label="Delete section" title="Delete section"><Trash2 size={16} /></button>
      </div>

      {depth === 0 && !section.parent_official_key && !replacedSectionIds.has(section.id) && (
        <label className="mb-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Position in the ISSP
          <select
            value={section.insert_before_official_key || ""}
            onChange={(event) => updateSection(section.id, (current) => ({ ...current, insert_before_official_key: event.target.value || null }))}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal dark:border-slate-600 dark:bg-slate-950"
          >
            <option value="">At the end of the document</option>
            {outline.map((node) => (
              <option key={node.key} value={node.key}>Before: {composition.official_sections[node.key]?.title || node.title}</option>
            ))}
          </select>
        </label>
      )}

      <div className="mb-3 grid gap-3">
        {section.blocks.map((block) => (
          <BlockEditor
            key={block.id}
            block={block}
            uploading={uploadingId === block.id}
            onChange={(patch) => updateBlock(section.id, block.id, patch)}
            onRemove={() => updateSection(section.id, (current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) }))}
            onUpload={(file) => uploadAttachment(section.id, block.id, file)}
            onMove={(direction) => updateSection(section.id, (current) => ({ ...current, blocks: moveItem(current.blocks, current.blocks.findIndex((item) => item.id === block.id), direction) }))}
            onDuplicate={() => updateSection(section.id, (current) => {
              const index = current.blocks.findIndex((item) => item.id === block.id);
              const next = [...current.blocks];
              next.splice(index + 1, 0, { ...block, id: createId() });
              return { ...current, blocks: next };
            })}
          />
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["paragraph", "Paragraph"],
          ["bullet_list", "Bulleted list"],
          ["numbered_list", "Numbered list"],
          ["checklist", "Checklist"],
          ["table", "Table"],
          ["survey", "Survey questions"],
          ["attachment", "Upload file"],
          ["callout", "Callout box"],
          ["page_break", "Page break"]
        ].map(([type, label]) => (
          <button
            key={type}
            type="button"
            onClick={() => updateSection(section.id, (current) => ({ ...current, blocks: [...current.blocks, createBlock(type)] }))}
            className="rounded-xl border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:border-emerald-600 hover:text-emerald-700 dark:border-slate-600 dark:text-slate-300"
          >+ {label}</button>
        ))}
      </div>
      {(section.children || []).map((child) => renderSection(child, depth + 1))}
    </section>
  );

  const renderOutlineNode = (node, siblings, depth = 0) => {
    const setting = composition.official_sections[node.key] || {};
    const replacement = composition.sections.find((section) => section.id === setting.replacement_section_id);
    const isVisible = setting.visible !== false || Boolean(replacement);
    const displayedTitle = setting.title ?? replacement?.title ?? node.title;
    return (
      <details key={node.key} open={depth < 2} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-700 dark:bg-slate-900">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
          <span className={`min-w-[220px] flex-1 text-sm font-semibold ${isVisible ? "text-slate-800 dark:text-slate-100" : "text-slate-400 line-through"}`}>
            {displayedTitle}
          </span>
          <span className="text-xs text-slate-500">{node.records?.length || node.record_count || 0} records</span>
          <span className="text-xs text-slate-500">{node.source}</span>
        </summary>
        <div className="ml-4 mt-3 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isVisible}
                onChange={(event) => updateOfficialSection(node.key, {
                  visible: event.target.checked,
                  ...(!event.target.checked ? { replacement_section_id: null } : {})
                })}
              />
              Include in generated ISSP
            </label>
            {depth === 0 && (
              <>
                <button
                  type="button"
                  onClick={() => moveOfficialSection(node.key, siblings, -1)}
                  disabled={siblings[0]?.key === node.key}
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                  aria-label={`Move ${node.title} up`}
                  title="Move up"
                ><ArrowUp size={15} /></button>
                <button
                  type="button"
                  onClick={() => moveOfficialSection(node.key, siblings, 1)}
                  disabled={siblings[siblings.length - 1]?.key === node.key}
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                  aria-label={`Move ${node.title} down`}
                  title="Move down"
                ><ArrowDown size={15} /></button>
              </>
            )}
            {isVisible ? <Eye size={15} className="text-emerald-700" /> : <EyeOff size={15} className="text-slate-400" />}
          </div>
          <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Title in the compiled PDF/Word (the saved data is not changed)
            <div className="mt-1 flex gap-2">
              <input
                value={setting.title ?? node.title}
                onChange={(event) => updateOfficialSection(node.key, { title: event.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal dark:border-slate-600 dark:bg-slate-950"
                maxLength={200}
              />
              {setting.title && setting.title !== node.title && (
                <button type="button" onClick={() => updateOfficialSection(node.key, { title: null })} className="shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">Reset</button>
              )}
            </div>
          </label>
          {node.records?.length > 0 && (
            <details className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">
              <summary className="cursor-pointer text-xs font-semibold text-emerald-800 dark:text-emerald-300">View saved source data ({node.records.length})</summary>
              <div className="mt-2 max-h-72 overflow-auto">
                {node.records.map((record, index) => (
                  <dl key={`${node.key}-${index}`} className="grid grid-cols-1 gap-x-4 gap-y-1 border-b border-slate-100 py-2 text-xs sm:grid-cols-2 dark:border-slate-800">
                    {Object.entries(record).map(([field, value]) => (
                      <div key={field} className="min-w-0">
                        <dt className="font-semibold text-slate-500">{field.replaceAll("_", " ")}</dt>
                        <dd className="break-words text-slate-800 dark:text-slate-200">{formatRecordValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ))}
              </div>
            </details>
          )}
          {depth === 0 && (
            <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Replace with additional section
              <select
                value={setting.replacement_section_id || ""}
                onChange={(event) => updateOfficialSection(node.key, {
                  replacement_section_id: event.target.value || null,
                  ...(event.target.value ? { visible: false } : {})
                })}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal dark:border-slate-600 dark:bg-slate-950"
              >
                <option value="">No replacement</option>
                {composition.sections.map((section) => (
                  <option key={section.id} value={section.id}>{section.title}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => addOfficialSubsection(node.key)}
            className="mt-3 inline-flex items-center gap-1 rounded-xl border border-dashed border-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          ><Plus size={14} /> Add subsection</button>
          {composition.sections
            .filter((section) => section.parent_official_key === node.key)
            .map((section) => renderSection(section, depth + 1))}
          {node.children?.length > 0 && (
            <div className="mt-2">
              {node.children.map((child) => renderOutlineNode(child, node.children, depth + 1))}
            </div>
          )}
        </div>
      </details>
    );
  };

  return (
    <main className="relative mx-auto max-w-6xl space-y-6 p-5 pb-16 text-slate-800 md:p-8 dark:text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-700 dark:bg-slate-900">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"><FileText size={15} /> ISSP composition</div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ISSP outline</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Cycle {activeCycle || "..."}. Manage document sections while preserving their source records.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={() => setShowHistory((open) => !open)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
            Version history ({versions.length})
          </button>
          <button type="button" onClick={save} disabled={saving || loading || cycleLoading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving" : "Save changes"}
          </button>
          {isDirty && <span className="text-xs font-medium text-amber-700 dark:text-amber-400">You have unsaved changes</span>}
        </div>
      </header>

      {showHistory && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Version history</h2>
          {versions.length === 0 ? (
            <p className="text-sm text-slate-500">No saved versions yet. A version is recorded every time you save.</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {versions.map((version, index) => (
                <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {new Date(`${version.saved_at}Z`).toLocaleString()} · {version.section_count} added section(s)
                    {index === 0 && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Current</span>}
                  </span>
                  {index !== 0 && <button type="button" onClick={() => restoreVersion(version.id)} className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">Load this version</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 shadow-xs dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <p className="font-semibold">How it works</p>
        <ol className="mt-1 list-decimal pl-5">
          <li>Edit the outline here and click <strong>Save changes</strong>.</li>
          <li>Go to the <strong>Dashboard</strong> and click <strong>Compile PDF / Compile Word</strong>. Saved changes only appear in a newly compiled file.</li>
          <li>Download the result from the Dashboard or the Vault.</li>
        </ol>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-xs dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        Hiding a section only removes it from this cycle’s generated documents. Source data remains in its existing planning module.
      </div>

      {!loading && !cycleLoading && (() => {
        const problems = validateSections(composition.sections);
        const countAttachments = (sections) => sections.reduce((total, section) => total + (section.blocks || []).filter((block) => block.type === "attachment" && block.file_name && !/\.(png|jpe?g)$/i.test(block.file_name)).length + countAttachments(section.children || []), 0);
        const linkOnly = countAttachments(composition.sections);
        const warnings = [
          ...problems,
          ...(linkOnly ? [`${linkOnly} uploaded file(s) are not PNG/JPG and will appear as download links, not embedded pages.`] : []),
          ...(isDirty ? ["You have unsaved changes. Save before compiling."] : [])
        ];
        return (
          <div className={`rounded-2xl border px-4 py-3 text-sm shadow-xs ${warnings.length ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>
            <p className="font-semibold">{warnings.length ? "Before you compile" : "Ready to compile"}</p>
            {warnings.length ? <ul className="mt-1 list-disc pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="mt-1">No issues found. Everything is saved.</p>}
          </div>
        );
      })()}

      {error && <div role="alert" className="flex items-start gap-2 whitespace-pre-line rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-xs dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
      {notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-xs dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}
      {loading || cycleLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-xs dark:border-slate-700 dark:bg-slate-900"><Loader2 size={18} className="inline-block animate-spin align-text-bottom" /> Loading composition...</div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-xs dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Existing ISSP sections</h2>
            <div>{outline.map((section) => renderOutlineNode(section, outline))}</div>
          </section>
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Additional sections</h2>
          {composition.sections.some((section) => !section.parent_official_key) && (
            <button type="button" onClick={addSectionAtStart} className="inline-flex items-center gap-1 rounded-xl border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-600 hover:text-emerald-700 dark:border-slate-600 dark:text-slate-300"><Plus size={13} /> Add section at the top</button>
          )}
          {composition.sections.some((section) => !section.parent_official_key) ? composition.sections.filter((section) => !section.parent_official_key).map((section) => renderSection(section)) : (
            <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center shadow-xs dark:border-slate-700">
              <FileText className="mx-auto mb-3 text-slate-400" size={24} />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No supplemental sections yet</p>
              <p className="mt-1 text-xs text-slate-500">Add sections for cycle-specific content to include with the generated ISSP.</p>
            </div>
          )}
          <button type="button" onClick={() => addSection()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"><Plus size={16} /> Add section</button>
          {savedAt && <p className="text-xs text-slate-500">Last saved {new Date(savedAt).toLocaleString()}</p>}
          </section>
        </div>
      )}
    </main>
  );
}
