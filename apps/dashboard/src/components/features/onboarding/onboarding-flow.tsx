'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { motion, AnimatePresence } from 'motion/react';
import gsap from 'gsap';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Building2, FolderGit2, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

export function OnboardingFlow() {
  const { organizations, selectedOrg, createOrganization, createProject } = useDashboard();
  const cardRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 20, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.2)' }
      );
    }
  }, [step]);

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
      <div ref={cardRef} className="w-full max-w-lg">
        <Card className="bg-zinc-900/90 border-zinc-800 shadow-2xl overflow-hidden backdrop-blur-xl">
          <CardHeader className="text-center pb-2 pt-8">
            <div className="mx-auto w-12 h-12 rounded-none bg-orange-500 flex items-center justify-center text-white mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-zinc-100 font-mono">
              {step === 'create-org' ? 'Welcome to Gami.Fied Community' : 'Create Your First Project'}
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
              {step === 'create-org'
                ? 'Create an Organization to start managing gamification rules, XP, and achievements.'
                : `Set up a project inside ${selectedOrg?.name || 'your organization'} to begin event ingestion.`}
            </CardDescription>

            {/* Stepper Dots */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <div
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-none border font-mono ${
                  step === 'create-org'
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                    : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
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
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-none border font-mono ${
                  step === 'create-project'
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                }`}
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                2. Project
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 pt-4">
            <AnimatePresence mode="wait">
              {step === 'create-org' ? (
                <motion.form
                  key="org-form"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  onSubmit={handleCreateOrg}
                  className="space-y-4"
                >
                  {error && (
                    <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none font-medium">
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
                </motion.form>
              ) : (
                <motion.form
                  key="project-form"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onSubmit={handleCreateProject}
                  className="space-y-4"
                >
                  {error && (
                    <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none font-medium">
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
                </motion.form>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
