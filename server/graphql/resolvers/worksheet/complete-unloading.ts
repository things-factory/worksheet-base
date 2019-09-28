import { ArrivalNotice, Bizplace } from '@things-factory/sales-base'
import { Inventory, InventoryHistory } from '@things-factory/warehouse-base'
import { Equal, getManager, getRepository, In, Not } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'
import { InventoryNoGenerator } from '../../../utils/inventory-no-generator'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const completeUnloading = {
  async completeUnloading(_: any, { arrivalNoticeNo }, context: any) {
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
       * 2) Insert new inventory history records
       */
      const worksheetDetails: WorksheetDetail[] = foundUnloadingWorksheet.worksheetDetails
      await Promise.all(
        worksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          const inventories: Inventory[] = await getRepository(Inventory).find({
            where: {
              domain: context.statef.domain,
              bizplace: customerBizplace,
              batchId: worksheetDetail.targetProduct.batchId,
              location: foundUnloadingWorksheet.bufferLocation
            }
          })

          await getRepository(InventoryHistory).insert(
            inventories.map((inventory: Inventory) => {
              return {
                ...inventory,
                seq: inventory.lastSeq,
                name: InventoryNoGenerator.inventoryHistoryName(),
                productId: inventory.product.id,
                warehouseId: inventory.warehouse.id,
                locationId: inventory.location.id,
                creator: context.state.user,
                updater: context.state.user
              }
            })
          )
        })
      )

      /**
       * 3. Update worksheet status (status: EXECUTING => DONE)
       */
      await getRepository(Worksheet).save({
        ...foundUnloadingWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Date.now(),
        updater: context.state.user
      })

      /**
       * 4. Check whether every related worksheet is completed
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
            name: arrivalNotice.name,
            status: ORDER_STATUS.PROCESSING
          },
          {
            status: ORDER_STATUS.READY_TO_PUTAWAY,
            updater: context.status.user
          }
        )
      }

      /**
       * 5. Create putaway worksheet
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

      await Promise.all(
        worksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          const inventories: Inventory[] = await getRepository(Inventory).find({
            where: {
              domain: context.statef.domain,
              bizplace: customerBizplace,
              batchId: worksheetDetail.targetProduct.batchId,
              location: foundUnloadingWorksheet.bufferLocation
            }
          })

          inventories.map(async (unloadedPallet: Inventory) => {
            await getRepository(WorksheetDetail).save({
              domain: context.state.domain,
              bizplace: customerBizplace,
              name: WorksheetNoGenerator.putawayDetail(),
              type: WORKSHEET_TYPE.PUTAWAY,
              worksheet: putawayWorksheet,
              targetInventory: unloadedPallet,
              fromLocation: foundUnloadingWorksheet.bufferLocation,
              status: WORKSHEET_STATUS.DEACTIVATED,
              creator: context.state.user,
              updater: context.state.user
            })
          })
        })
      )

      return foundUnloadingWorksheet
    })
  }
}
