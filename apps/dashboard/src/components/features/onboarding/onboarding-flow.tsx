'use client';

import React, { useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Building2, FolderGit2, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

export function OnboardingFlow() {
  const { organizations, selectedOrg, createOrganization, createProject } = useDashboard();

  const [step, setStep] = useState<'create-org' | 'create-project'>(
    organizations.length === 0 ? 'create-org' : 'create-project'
  );

  // Org form state
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  // Project form state
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await createOrganization(orgName, orgSlug);
      setStep('create-project');
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) {
      setError('Please select or create an organization first');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await createProject(selectedOrg.id, projectName, projectSlug);
      // Flow completes, selectedProject is automatically set in context!
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div key={step} className="w-full max-w-lg animate-rise">
        <Card className="bg-zinc-900/90 border-zinc-800 shadow-2xl overflow-hidden">
          <CardHeader className="text-center pb-2 pt-8">
            <div className="mx-auto w-12 h-12 rounded-none bg-brand-500 flex items-center justify-center text-on-accent mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-zinc-100">
              {step === 'create-org' ? 'Welcome to Gami.Fied' : 'Create Your First Project'}
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
              {step === 'create-org'
                ? 'Create an Organization to start managing gamification rules, XP, and achievements.'
                : `Set up a project inside ${selectedOrg?.name || 'your organization'} to begin event ingestion.`}
            </CardDescription>

            {/* Stepper Dots */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <div
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-none border ${
                  step === 'create-org'
                    ? 'bg-brand-500/20 text-brand-400 border-brand-500/30'
                    : 'bg-success-950/40 text-success-400 border-success-800/40'
                }`}
              >
                {step === 'create-project' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Building2 className="w-3.5 h-3.5" />
                )}
                1. Organization
              </div>
              <div className="w-4 h-px bg-zinc-800" />
              <div
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-none border ${
                  step === 'create-project'
                    ? 'bg-brand-500/20 text-brand-400 border-brand-500/30'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                }`}
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                2. Project
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 pt-4">
              {step === 'create-org' ? (
                <form
                  key="org-form"
                  onSubmit={handleCreateOrg}
                  className="animate-rise space-y-4">
                  {error && (
                    <div className="p-3 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs rounded-none font-medium">
                      {error}
                    </div>
                  )}

                  <Input
                    label="Organization Name"
                    placeholder="e.g. Acme Corp"
                    value={orgName}
                    onChange={(e) => {
                      setOrgName(e.target.value);
                      if (!orgSlug)
                        setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                    }}
                    required
                  />

                  <Input
                    label="Organization Slug"
                    placeholder="e.g. acme-corp"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value)}
                    required
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={loading}
                    className="w-full mt-2"
                  >
                    Create Organization & Continue
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              ) : (
                <form
                  key="project-form"
                  onSubmit={handleCreateProject}
                  className="animate-rise space-y-4">
                  {error && (
                    <div className="p-3 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs rounded-none font-medium">
                      {error}
                    </div>
                  )}

                  <Input
                    label="Project Name"
                    placeholder="e.g. Production App"
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value);
                      if (!projectSlug)
                        setProjectSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                    }}
                    required
                  />

                  <Input
                    label="Project Slug"
                    placeholder="e.g. production-app"
                    value={projectSlug}
                    onChange={(e) => setProjectSlug(e.target.value)}
                    required
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={loading}
                    className="w-full mt-2"
                  >
                    Create Project & Launch Dashboard
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
