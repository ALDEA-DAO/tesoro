import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { ConfigContext, config } from '../cardano/config'
import Head from 'next/head'
import { NotificationContext, useNotification } from '../components/notification'
import { ApolloProvider } from '@apollo/client'
import { createApolloClient } from '../cardano/query-api'

function MyApp({ Component, pageProps }: AppProps) {
  const notification = useNotification()
  const shouldUseApollo = config.queryAPI.type === 'graphql'
  const apolloClient = shouldUseApollo ? createApolloClient(config) : undefined

  return (
    <ConfigContext.Provider value={[config, () => { }]}>
      <NotificationContext.Provider value={notification}>
        {shouldUseApollo && apolloClient ? (
          <ApolloProvider client={apolloClient}>
            <Head>
              <title>{config.isMainnet ? 'ALDEA Tesoro' : 'ALDEA Tesoro - Testnet'}</title>
            </Head>
            <Component {...pageProps} />
          </ApolloProvider>
        ) : (
          <>
            <Head>
              <title>{config.isMainnet ? 'ALDEA Tesoro' : 'ALDEA Tesoro - Testnet'}</title>
            </Head>
            <Component {...pageProps} />
          </>
        )}
      </NotificationContext.Provider>
    </ConfigContext.Provider>
  )
}

export default MyApp
