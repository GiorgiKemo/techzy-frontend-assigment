import { loadEnvFile } from '../../server/lib/env.mjs'
import { handleSendPasswordReset } from '../../server/routes/emailProxy.mjs'

loadEnvFile()

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed.' })
  return handleSendPasswordReset(req, res)
}
