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
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  gameId: string;
  onImported: () => void;
}

type Tab = "export" | "import";
type DataKind = "characters" | "relationships";

export function CsvPanel({ open, onClose, gameId, onImported }: Props) {
  const [tab, setTab] = useState<Tab>("export");
  const [dataKind, setDataKind] = useState<DataKind>("characters");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    warnings?: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportChars = trpc.csv.exportCharacters.useQuery(
    { gameId },
    { enabled: open && tab === "export" && dataKind === "characters" }
  );
  const exportRels = trpc.csv.exportRelationships.useQuery(
    { gameId },
    { enabled: open && tab === "export" && dataKind === "relationships" }
  );

  const importChars = trpc.csv.importCharacters.useMutation({
    onSuccess: (data) => {
      setImportResult({ success: true, message: `Imported ${data.imported} characters.` });
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

  const handleDownload = () => {
    const data = dataKind === "characters" ? exportChars.data : exportRels.data;
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

  const exportData = dataKind === "characters" ? exportChars.data : exportRels.data;
  const isImporting = importChars.isPending || importRels.isPending;
  const previewHeaders = preview.length > 0 ? Object.keys(preview[0]) : [];

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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {dataKind === "characters" ? "Character data" : "Relationship data"}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {exportData
                      ? `${exportData.count} ${dataKind} ready to export`
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
                  : `Import ${dataKind}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
