import { createContext } from 'react'

type GraphQL = {
  type: 'graphql'
  URI: string
}

type Blockfrost = {
  type: 'blockfrost'
  baseURL: string
}

type QueryAPI = GraphQL | Blockfrost

type Config = {
  isMainnet: boolean
  queryAPI: QueryAPI
  submitAPI: string
  gunPeers: string[]
}

const defaultGraphQLMainnet = 'https://graphql-api.mainnet.dandelion.link'
const defaultGraphQLTestnet = 'https://graphql-api.testnet.dandelion.link'
const defaultSubmitURIMainnet = 'https://adao.panl.org'
const defaultSubmitURITestnet = 'https://testrelay1.panl.org'
const defaultBlockfrostProxy = '/api/blockfrost'

const defaultConfig: Config = {
  isMainnet: true,
  queryAPI: { type: 'graphql', URI: defaultGraphQLMainnet },
  submitAPI: defaultSubmitURIMainnet,
  gunPeers: []
}

const createConfig = (): Config => {
  const isMainnet = !process.env.NEXT_PUBLIC_TESTNET
  const forceBlockfrost = !!process.env.NEXT_PUBLIC_FORCE_BLOCKFROST
  const defaultGraphQL = isMainnet ? defaultGraphQLMainnet : defaultGraphQLTestnet
  const defaultSubmitURI = isMainnet ? defaultSubmitURIMainnet : defaultSubmitURITestnet
  const grapQLURI = process.env.NEXT_PUBLIC_GRAPHQL ?? defaultGraphQL
  const submitURI = process.env.NEXT_PUBLIC_SUBMIT ?? defaultSubmitURI
  const gunPeers = (process.env.NEXT_PUBLIC_GUN ?? '').split(';')

  const blockfrostBaseURL = process.env.NEXT_PUBLIC_BLOCKFROST_URL ?? defaultBlockfrostProxy

  return {
    isMainnet,
    queryAPI: forceBlockfrost
      ? { type: 'blockfrost', baseURL: blockfrostBaseURL }
      : { type: 'graphql', URI: grapQLURI },
    submitAPI: submitURI,
    gunPeers
  }
}

const config = createConfig()

const ConfigContext = createContext<[Config, (x: Config) => void]>([defaultConfig, (_) => { }])

export type { Config }
export { ConfigContext, config }
