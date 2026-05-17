import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { bankAccountsApi, bankStatementsApi, type BankAccount } from '../../lib/api/accounting-phase4';

type Props = {
  bankAccount: BankAccount;
  onImported: (statementId: number) => void;
  onClose: () => void;
  forceMapStep?: boolean;
};

type Step = 'upload' | 'map' | 'confirm';

export default function CsvImportWizard({ bankAccount, onImported, onClose, forceMapStep }: Props) {
  const hasExistingMapping =
    bankAccount.csvDateColumn !== null && bankAccount.csvAmountColumn !== null
    && bankAccount.csvDescriptionColumn !== null && bankAccount.csvDateFormat !== null;

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [columnCount, setColumnCount] = useState<number>(0);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Mapping state (initialized from bankAccount or defaults)
  const [csvDateColumn, setCsvDateColumn] = useState<number>(bankAccount.csvDateColumn ?? 0);
  const [csvAmountColumn, setCsvAmountColumn] = useState<number>(bankAccount.csvAmountColumn ?? 2);
  const [csvDescriptionColumn, setCsvDescriptionColumn] = useState<number>(bankAccount.csvDescriptionColumn ?? 1);
  const [csvReferenceColumn, setCsvReferenceColumn] = useState<number | null>(bankAccount.csvReferenceColumn);
  const [csvHasHeader, setCsvHasHeader] = useState<boolean>(bankAccount.csvHasHeader);
  const [csvDateFormat, setCsvDateFormat] = useState<string>(bankAccount.csvDateFormat ?? 'DD/MM/YYYY');

  const previewMut = useMutation({
    mutationFn: (f: File) => bankStatementsApi.preview(bankAccount.id, f),
    onSuccess: (r) => {
      setColumnCount(r.columnCount);
      setSampleRows(r.sampleRows);
      setStep(hasExistingMapping && !forceMapStep ? 'confirm' : 'map');
      setErr(null);
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Preview failed'),
  });

  const saveMappingMut = useMutation({
    mutationFn: () => bankAccountsApi.updateCsvMapping(bankAccount.id, {
      csvDateColumn, csvAmountColumn, csvDescriptionColumn,
      csvReferenceColumn, csvHasHeader, csvDateFormat,
    }),
    onSuccess: () => { setStep('confirm'); setErr(null); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save mapping failed'),
  });

  const importMut = useMutation({
    mutationFn: () => bankStatementsApi.import(bankAccount.id, file!),
    onSuccess: (r) => onImported(r.statementId),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Import failed'),
  });

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    previewMut.mutate(f);
  }

  const columnOptions = Array.from({ length: columnCount }, (_, i) => i);

  return (
    <div className="fixed inset-0 bg-black/30 z-30 flex items-center justify-center">
      <div className="bg-surface rounded-lg shadow-xl w-[640px] p-6 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Import CSV — {bankAccount.name}</h2>
          <span className="text-xs text-on-surface-variant">Step {step === 'upload' ? 1 : step === 'map' ? 2 : 3} of 3</span>
        </div>
        {err && <div className="text-error text-sm mb-2">{err}</div>}

        {step === 'upload' && (
          <div>
            <label className="block text-sm mb-3">CSV file
              <input type="file" accept=".csv,text/csv" onChange={onFileSelected} className="block mt-1 text-sm" />
            </label>
            {previewMut.isPending && <p className="text-sm text-on-surface-variant">Parsing…</p>}
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-2 text-sm">
            <p className="text-on-surface-variant mb-3">First 20 rows preview:</p>
            <div className="overflow-auto max-h-48 border border-outline-variant rounded mb-3 text-xs">
              <table className="w-full">
                <tbody>
                  {sampleRows.map((row, i) => (
                    <tr key={i} className="border-t border-outline-variant">
                      {row.map((cell, j) => <td key={j} className="px-2 py-1 font-mono">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="block">Date column
              <select value={csvDateColumn} onChange={(e) => setCsvDateColumn(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
                {columnOptions.map((i) => <option key={i} value={i}>Column {i}{sampleRows[0]?.[i] ? ` (${sampleRows[0][i]})` : ''}</option>)}
              </select>
            </label>
            <label className="block">Amount column
              <select value={csvAmountColumn} onChange={(e) => setCsvAmountColumn(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
                {columnOptions.map((i) => <option key={i} value={i}>Column {i}{sampleRows[0]?.[i] ? ` (${sampleRows[0][i]})` : ''}</option>)}
              </select>
            </label>
            <label className="block">Description column
              <select value={csvDescriptionColumn} onChange={(e) => setCsvDescriptionColumn(Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
                {columnOptions.map((i) => <option key={i} value={i}>Column {i}{sampleRows[0]?.[i] ? ` (${sampleRows[0][i]})` : ''}</option>)}
              </select>
            </label>
            <label className="block">Reference column (optional)
              <select value={csvReferenceColumn ?? ''} onChange={(e) => setCsvReferenceColumn(e.target.value === '' ? null : Number(e.target.value))} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
                <option value="">— none —</option>
                {columnOptions.map((i) => <option key={i} value={i}>Column {i}{sampleRows[0]?.[i] ? ` (${sampleRows[0][i]})` : ''}</option>)}
              </select>
            </label>
            <label className="block">Date format
              <select value={csvDateFormat} onChange={(e) => setCsvDateFormat(e.target.value)} className="w-full border border-outline-variant rounded px-2 py-1 mt-1">
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD-MM-YYYY">DD-MM-YYYY</option>
              </select>
            </label>
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={csvHasHeader} onChange={(e) => setCsvHasHeader(e.target.checked)} />
              <span>File has a header row</span>
            </label>
          </div>
        )}

        {step === 'confirm' && (
          <div className="text-sm">
            <p className="mb-3 text-on-surface-variant">Ready to import {sampleRows.length} previewed rows. The full file will be imported.</p>
            <div className="overflow-auto max-h-64 border border-outline-variant rounded mb-3 text-xs">
              <table className="w-full">
                <thead><tr className="bg-surface-container-low"><th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Description</th><th className="px-2 py-1 text-right">Amount</th></tr></thead>
                <tbody>
                  {(csvHasHeader ? sampleRows.slice(1) : sampleRows).map((row, i) => (
                    <tr key={i} className="border-t border-outline-variant">
                      <td className="px-2 py-1 font-mono">{row[csvDateColumn]}</td>
                      <td className="px-2 py-1">{row[csvDescriptionColumn]}</td>
                      <td className="px-2 py-1 text-right font-mono">{row[csvAmountColumn]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1 rounded border border-outline-variant text-sm">Cancel</button>
          {step === 'map' && (
            <button onClick={() => saveMappingMut.mutate()} disabled={saveMappingMut.isPending} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
              {saveMappingMut.isPending ? 'Saving…' : 'Save mapping → Confirm'}
            </button>
          )}
          {step === 'confirm' && (
            <button onClick={() => importMut.mutate()} disabled={importMut.isPending} className="px-3 py-1 rounded bg-primary text-on-primary text-sm disabled:opacity-50">
              {importMut.isPending ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
