import type { NextApiRequest, NextApiResponse } from 'next'

const getBaseURL = (isMainnet: boolean): string => {
  return isMainnet
    ? 'https://cardano-mainnet.blockfrost.io/api/v0'
    : 'https://cardano-testnet.blockfrost.io/api/v0'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = process.env.BLOCKFROST_PROJECT_ID
  if (!projectId) {
    res.status(500).json({ error: 'Missing BLOCKFROST_PROJECT_ID' })
    return
  }

  const isMainnet = !process.env.NEXT_PUBLIC_TESTNET
  const baseURL = getBaseURL(isMainnet)

  const pathParts = req.query.path
  const path = Array.isArray(pathParts) ? pathParts.join('/') : ''
  const url = `${baseURL}/${path}`

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        project_id: projectId
      }
    })

    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('content-type', contentType)

    const text = await upstream.text()
    res.status(upstream.status).send(text)
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
