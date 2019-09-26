import { ArrivalNotice, Bizplace, OrderProduct } from '@things-factory/sales-base'
import { Inventory, InventoryHistory } from '@things-factory/warehouse-base'
import { Equal, getManager, getRepository, Not } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { INVENTORY_STATUS, ORDER_PRODUCT_STATUS, ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'
import { InventoryNoGenerator } from '../../../utils/inventory-no-generator'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const completeUnloading = {
  async completeUnloading(_: any, { arrivalNoticeNo, unloadingWorksheetDetails, unloadedPallets }, context: any) {
    return await getManager().transaction(async () => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       */
      const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.PROCESSING },
        relations: ['bizplace']
      })
      const customerBizplace: Bizplace = arrivalNotice.bizplace

      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)

      const foundUnloadingWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.UNLOADING,
          arrivalNotice
        },
        relations: [
          'bufferLocation',
          'worksheetDetails',
          'worksheetDetails.targetProduct',
          'worksheetDetails.targetProduct.product'
        ]
      })

      if (!foundUnloadingWorksheet) throw new Error(`Worksheet doesn't exists.`)

      /**
       * 2.1) Assign pallets into inventories
       *    - Insert new inventory records
       */
      await getRepository(Inventory).insert(
        unloadedPallets.map((unloadedPallet: Inventory) => {
          const worksheetDetails: WorksheetDetail[] = foundUnloadingWorksheet.worksheetDetails
          const orderProduct: OrderProduct = worksheetDetails.filter(
            (wd: WorksheetDetail) => wd.targetProduct.batchId === unloadedPallet.batchId
          )[0]

          return {
            ...unloadedPallet,
            domain: context.state.domain,
            bizplace: customerBizplace,
            name: InventoryNoGenerator.inventoryName(
              foundUnloadingWorksheet.bufferLocation.name,
              unloadedPallet.batchId
            ),
            product: orderProduct.product,
            location: foundUnloadingWorksheet.bufferLocation,
            lastSeq: 0,
            status: INVENTORY_STATUS.OCCUPIED,
            creator: context.state.user,
            updater: context.state.user
          }
        })
      )

      /**
       * 2.2) Assign pallets into inventories
       *    - Insert new inventory history records
       */
      await getRepository(InventoryHistory).insert(
        unloadedPallets.map((unloadedPallet: InventoryHistory) => {
          const worksheetDetails: WorksheetDetail[] = foundUnloadingWorksheet.worksheetDetails
          const orderProduct: OrderProduct = worksheetDetails.filter(
            (worksheetDetail: WorksheetDetail) => worksheetDetail.targetProduct.batchId === unloadedPallet.batchId
          )[0]

          return {
            ...unloadedPallet,
            domain: context.state.domain,
            bizplace: customerBizplace,
            name: InventoryNoGenerator.inventoryHistoryName(),
            product: orderProduct.product,
            location: foundUnloadingWorksheet.bufferLocation,
            status: INVENTORY_STATUS.OCCUPIED,
            creator: context.state.user,
            updater: context.state.user
          }
        })
      )

      /**
       * 3. Update worksheet detail and order product
       *    - order product: Update actual qty & status
       */
      await Promise.all(
        unloadingWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          await getRepository(OrderProduct).update(
            {
              arrivalNotice,
              name: worksheetDetail.targetProduct.name
            },
            {
              actualPalletQty: worksheetDetail.targetProduct.actualPalletQty,
              actualPackQty: worksheetDetail.targetProduct.actualPackQty,
              status: ORDER_PRODUCT_STATUS.UNLOADED,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 4. Update worksheet status (status: EXECUTING => DONE)
       */
      await getRepository(Worksheet).save({
        ...foundUnloadingWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Date.now(),
        updater: context.state.user
      })

      /**
       * 5. Check whether every related worksheet is completed
       *    - if yes => Update Status of arrival notice
       */
      const relatedWorksheets: Worksheet[] = await getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: Not(Equal(WORKSHEET_STATUS.DONE)),
          arrivalNotice
        }
      })

      if (!relatedWorksheets || relatedWorksheets.length === 0) {
        await getRepository(ArrivalNotice).update(
          {
            domain: context.state.domain,
            bizplace: customerBizplace,
            name: arrivalNotice.name
          },
          {
            status: ORDER_STATUS.READY_TO_PUTAWAY,
            updater: context.status.user
          }
        )
      }

      /**
       * 6. Create putaway worksheet
       *
       */

      const putawayWorksheet = await getRepository(Worksheet).save({
        domain: context.state.domain,
        arrivalNotice: arrivalNotice,
        bizplace: customerBizplace,
        name: WorksheetNoGenerator.putaway(),
        type: WORKSHEET_TYPE.PUTAWAY,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: context.state.user,
        updater: context.state.user
      })

      await Promise.all(
        foundUnloadingWorksheet.worksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          await getRepository(WorksheetDetail).save({
            domain: context.state.domain,
            bizplace: worksheetDetail.bizplace,
            name: WorksheetNoGenerator.putawayDetail(),
            type: WORKSHEET_TYPE.PUTAWAY,
            worksheet: putawayWorksheet,
            targetProduct: worksheetDetail.targetProduct,
            creator: context.state.user,
            updater: context.state.user
          })
        })
      )

      return foundUnloadingWorksheet
    })
  }
}
