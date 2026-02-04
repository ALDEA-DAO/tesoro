import { ApolloClient, gql, InMemoryCache, useQuery } from '@apollo/client'
import type { QueryHookOptions, QueryResult } from '@apollo/client'
import type { Cardano, PaymentAddress, ShelleyProtocolParams, TransactionOutput } from '@cardano-graphql/client-ts'
import { useEffect, useState } from 'react'
import { Config, config as appConfig } from './config'

const getPolicyId = (assetId: string) => assetId.slice(0, 56)
const getAssetName = (assetId: string) => assetId.slice(56)

type Assets = Map<string, bigint>

type Value = {
  lovelace: bigint
  assets: Assets
}

const getBalanceByUTxOs = (utxos: TransactionOutput[]): Value => {
  const assets: Assets = new Map()

  utxos && utxos.forEach((utxo) => {
    utxo.tokens.forEach(({ asset, quantity }) => {
      const { policyId, assetName } = asset
      const id = policyId + assetName
      const value = (assets.get(id) ?? BigInt(0)) + BigInt(quantity)
      assets.set(id, value)
    })
  })

  return {
    lovelace: utxos.map(({ value }) => BigInt(value)).reduce((acc, v) => acc + v, BigInt(0)),
    assets
  }
}

type Query<D, V> = (options: QueryHookOptions<D, V>) => QueryResult<D, V>;
type OptionalQuery<D, V> = (options?: QueryHookOptions<D, V>) => QueryResult<D, V>;

type BlockfrostAmount = {
  unit: string
  quantity: string
}

type BlockfrostUtxo = {
  tx_hash: string
  output_index: number
  amount: BlockfrostAmount[]
}

type BlockfrostProtocolParameters = {
  min_fee_a: number
  min_fee_b: number
  pool_deposit: string
  key_deposit: string
  coins_per_utxo_size?: string
  coins_per_utxo_word?: string
  max_val_size: string
  max_tx_size: number
}

type RemoteData<T> = {
  loading: boolean
  error?: Error
  data?: T
}

const isBlockfrost = (cfg: Config): cfg is Config & { queryAPI: { type: 'blockfrost'; baseURL: string } } => {
  return cfg.queryAPI.type === 'blockfrost'
}

async function blockfrostFetchJSON<T>(cfg: Config, path: string): Promise<T> {
  if (!isBlockfrost(cfg)) throw new Error('Blockfrost is not configured')
  const url = `${cfg.queryAPI.baseURL.replace(/\/$/, '')}${path}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Blockfrost error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

const toGraphQLLikeUTxOs = (address: string, utxos: BlockfrostUtxo[]): TransactionOutput[] => {
  return utxos.map((u) => {
    const lovelace = u.amount.find((a) => a.unit === 'lovelace')?.quantity ?? '0'
    const tokens = u.amount
      .filter((a) => a.unit !== 'lovelace')
      .map((a) => ({
        asset: {
          policyId: getPolicyId(a.unit),
          assetName: getAssetName(a.unit)
        },
        quantity: a.quantity
      }))

    return {
      address,
      txHash: u.tx_hash,
      index: u.output_index,
      value: lovelace,
      tokens
    } as unknown as TransactionOutput
  })
}

const toShelleyProtocolParams = (p: BlockfrostProtocolParameters): ShelleyProtocolParams => {
  const coinsPerUtxoWord = (() => {
    if (p.coins_per_utxo_word) {
      const word = Number(p.coins_per_utxo_word)
      const size = p.coins_per_utxo_size ? Number(p.coins_per_utxo_size) : undefined

      // Some providers/endpoints expose the post-Babbage "coins per byte" value (≈4310)
      // under coins_per_utxo_word. The CML browser `min_ada_required` expects coins-per-word.
      // Heuristic: if the value looks like per-byte (< 10000) convert to per-word.
      if (!Number.isNaN(word) && word > 0 && word < 10000) {
        return (word * 8).toString()
      }

      // If both fields exist and match, treat them as per-byte and convert.
      if (size !== undefined && !Number.isNaN(size) && size === word) {
        return (word * 8).toString()
      }

      return p.coins_per_utxo_word
    }

    if (p.coins_per_utxo_size) {
      return (Number(p.coins_per_utxo_size) * 8).toString()
    }

    return undefined
  })()
  return {
    minFeeA: p.min_fee_a,
    minFeeB: p.min_fee_b,
    poolDeposit: Number(p.pool_deposit),
    keyDeposit: Number(p.key_deposit),
    coinsPerUtxoWord: coinsPerUtxoWord ? Number(coinsPerUtxoWord) : undefined,
    maxValSize: p.max_val_size,
    maxTxSize: p.max_tx_size
  } as unknown as ShelleyProtocolParams
}

function useBlockfrostAddressUTxOs(address?: string): RemoteData<{ utxos: TransactionOutput[] }> {
  const cfg = appConfig
  const [state, setState] = useState<RemoteData<{ utxos: TransactionOutput[] }>>({ loading: !!address })

  useEffect(() => {
    let cancelled = false
    if (!address || !isBlockfrost(cfg)) return

    setState({ loading: true })
    blockfrostFetchJSON<BlockfrostUtxo[]>(cfg, `/addresses/${address}/utxos`)
      .then((utxos) => {
        if (cancelled) return
        setState({ loading: false, data: { utxos: toGraphQLLikeUTxOs(address, utxos) } })
      })
      .catch((e) => {
        if (cancelled) return
        setState({ loading: false, error: e instanceof Error ? e : new Error(String(e)) })
      })

    return () => {
      cancelled = true
    }
  }, [address, cfg])

  return state
}

function useBlockfrostProtocolParameters(): RemoteData<{ protocolParameters: ShelleyProtocolParams }> {
  const cfg = appConfig
  const [state, setState] = useState<RemoteData<{ protocolParameters: ShelleyProtocolParams }>>({ loading: isBlockfrost(cfg) })

  useEffect(() => {
    let cancelled = false
    if (!isBlockfrost(cfg)) return

    setState({ loading: true })
    blockfrostFetchJSON<BlockfrostProtocolParameters>(cfg, '/epochs/latest/parameters')
      .then((p) => {
        if (cancelled) return
        setState({ loading: false, data: { protocolParameters: toShelleyProtocolParams(p) } })
      })
      .catch((e) => {
        if (cancelled) return
        setState({ loading: false, error: e instanceof Error ? e : new Error(String(e)) })
      })

    return () => {
      cancelled = true
    }
  }, [cfg])

  return state
}

const UTxOsQuery = gql`
query UTxOsByAddress($address: String!) {
  utxos(where: { address: { _eq: $address } }) {
    address
    txHash
    index
    value
    tokens {
      asset {
        policyId
        assetName
      }
      quantity
    }
  }
}`

const useAddressUTxOsQuery: Query<
  { utxos: TransactionOutput[] },
  { address: string }
> = (options) => useQuery(UTxOsQuery, options)

const PaymentAddressesQuery = gql`
query PaymentAddressByAddresses($addresses: [String]!) {
  paymentAddresses(addresses: $addresses) {
    address
    summary {
      assetBalances {
        asset {
          assetId
        }
        quantity
      }
    }
  }
}`

const usePaymentAddressesQuery: Query<
  { paymentAddresses: PaymentAddress[] },
  { addresses: string[] }
> = (options) => useQuery(PaymentAddressesQuery, options)

function getBalanceByPaymentAddresses(paymentAddresses: PaymentAddress[]): Value {
  const balance: Value = {
    lovelace: BigInt(0),
    assets: new Map()
  }

  paymentAddresses.forEach((paymentAddress) => {
    paymentAddress.summary?.assetBalances?.forEach((assetBalance) => {
      if (assetBalance) {
        const { assetId } = assetBalance.asset
        const quantity = assetBalance.quantity
        if (assetId === 'ada') {
          balance.lovelace = balance.lovelace + BigInt(quantity)
          return
        }
        const value = balance.assets.get(assetId) ?? BigInt(0)
        balance.assets.set(assetId, value + BigInt(quantity))
      }
    })
  })

  return balance
}

const ProtocolParametersQuery = gql`
query getProtocolParameters {
  cardano {
    currentEpoch {
      protocolParams {
        minFeeA
        minFeeB
        poolDeposit
        keyDeposit
        coinsPerUtxoWord
        maxValSize
        maxTxSize
      }
    }
  }
}`

const useProtocolParametersQuery: OptionalQuery<{ cardano: Cardano }, {}> = () => useQuery(ProtocolParametersQuery)

const createApolloClient = (config: Config) => new ApolloClient({
  uri: config.queryAPI.type === 'graphql' ? config.queryAPI.URI : '',
  cache: new InMemoryCache({
    typePolicies: {
      PaymentAddress: {
        keyFields: ['address']
      }
    }
  })
})

export type { Value }
export {
  createApolloClient,
  getBalanceByUTxOs,
  getPolicyId,
  getAssetName,
  getBalanceByPaymentAddresses,
  useAddressUTxOsQuery,
  useProtocolParametersQuery,
  usePaymentAddressesQuery,
  useBlockfrostAddressUTxOs,
  useBlockfrostProtocolParameters
}
