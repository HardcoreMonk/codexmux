import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getLifecycleActionService,
  type ILifecycleActionDefinition,
} from '@/lib/runtime/lifecycle-actions';

const parseLimit = (value: string | string[] | undefined): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? '20', 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(100, parsed));
};

const toPublicAction = (action: ILifecycleActionDefinition) => {
  const publicAction = { ...action };
  delete (publicAction as Partial<ILifecycleActionDefinition>).command;
  delete (publicAction as Partial<ILifecycleActionDefinition>).args;
  return publicAction;
};

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  const service = getLifecycleActionService();

  if (req.method === 'GET') {
    const [actions, events] = await Promise.all([
      Promise.resolve(service.getDefinitions().map(toPublicAction)),
      service.readAuditEvents({ limit: parseLimit(req.query.limit) }),
    ]);
    res.status(200).json({ actions, events });
    return;
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'object' && req.body !== null ? req.body as Record<string, unknown> : {};
    const actionId = typeof body.actionId === 'string' ? body.actionId : null;
    if (!actionId) {
      res.status(400).json({ error: 'action-id-required' });
      return;
    }

    const confirmation = typeof body.confirmation === 'string' ? body.confirmation : undefined;
    const result = await service.runAction({ actionId, confirmation });
    if (result.ok) {
      res.status(200).json({ event: result.event });
      return;
    }

    res.status(409).json({
      error: result.event.error ?? 'lifecycle-action-failed',
      event: result.event,
    });
    return;
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).json({ error: 'method-not-allowed' });
};

export default handler;
