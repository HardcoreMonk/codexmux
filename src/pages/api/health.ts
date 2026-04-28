import type { NextApiRequest, NextApiResponse } from 'next';

const handler = (_req: NextApiRequest, res: NextApiResponse) => {
  res.json({ app: 'codexmux' });
};

export default handler;
