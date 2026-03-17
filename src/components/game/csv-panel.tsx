"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { parseCsv } from "@/lib/csv";
import {
  Download,
  Upload,
  FileSpreadsheet,
  Users,
  Link2,
  AlertTriangle,
  CheckCircle2,
  LayoutGrid,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  gameId: string;
  onImported: () => void;
}

type Tab = "export" | "import";
type DataKind = "characters" | "relationships" | "characters-matrix";
const CHARACTER_EXPORT_FIELD_OPTIONS = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "faction", label: "Faction" },
  { key: "archetype", label: "Archetype" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
] as const;
const RELATIONSHIP_EXPORT_FIELD_OPTIONS = [
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "type", label: "Type" },
  { key: "description", label: "Description" },
  { key: "intensity", label: "Intensity" },
  { key: "bidirectional", label: "Bidirectional" },
] as const;
const MATRIX_EXPORT_FIELD_OPTIONS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
  { key: "type", label: "Type (CHARACTER/NPC)" },
  { key: "faction", label: "Faction" },
  { key: "archetype", label: "Archetype" },
  { key: "status", label: "Status" },
  { key: "plotlines", label: "All plotline matrix columns" },
  { key: "attributes", label: "Custom attributes (attr:<slug>)" },
] as const;
type CharacterExportField = (typeof CHARACTER_EXPORT_FIELD_OPTIONS)[number]["key"];
type RelationshipExportField = (typeof RELATIONSHIP_EXPORT_FIELD_OPTIONS)[number]["key"];
type MatrixExportField = (typeof MATRIX_EXPORT_FIELD_OPTIONS)[number]["key"];

export function CsvPanel({ open, onClose, gameId, onImported }: Props) {
  const [tab, setTab] = useState<Tab>("export");
  const [dataKind, setDataKind] = useState<DataKind>("characters");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [characterExportFields, setCharacterExportFields] = useState<CharacterExportField[]>(
    CHARACTER_EXPORT_FIELD_OPTIONS.map((f) => f.key)
  );
  const [relationshipExportFields, setRelationshipExportFields] = useState<RelationshipExportField[]>(
    RELATIONSHIP_EXPORT_FIELD_OPTIONS.map((f) => f.key)
  );
  const [matrixExportFields, setMatrixExportFields] = useState<MatrixExportField[]>(
    MATRIX_EXPORT_FIELD_OPTIONS.map((f) => f.key)
  );
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    warnings?: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportChars = trpc.csv.exportCharacters.useQuery(
    { gameId, fields: characterExportFields },
    { enabled: open && tab === "export" && dataKind === "characters" }
  );
  const exportRels = trpc.csv.exportRelationships.useQuery(
    { gameId, fields: relationshipExportFields },
    { enabled: open && tab === "export" && dataKind === "relationships" }
  );
  const exportCharsMatrix = trpc.csv.exportCharactersMatrix.useQuery(
    { gameId, fields: matrixExportFields },
    { enabled: open && tab === "export" && dataKind === "characters-matrix" }
  );

  const importChars = trpc.csv.importCharacters.useMutation({
    onSuccess: (data) => {
      const details: string[] = [];
      if ((data as any).updated) details.push(`updated ${(data as any).updated}`);
      if ((data as any).updatedAttributes) details.push(`updated ${(data as any).updatedAttributes} attributes`);
      const detailsText = details.length > 0 ? ` (${details.join(", ")})` : "";
      const reportWarnings: string[] = [];
      const charsReport = (data as any).columnReport;
      if (charsReport?.recognizedAttributeColumns?.length) {
        reportWarnings.push(
          `Recognized attribute columns: ${charsReport.recognizedAttributeColumns.join(", ")}`
        );
      }
      if (charsReport?.ignoredAttributeColumns?.length) {
        reportWarnings.push(
          `Ignored attribute columns: ${charsReport.ignoredAttributeColumns.join(", ")}`
        );
      }
      if (charsReport?.ignoredColumns?.length) {
        reportWarnings.push(
          `Ignored columns: ${charsReport.ignoredColumns.join(", ")}`
        );
      }
      setImportResult({
        success: true,
        message: `Imported ${data.imported} characters${detailsText}.`,
        warnings: [...((data as any).warnings ?? []), ...reportWarnings],
      });
      onImported();
    },
    onError: (err) => {
      setImportResult({ success: false, message: err.message });
    },
  });
  const importRels = trpc.csv.importRelationships.useMutation({
    onSuccess: (data) => {
      setImportResult({
        success: true,
        message: `Imported ${data.imported} relationships.`,
        warnings: data.warnings,
      });
      onImported();
    },
    onError: (err) => {
      setImportResult({ success: false, message: err.message });
    },
  });
  const importCharsMatrix = trpc.csv.importCharactersMatrix.useMutation({
    onSuccess: (data) => {
      const warnings = [
        ...(data.skipped ?? []),
        ...(data.errors ?? []),
      ];
      if (data.columnReport?.recognizedPlotlineColumns?.length) {
        warnings.push(
          `Recognized plotline columns: ${data.columnReport.recognizedPlotlineColumns.join(", ")}`
        );
      }
      if (data.columnReport?.ignoredPlotlineColumns?.length) {
        warnings.push(
          `Ignored plotline columns: ${data.columnReport.ignoredPlotlineColumns.join(", ")}`
        );
      }
      if (data.columnReport?.recognizedAttributeColumns?.length) {
        warnings.push(
          `Recognized attribute columns: ${data.columnReport.recognizedAttributeColumns.join(", ")}`
        );
      }
      if (data.columnReport?.ignoredAttributeColumns?.length) {
        warnings.push(
          `Ignored attribute columns: ${data.columnReport.ignoredAttributeColumns.join(", ")}`
        );
      }
      if (data.columnReport?.ignoredColumns?.length) {
        warnings.push(
          `Ignored columns: ${data.columnReport.ignoredColumns.join(", ")}`
        );
      }
      const additions: string[] = [];
      if (data.createdPlotlines > 0) {
        additions.push(`created ${data.createdPlotlines} new plotlines`);
      }
      if (data.linkedFromDescription > 0) {
        additions.push(`linked ${data.linkedFromDescription} plotline assignments from description`);
      }
      if (data.updatedAttributes > 0) {
        additions.push(`updated ${data.updatedAttributes} attributes`);
      }
      const additionsText = additions.length > 0 ? ` (${additions.join(", ")})` : "";
      setImportResult({
        success: true,
        message: `Updated ${data.updated} of ${data.totalRows} characters${additionsText}.`,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
      onImported();
    },
    onError: (err) => {
      setImportResult({ success: false, message: err.message });
    },
  });

  const handleDownload = () => {
    const data =
      dataKind === "characters"
        ? exportChars.data
        : dataKind === "characters-matrix"
          ? exportCharsMatrix.data
          : exportRels.data;
    if (!data) return;
    const blob = new Blob(["\uFEFF" + data.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataKind}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      try {
        const parsed = parseCsv(text);
        setPreview(parsed.slice(0, 10));
      } catch {
        setPreview([]);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!csvText) return;
    setImportResult(null);
    if (dataKind === "characters") {
      importChars.mutate({ gameId, csvText });
    } else if (dataKind === "characters-matrix") {
      importCharsMatrix.mutate({ gameId, csvText });
    } else {
      importRels.mutate({ gameId, csvText });
    }
  };

  const resetImport = () => {
    setCsvText("");
    setPreview([]);
    setFileName("");
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const exportData =
    dataKind === "characters"
      ? exportChars.data
      : dataKind === "characters-matrix"
        ? exportCharsMatrix.data
        : exportRels.data;
  const isImporting = importChars.isPending || importRels.isPending || importCharsMatrix.isPending;
  const previewHeaders = preview.length > 0 ? Object.keys(preview[0]) : [];
  const exportFieldOptions =
    dataKind === "characters"
      ? CHARACTER_EXPORT_FIELD_OPTIONS
      : dataKind === "characters-matrix"
        ? MATRIX_EXPORT_FIELD_OPTIONS
        : RELATIONSHIP_EXPORT_FIELD_OPTIONS;
  const selectedExportFields =
    dataKind === "characters"
      ? characterExportFields
      : dataKind === "characters-matrix"
        ? matrixExportFields
        : relationshipExportFields;
  const selectedExportFieldSet = new Set<string>(selectedExportFields as string[]);

  const toggleExportField = (field: string) => {
    const apply = (prev: string[]) => {
      if (prev.includes(field)) {
        if (prev.length === 1) return prev;
        return prev.filter((f) => f !== field);
      }
      return [...prev, field];
    };
    if (dataKind === "characters") {
      setCharacterExportFields((prev) => apply(prev) as CharacterExportField[]);
    } else if (dataKind === "characters-matrix") {
      setMatrixExportFields((prev) => apply(prev) as MatrixExportField[]);
    } else {
      setRelationshipExportFields((prev) => apply(prev) as RelationshipExportField[]);
    }
  };

  const selectAllExportFields = () => {
    if (dataKind === "characters") {
      setCharacterExportFields(CHARACTER_EXPORT_FIELD_OPTIONS.map((f) => f.key));
    } else if (dataKind === "characters-matrix") {
      setMatrixExportFields(MATRIX_EXPORT_FIELD_OPTIONS.map((f) => f.key));
    } else {
      setRelationshipExportFields(RELATIONSHIP_EXPORT_FIELD_OPTIONS.map((f) => f.key));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="CSV Import / Export"
      className="max-w-[min(900px,calc(100vw-2rem))]"
    >
      <div className="min-w-0">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-zinc-800 pb-2">
          <button
            onClick={() => { setTab("export"); setImportResult(null); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === "export" ? "bg-zinc-800 text-amber-400" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Download size={14} className="inline mr-1.5" />
            Export
          </button>
          <button
            onClick={() => { setTab("import"); setImportResult(null); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === "import" ? "bg-zinc-800 text-amber-400" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Upload size={14} className="inline mr-1.5" />
            Import
          </button>
        </div>

        {/* Data kind selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setDataKind("characters"); resetImport(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              dataKind === "characters"
                ? "border-amber-600 bg-amber-600/10 text-amber-400"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            <Users size={14} />
            Characters
          </button>
          <button
            onClick={() => { setDataKind("characters-matrix"); resetImport(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              dataKind === "characters-matrix"
                ? "border-amber-600 bg-amber-600/10 text-amber-400"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            <LayoutGrid size={14} />
            Characters + Plotlines
          </button>
          <button
            onClick={() => { setDataKind("relationships"); resetImport(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              dataKind === "relationships"
                ? "border-amber-600 bg-amber-600/10 text-amber-400"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            <Link2 size={14} />
            Relationships
          </button>
        </div>

        {/* EXPORT TAB */}
        {tab === "export" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Export fields</p>
                <Button variant="ghost" onClick={selectAllExportFields}>
                  Select all
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {exportFieldOptions.map((field) => {
                  const checked = selectedExportFieldSet.has(field.key);
                  const isOnlySelected = checked && selectedExportFields.length === 1;
                  return (
                    <label
                      key={field.key}
                      className="flex items-center gap-2 rounded-md border border-zinc-700 px-2 py-1.5 text-sm text-zinc-300"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isOnlySelected}
                        onChange={() => toggleExportField(field.key)}
                        className="h-4 w-4 accent-amber-500"
                      />
                      <span>{field.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Selected: {selectedExportFields.length}
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {dataKind === "characters"
                      ? "Character data"
                      : dataKind === "characters-matrix"
                        ? "Characters with plotline matrix"
                        : "Relationship data"}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {exportData
                      ? `${exportData.count} ${dataKind === "characters-matrix" ? "characters" : dataKind} ready to export`
                      : "Loading..."}
                  </p>
                </div>
                <Button
                  onClick={handleDownload}
                  disabled={!exportData || exportData.count === 0}
                >
                  <Download size={14} className="mr-1.5" />
                  Download CSV
                </Button>
              </div>
            </div>

            <div className="text-xs text-zinc-500 space-y-1">
              <p className="font-medium text-zinc-400">Columns in export:</p>
              {dataKind === "characters" ? (
                <p>name, type, faction, archetype, description, status</p>
              ) : dataKind === "characters-matrix" ? (
                <div>
                  <p>id, name, description, type, faction, archetype, status, + plotline columns (1/0), optional attr:&lt;slug&gt; columns</p>
                  <p className="mt-1 text-zinc-600">
                    Edit and re-import to bulk-update characters and their plotline assignments.
                  </p>
                </div>
              ) : (
                <p>from, to, type, description, intensity, bidirectional</p>
              )}
            </div>
          </div>
        )}

        {/* IMPORT TAB */}
        {tab === "import" && (
          <div className="space-y-4">
            {/* Format hint */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-xs text-zinc-400">
              <p className="font-medium text-zinc-300 mb-1">Expected CSV format:</p>
              {dataKind === "characters" ? (
                <>
                  <p>Required column: <span className="text-amber-400">name</span></p>
                  <p>Optional: type (CHARACTER/NPC), faction, archetype, description, status</p>
                  <code className="block mt-2 p-2 bg-zinc-900 rounded text-[11px] leading-relaxed">
                    name,type,faction,archetype,description{"\n"}
                    Lord Mortenval,CHARACTER,Tremere,Elder,&quot;An ancient vampire...&quot;{"\n"}
                    Guard Captain,NPC,City Watch,Soldier,&quot;Loyal to the crown&quot;
                  </code>
                </>
              ) : dataKind === "characters-matrix" ? (
                <>
                  <p>Required column: <span className="text-amber-400">id</span> (character ID from export)</p>
                  <p>Editable: <span className="text-zinc-300">name</span>, <span className="text-zinc-300">description</span>, <span className="text-zinc-300">type</span>, <span className="text-zinc-300">faction</span>, <span className="text-zinc-300">archetype</span>, <span className="text-zinc-300">status</span></p>
                  <p>Plotline columns: <span className="text-zinc-300">1</span> = assigned, <span className="text-zinc-300">0</span> = not assigned</p>
                  <p>Attribute columns: <span className="text-zinc-300">attr:&lt;slug&gt;</span> (for custom fields from game settings)</p>
                  <p>Status values: <span className="text-zinc-300">DRAFT</span>, <span className="text-zinc-300">IN_PROGRESS</span>, <span className="text-zinc-300">READY</span></p>
                  <p className="mt-1">
                    Auto-detect from description lines: <span className="text-zinc-300">Plotline: ...</span>, <span className="text-zinc-300">Сюжет: ...</span>, or <span className="text-zinc-300">Завязка: ...</span>
                  </p>
                  <p className="mt-1.5 text-zinc-500">
                    Export first, edit the CSV, then re-import. Characters are matched by id.
                    Only existing characters are updated &mdash; no new ones are created.
                  </p>
                </>
              ) : (
                <>
                  <p>Required columns: <span className="text-amber-400">from</span>, <span className="text-amber-400">to</span> (character names)</p>
                  <p>Optional: type (RIVALRY/ALLIANCE/LOVE/...), description, intensity (1-10), bidirectional (true/false)</p>
                  <code className="block mt-2 p-2 bg-zinc-900 rounded text-[11px] leading-relaxed">
                    from,to,type,description,intensity{"\n"}
                    Lord Mortenval,Guard Captain,ALLIANCE,&quot;Old allies&quot;,7{"\n"}
                    Lady Serath,Lord Mortenval,RIVALRY,&quot;Political rivals&quot;,8
                  </code>
                </>
              )}
            </div>

            {/* File upload */}
            <div
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-800/20 p-6 cursor-pointer transition-colors hover:border-zinc-600 hover:bg-zinc-800/40"
            >
              <FileSpreadsheet size={28} className="text-zinc-500 mb-2" />
              {fileName ? (
                <p className="text-sm text-zinc-300">{fileName}</p>
              ) : (
                <p className="text-sm text-zinc-500">Click to select a .csv file</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Preview table */}
            {preview.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  Preview (first {Math.min(preview.length, 10)} rows):
                </p>
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-800/50">
                        {previewHeaders.map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left text-zinc-400 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-b border-zinc-800/30">
                          {previewHeaders.map((h) => (
                            <td key={h} className="px-2 py-1 text-zinc-300 max-w-[200px] truncate">
                              {row[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Result message */}
            {importResult && (
              <div
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  importResult.success
                    ? "border-green-800 bg-green-900/20 text-green-300"
                    : "border-red-800 bg-red-900/20 text-red-300"
                }`}
              >
                {importResult.success ? (
                  <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap">{importResult.message}</p>
                  {importResult.warnings && importResult.warnings.length > 0 && (
                    <div className="mt-2 text-xs text-amber-400">
                      <p className="font-medium">Warnings:</p>
                      {importResult.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              {fileName && (
                <Button variant="ghost" onClick={resetImport}>
                  Clear
                </Button>
              )}
              <Button
                onClick={handleImport}
                disabled={!csvText || isImporting}
              >
                <Upload size={14} className="mr-1.5" />
                {isImporting
                  ? "Importing..."
                  : dataKind === "characters-matrix"
                    ? "Update characters"
                    : `Import ${dataKind}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
