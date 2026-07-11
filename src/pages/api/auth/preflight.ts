import type { NextApiRequest, NextApiResponse } from 'next';
import { getCachedPreflightStatus } from '@/lib/preflight';
import { readStoredAuthState } from '@/lib/config-store';
import { verifyRequestSession } from '@/lib/auth';
import { verifyCliToken } from '@/lib/cli-token';
import { getBootstrapRuntimeState } from '@/lib/bootstrap-state';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let runtimeState;
  let storedState;
  try {
    runtimeState = getBootstrapRuntimeState();
    storedState = await readStoredAuthState();
  } catch {
    return res.status(503).json({ error: 'preflight-state-unavailable' });
  }
  if (storedState.mode === 'invalid') {
    return res.status(503).json({ error: 'preflight-state-unavailable' });
  }

  const onboardingAdmission =
    storedState.mode === 'setup-required'
    && runtimeState.startedInSetup
    && runtimeState.claimPending;

  if (onboardingAdmission && runtimeState.initSessionRequired) {
    if (!(await verifyRequestSession(req.headers.cookie))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (!onboardingAdmission) {
    const authed = verifyCliToken(req) || (await verifyRequestSession(req.headers.cookie));
    if (!authed) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const status = await getCachedPreflightStatus();
  return res.status(200).json(status);
};

export default handler;
