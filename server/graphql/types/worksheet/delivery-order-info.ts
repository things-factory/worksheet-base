import { gql } from 'apollo-server-koa'

export const DeliveryOrderInfo = gql`
  type DeliveryOrderInfo {
    customerBizplace: String
    truckNo: String
    deliveryDate: String
    partnerBizplace: String
    domainBizplace: String
    reportPath: String
    logoPath: String
    domainBrn: String
    updaterName: String
    driverName: String
    palletQty: String
    ownCollection: Boolean
    domainAddress: String
    releaseGoodNo: String
    to: String
    doStatus: String
  }
`
