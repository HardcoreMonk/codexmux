import type { NextApiRequest, NextApiResponse } from 'next';
import { markDeviceVisible, markDeviceHidden } from '@/lib/push-subscriptions';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { deviceId, visible } = req.body ?? {};
  if (!deviceId || typeof visible !== 'boolean') {
    return res.status(400).json({ error: 'Invalid body' });
  }

  if (visible) {
    markDeviceVisible(deviceId);
  } else {
    markDeviceHidden(deviceId);
  }

  return res.status(200).json({ ok: true });
};

export default handler;
