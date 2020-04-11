import gql from 'graphql-tag'

export const PalletInfo = gql`
  input PalletInfo {
    id: String
    printQty: Int
  }
`
