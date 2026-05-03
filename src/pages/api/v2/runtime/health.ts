import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyRuntimeV2ApiAuth } from '@/lib/runtime/api-auth';
import { sendRuntimeApiError, sendRuntimeDisabled } from '@/lib/runtime/api-handler';
import { getRuntimeSupervisor } from '@/lib/runtime/supervisor';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.CODEXMUX_RUNTIME_V2 !== '1') {
    return sendRuntimeDisabled(res);
  }

  if (!(await verifyRuntimeV2ApiAuth(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supervisor = getRuntimeSupervisor();
    await supervisor.ensureStarted();
    const health = await supervisor.health();
    return res.status(200).json(health);
  } catch (err) {
    return sendRuntimeApiError(res, err);
  }
};

export default handler;
