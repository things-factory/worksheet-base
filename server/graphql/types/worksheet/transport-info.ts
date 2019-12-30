import { gql } from 'apollo-server-koa'

export const TransportInfo = gql`
  type TransportInfo {
    releaseGoodNo: String
    transportDriver: TransportDriver
    transportVehicle: TransportVehicle
  }
`
