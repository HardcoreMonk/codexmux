import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  IGovernanceAuditCandidate,
  IGovernanceWorkerHealth,
  IApprovedProjectRoot,
  IManagedProject,
  IProjectDocumentDetail,
  IProjectDocumentRef,
  IProjectGovernanceSummary,
  IProjectLifecycleSnapshot,
} from '@/lib/governance/contracts';

const readJson = async <T>(response: Response): Promise<T> => {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw Object.assign(new Error(payload.error ?? `HTTP ${response.status}`), {
      code: payload.error ?? 'governance-request-failed',
    });
  }
  return payload;
};

const fetchJson = async <T>(url: string): Promise<T> => readJson<T>(await fetch(url));

const errorCode = (error: unknown): string => {
  if (error && typeof error === 'object' && 'code' in error) return String(error.code);
  return 'governance-request-failed';
};

const useManagedProjects = () => {
  const [projects, setProjects] = useState<IManagedProject[]>([]);
  const [roots, setRoots] = useState<IApprovedProjectRoot[]>([]);
  const [health, setHealth] = useState<IGovernanceWorkerHealth | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [summary, setSummary] = useState<IProjectGovernanceSummary | null>(null);
  const [documents, setDocuments] = useState<IProjectDocumentRef[]>([]);
  const [lifecycle, setLifecycle] = useState<IProjectLifecycleSnapshot | null>(null);
  const [audit, setAudit] = useState<IGovernanceAuditCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentDetail, setDocumentDetail] = useState<IProjectDocumentDetail | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const projectRequestId = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await readJson<{
        projects: IManagedProject[];
        roots: IApprovedProjectRoot[];
        health: IGovernanceWorkerHealth;
      }>(await fetch('/api/governance/projects'));
      setProjects(result.projects);
      setRoots(result.roots);
      setHealth(result.health);
      setSelectedProjectId((current) =>
        current && result.projects.some((project) => project.id === current)
          ? current
          : result.projects[0]?.id ?? null);
      setProjectRevision((current) => current + 1);
    } catch (requestError) {
      setError(errorCode(requestError));
      setHealth({ state: 'degraded', writeState: 'degraded', indexedProjects: 0, lastIndexedAt: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSummary(null);
      setDocuments([]);
      setLifecycle(null);
      setAudit([]);
      return;
    }
    const requestId = ++projectRequestId.current;
    setLoading(true);
    setError(null);
    const projectId = encodeURIComponent(selectedProjectId);
    void Promise.all([
      fetchJson<IProjectGovernanceSummary>(`/api/governance/projects/${projectId}/summary`),
      fetchJson<{ documents: IProjectDocumentRef[] }>(`/api/governance/projects/${projectId}/documents`),
      fetchJson<IProjectLifecycleSnapshot>(`/api/governance/projects/${projectId}/lifecycle`),
      fetchJson<{ candidates: IGovernanceAuditCandidate[] }>(`/api/governance/projects/${projectId}/audit`),
    ]).then(([nextSummary, nextDocuments, nextLifecycle, nextAudit]) => {
      if (projectRequestId.current !== requestId) return;
      setSummary(nextSummary);
      setDocuments(nextDocuments.documents);
      setLifecycle(nextLifecycle);
      setAudit(nextAudit.candidates);
    }).catch((requestError) => {
      if (projectRequestId.current === requestId) setError(errorCode(requestError));
    }).finally(() => {
      if (projectRequestId.current === requestId) setLoading(false);
    });
  }, [projectRevision, selectedProjectId]);

  const openDocument = useCallback(async (documentPath: string) => {
    if (!selectedProjectId) return;
    setDocumentDetail(null);
    setDocumentError(null);
    setDocumentLoading(true);
    try {
      const query = new URLSearchParams({ path: documentPath });
      const projectId = encodeURIComponent(selectedProjectId);
      const detail = await readJson<IProjectDocumentDetail>(
        await fetch(`/api/governance/projects/${projectId}/documents?${query.toString()}`),
      );
      setDocumentDetail(detail);
    } catch (requestError) {
      setDocumentError(errorCode(requestError));
    } finally {
      setDocumentLoading(false);
    }
  }, [selectedProjectId]);

  const closeDocument = useCallback(() => {
    setDocumentDetail(null);
    setDocumentError(null);
    setDocumentLoading(false);
  }, []);

  return {
    projects,
    roots,
    health,
    selectedProjectId,
    setSelectedProjectId,
    summary,
    documents,
    lifecycle,
    audit,
    loading,
    error,
    refresh,
    openDocument,
    documentDetail,
    documentLoading,
    documentError,
    closeDocument,
  };
};

export default useManagedProjects;
