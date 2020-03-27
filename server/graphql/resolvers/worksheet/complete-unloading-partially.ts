import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderProduct, ORDER_PRODUCT_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager, Repository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'

export const completeUnloadingPartiallyResolver = {
  async completeUnloadingPartially(_: any, { arrivalNoticeNo, worksheetDetail }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const ganRepo: Repository<ArrivalNotice> = trxMgr.getRepository(ArrivalNotice)
      const wsRepo: Repository<Worksheet> = trxMgr.getRepository(Worksheet)
      const wsdRepo: Repository<WorksheetDetail> = trxMgr.getRepository(WorksheetDetail)
      const ordProdRepo: Repository<OrderProduct> = trxMgr.getRepository(OrderProduct)
      const invRepo: Repository<Inventory> = trxMgr.getRepository(Inventory)
      /**
       * @description
       * Do validation for arrival notice
       * - whether it's exists
       * - whether it has proper status (PROCESSING)
       */
      const domain: Domain = context.state.domain
      const user: User = context.state.user
      const arrivalNotice: ArrivalNotice = await ganRepo.findOne({
        where: { domain, name: arrivalNoticeNo, status: ORDER_STATUS.PROCESSING },
        relations: ['bizplace', 'orderProducts']
      })
      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)

      const bizplace: Bizplace = arrivalNotice.bizplace
      /**
       * @description
       * Do validation for worksheet
       * - whether it's exists
       * - whether it has proper status (EXECUTING) and type (UNLOADING)
       */

      const foundWS: Worksheet = await wsRepo.findOne({
        where: {
          domain,
          bizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.UNLOADING
        },
        relations: ['bufferLocation', 'worksheetDetails', 'worksheetDetails.targetProduct']
      })
      if (!foundWS) throw new Error(`Worksheet doesn't exists.`)

      let foundWSD: WorksheetDetail = foundWS.worksheetDetails.find(
        (foundWSD: WorksheetDetail) => foundWSD.name === worksheetDetail.name
      )

      /**
       * @description
       * Update status and issue if it's exists
       * Althought there's no more remain (packQty === actualPackQty of order product) products,
       * status should be updated to PARTIALLY_UNLOADED
       * Because system can't assume whether there are extra products or not
       */
      if (worksheetDetail.issue) foundWSD.issue = worksheetDetail.issue
      await wsdRepo.save({
        ...foundWSD,
        status: WORKSHEET_STATUS.PARTIALLY_UNLOADED,
        updater: user
      })

      const orderProduct: OrderProduct = foundWSD.targetProduct
      await ordProdRepo.save({
        ...orderProduct,
        status: ORDER_PRODUCT_STATUS.PARTIALLY_UNLOADED
      })

      /**
       * @description
       * Update status of inventories to PARTIALLY_UNLOADED
       */
      let inventories: Inventory[] = await invRepo.find({
        where: { domain, refOrderId: arrivalNotice.id, orderProduct }
      })
      inventories = inventories.map((inv: Inventory) => {
        return {
          ...inv,
          status: INVENTORY_STATUS.PARTIALLY_UNLOADED,
          updater: user
        }
      })

      await invRepo.save(inventories)
    })
  }
}
