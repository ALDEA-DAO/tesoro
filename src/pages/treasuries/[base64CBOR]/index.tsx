import type { NativeScript } from '@dcspark/cardano-multiplatform-lib-browser'
import { NextPage } from 'next'
import { useRouter } from 'next/router'
import { getResult, useCardanoMultiplatformLib } from '../../../cardano/multiplatform-lib'
import type { Cardano } from '../../../cardano/multiplatform-lib'
import { Layout, Panel } from '../../../components/layout'
import { ErrorMessage, Loading } from '../../../components/status'
import { NativeScriptInfoViewer, NativeScriptViewer } from '../../../components/transaction'
import Link from 'next/link'
import { useContext } from 'react'
import { ConfigContext } from '../../../cardano/config'
import { getAssetName, getBalanceByPaymentAddresses, getBalanceByUTxOs, getPolicyId, useBlockfrostAddressUTxOs, usePaymentAddressesQuery } from '../../../cardano/query-api'
import { ADAAmount, AssetAmount } from '../../../components/currency'
import { getTreasuryPath } from '../../../route'

const ShowBalance: NextPage<{
  cardano: Cardano
  script: NativeScript
  className?: string
}> = ({ cardano, script, className }) => {
  const [config, _] = useContext(ConfigContext)
  const isBlockfrost = config.queryAPI.type === 'blockfrost'

  if (isBlockfrost) {
    return <ShowBalanceBlockfrost cardano={cardano} script={script} className={className} />
  }

  return <ShowBalanceGraphQL cardano={cardano} script={script} className={className} />

}

const ShowBalanceGraphQL: NextPage<{
  cardano: Cardano
  script: NativeScript
  className?: string
}> = ({ cardano, script, className }) => {
  const [config, _] = useContext(ConfigContext)
  const address = cardano.getScriptAddress(script, config.isMainnet).to_bech32()
  const { loading, error, data } = usePaymentAddressesQuery({ variables: { addresses: [address] }, fetchPolicy: 'network-only' })

  if (loading) return null
  if (error) return null

  const paymentAddresses = data?.paymentAddresses
  if (!paymentAddresses) return null

  const balance = getBalanceByPaymentAddresses(paymentAddresses)

  return (
    <div className={className}>
      <div className='font-semibold'>Balance</div>
      <ul className='divide-y rounded border'>
        <li className='p-2'><ADAAmount lovelace={balance.lovelace} /></li>
        {Array.from(balance.assets).map(([id, quantity]) => {
          const symbol = Buffer.from(getAssetName(id), 'hex').toString('ascii')
          return (
            <li key={id} className='p-2'>
              <AssetAmount
                quantity={quantity}
                decimals={0}
                symbol={symbol} />
              <div className='space-x-1'>
                <span>Policy ID:</span>
                <span>{getPolicyId(id)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const ShowBalanceBlockfrost: NextPage<{
  cardano: Cardano
  script: NativeScript
  className?: string
}> = ({ cardano, script, className }) => {
  const [config, _] = useContext(ConfigContext)
  const address = cardano.getScriptAddress(script, config.isMainnet).to_bech32()
  const { loading, error, data } = useBlockfrostAddressUTxOs(address)

  if (loading) return null
  if (error) return null

  const utxos = data?.utxos
  if (!utxos) return null

  const balance = getBalanceByUTxOs(utxos)

  return (
    <div className={className}>
      <div className='font-semibold'>Balance</div>
      <ul className='divide-y rounded border'>
        <li className='p-2'><ADAAmount lovelace={balance.lovelace} /></li>
        {Array.from(balance.assets).map(([id, quantity]) => {
          const symbol = Buffer.from(getAssetName(id), 'hex').toString('ascii')
          return (
            <li key={id} className='p-2'>
              <AssetAmount
                quantity={quantity}
                decimals={0}
                symbol={symbol} />
              <div className='space-x-1'>
                <span>Policy ID:</span>
                <span>{getPolicyId(id)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const ShowTreasury: NextPage<{
  cardano: Cardano
  script: NativeScript
}> = ({ cardano, script }) => {
  return (
    <Panel>
      <div className='p-4 space-y-2'>
        <NativeScriptInfoViewer cardano={cardano} className='space-y-1' script={script} />
        <NativeScriptViewer className='space-y-2' cardano={cardano} script={script} />
        <ShowBalance cardano={cardano} script={script} />
      </div>
      <footer className='flex justify-end p-4 bg-gray-100 space-x-2'>
        <Link href={getTreasuryPath(script, 'edit')}>
          <a className='px-4 py-2 border text-sky-700 rounded'>Edit Info</a>
        </Link>
        <Link href={getTreasuryPath(script, 'new')}>
          <a className='px-4 py-2 border text-white bg-sky-700 rounded'>Create Transaction</a>
        </Link>
      </footer>
    </Panel>
  )
}

const GetTreasury: NextPage = () => {
  const router = useRouter()
  const { base64CBOR } = router.query
  const cardano = useCardanoMultiplatformLib()

  if (!cardano) return <Loading />;
  if (typeof base64CBOR !== 'string') return <ErrorMessage>Invalid URL</ErrorMessage>;
  const scriptBytes = Uint8Array.from(Buffer.from(base64CBOR, 'base64'))
  const parseResult = getResult(() => cardano.lib.NativeScript.from_bytes(scriptBytes))
  if (!parseResult.isOk) return <ErrorMessage>Invalid script</ErrorMessage>;
  const script = parseResult.data

  return (
    <Layout>
      <ShowTreasury cardano={cardano} script={script} />
    </Layout>
  )
}

export default GetTreasury
