import { gql } from 'apollo-server-koa'

export const DeliveryOrderInfo = gql`
  type DeliveryOrderInfo {
    customerBizplace: String
    attachments: [Attachment]
    truckNo: String
    transportVehicle: TransportVehicle
    deliveryDate: String
    partnerBizplace: String
    domainBizplace: String
    releaseGoodNo: String
    to: String
    vehicleName: String
    updaterName: String
    doStatus: String
  }
`
