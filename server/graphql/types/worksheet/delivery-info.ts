import { gql } from 'apollo-server-koa'

export const DeliveryInfo = gql`
  type DeliveryInfo {
    transportDriver: TransportDriver
    transportVehicle: TransportVehicle
  }
`
