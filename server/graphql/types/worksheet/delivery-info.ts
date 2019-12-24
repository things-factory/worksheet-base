import { gql } from 'apollo-server-koa'

export const DeliveryInfo = gql`
  type DeliveryInfo {
    deliveryOrder: DeliveryOrder
    transportDriver: TransportDriver
    transportVehicle: TransportVehicle
  }
`
