'use client';

import { Dialog } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api-client';
import React, { useState } from 'react';
import { useDashboard } from '@/components/features/context/dashboard-context';
import { useToast } from '@/components/ui/toast';
import {
  Download,
  Upload,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';

interface ImportValidation {
  valid?: boolean;
  error?: string;
  manifest?: { organizationName?: string };
  remappingPlan?: { projectsToCreate?: number; usersToImport?: number; eventsToImport?: number };
}

export default function OrganizationDataPage() {
  const { selectedOrg } = useDashboard();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileContent, setImportFileContent] = useState<unknown>(null);
  const [validationResult, setValidationResult] = useState<ImportValidation | null>(null);
  const [importing, setImporting] = useState(false);

  const handleExportData = async () => {
    if (!selectedOrg?.id) return;
    setExporting(true);
    try {
      const res = await apiFetch(`/api/v1/organizations/${selectedOrg.id}/export`, {
        method: 'POST',
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gami-org-export-${selectedOrg.slug || 'org'}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success('Logical export downloaded successfully');
      } else {
        let errMsg = 'Export failed';
        try {
          const errData = await res.json();
          errMsg = errData.message || errData.error?.message || errData.error || errMsg;
        } catch {
          // Keep the default message when the response is not JSON
        }
        toast.error('Export failed', errMsg);
      }
    } catch (err: unknown) {
      toast.error('Export error', (err as Error)?.message || 'Network error executing export');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = JSON.parse(evt.target?.result as string);
        setImportFileContent(content);

        // Run Dry-Run Validation
        const res = await apiFetch(`/api/v1/organizations/${selectedOrg?.id}/import/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(content),
        });
        if (res.ok) {
          const valData = await res.json();
          setValidationResult(valData);
        } else {
          setValidationResult({
            valid: false,
            error: 'Invalid organization export payload format',
          });
        }
      } catch {
        setValidationResult({ valid: false, error: 'Failed to parse JSON file' });
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!selectedOrg?.id || !importFileContent) return;
    setImporting(true);
    try {
      const res = await apiFetch(`/api/v1/organizations/${selectedOrg.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importFileContent),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          'Import completed successfully',
          `Projects: ${data.importedCount?.projects || 0}, Users: ${data.importedCount?.users || 0}`
        );
        setShowImportModal(false);
        setImportFileContent(null);
        setValidationResult(null);
      } else {
        toast.error('Import failed', 'Please review dry-run validation log.');
      }
    } catch (err: unknown) {
      toast.error('Import error', (err as Error)?.message || 'Network error executing import');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Data"
        description="Export your organization's data, or import an export from another instance."
      />

      {/* Security Shield Banner */}
      <div className="bg-zinc-900/60 border border-success-500/30 p-4 rounded-none flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-success-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300 space-y-1">
          <p className="font-semibold text-success-300">
            Exports never include secrets or other organizations' data
          </p>
          <p className="text-zinc-400">
            Logical exports contain exclusively data belonging to{' '}
            <span className="text-white font-semibold">
              {selectedOrg?.name || 'your organization'}
            </span>
            . All sensitive security artifacts (password hashes, API key secrets, SMTP passwords,
            session tokens) are strictly redacted. Imports perform deterministic ID remapping to
            ensure target tenant isolation.
          </p>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Card */}
        <div className="bg-zinc-950 border border-zinc-800 p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Download className="w-5 h-5 text-brand-400" />
              <h2 className="text-sm font-bold text-white">Export Organization Data</h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Download a complete versioned JSON archive containing project settings, end users,
              events, XP history, levels, achievements, challenges, rules, and integration metadata.
            </p>
          </div>

          <button
            onClick={handleExportData}
            disabled={exporting}
            className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-black text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {exporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating Export Package...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Logical Data (JSON)
              </>
            )}
          </button>
        </div>

        {/* Import Card */}
        <div className="bg-zinc-950 border border-zinc-800 p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Upload className="w-5 h-5 text-info-400" />
              <h2 className="text-sm font-bold text-white">Import Organization Data</h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Import a validated <span className="text-zinc-200">gami-organization-export</span>{' '}
              package into this organization. Dry-run validation prevents ID collisions and
              cross-tenant reference leakage.
            </p>
          </div>

          <button
            onClick={() => setShowImportModal(true)}
            className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold flex items-center justify-center gap-2 transition"
          >
            <Upload className="w-4 h-4 text-info-400" />
            Validate & Import Data
          </button>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <Dialog
          isOpen
          onClose={() => setShowImportModal(false)}
          title="Import organization data"
          maxWidth="xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowImportModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleExecuteImport}
                disabled={!validationResult?.valid}
                isLoading={importing}
              >
                Import data
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label
              htmlFor="page-select-export-package-json"
              className="block text-xs text-zinc-300"
            >
              Select Export Package (.json):
            </label>
            <input
              id="page-select-export-package-json"
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block w-full text-xs text-zinc-400 file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
            />
          </div>

          {validationResult && (
            <div className="space-y-3 bg-zinc-900 border border-zinc-800 p-4">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                {validationResult.valid ? (
                  <span className="text-success-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Dry-Run Validation Passed
                  </span>
                ) : (
                  <span className="text-danger-400 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> Validation Failed
                  </span>
                )}
              </h4>

              {validationResult.valid && (
                <div className="text-xs text-zinc-300 space-y-1">
                  <p>
                    Format:{' '}
                    <span className="text-brand-400">
                      {validationResult.manifest?.organizationName || 'Export'}
                    </span>
                  </p>
                  <p>Remapping Plan:</p>
                  <ul className="list-disc list-inside text-zinc-400 text-[11px] space-y-0.5">
                    <li>Projects to create: {validationResult.remappingPlan?.projectsToCreate}</li>
                    <li>End Users to import: {validationResult.remappingPlan?.usersToImport}</li>
                    <li>Events to import: {validationResult.remappingPlan?.eventsToImport}</li>
                  </ul>
                </div>
              )}

              {validationResult.error && (
                <p className="text-xs text-danger-400">{validationResult.error}</p>
              )}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
