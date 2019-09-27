import { ArrivalNotice, Bizplace, OrderProduct } from '@things-factory/sales-base'
import { Inventory, InventoryHistory } from '@things-factory/warehouse-base'
import { Equal, getManager, getRepository, In, InsertResult, Not } from 'typeorm'
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

      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)
      const customerBizplace: Bizplace = arrivalNotice.bizplace

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
          'bufferLocation.warehouse',
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

      const insertResult: InsertResult = await getRepository(Inventory).insert(
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
            product: orderProduct.targetProduct.product,
            warehouse: foundUnloadingWorksheet.bufferLocation.warehouse,
            location: foundUnloadingWorksheet.bufferLocation,
            zone: foundUnloadingWorksheet.bufferLocation.zone,
            packingType: orderProduct.packingType,
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
            productId: orderProduct.targetProduct.product.id,
            warehouseId: foundUnloadingWorksheet.bufferLocation.warehouse.id,
            locationId: foundUnloadingWorksheet.bufferLocation.id,
            zone: foundUnloadingWorksheet.bufferLocation.zone,
            packingType: orderProduct.packingType,
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
          type: Not(In([WORKSHEET_TYPE.VAS])),
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
       */
      const putawayWorksheet = await getRepository(Worksheet).save({
        domain: context.state.domain,
        arrivalNotice: arrivalNotice,
        bizplace: customerBizplace,
        name: WorksheetNoGenerator.putaway(),
        type: WORKSHEET_TYPE.PUTAWAY,
        status: WORKSHEET_STATUS.DEACTIVATED,
        bufferLocation: foundUnloadingWorksheet.bufferLocation,
        creator: context.state.user,
        updater: context.state.user
      })

      const inventories: Inventory[] = await getRepository(Inventory).findByIds(
        insertResult.identifiers.map(identifier => identifier.id)
      )
      await Promise.all(
        inventories.map(async (unloadedPallet: Inventory) => {
          await getRepository(WorksheetDetail).save({
            domain: context.state.domain,
            bizplace: customerBizplace,
            name: WorksheetNoGenerator.putawayDetail(),
            type: WORKSHEET_TYPE.PUTAWAY,
            worksheet: putawayWorksheet,
            targetInventory: unloadedPallet,
            fromLocation: foundUnloadingWorksheet.bufferLocation,
            creator: context.state.user,
            updater: context.state.user
          })
        })
      )

      return foundUnloadingWorksheet
    })
  }
}
