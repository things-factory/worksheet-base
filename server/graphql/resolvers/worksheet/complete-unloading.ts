import { ArrivalNotice, Bizplace, ORDER_STATUS } from '@things-factory/sales-base'
import { Inventory, InventoryHistory } from '@things-factory/warehouse-base'
import { Equal, getManager, getRepository, In, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const completeUnloading = {
  async completeUnloading(_: any, { arrivalNoticeNo, worksheetDetails }, context: any) {
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

      const foundWorksheet: Worksheet = await getRepository(Worksheet).findOne({
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
          'worksheetDetails.targetProduct.product',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.product',
          'worksheetDetails.targetInventory.warehouse',
          'worksheetDetails.targetInventory.location',
          'worksheetDetails.updater',
          'worksheetDetails.creator'
        ]
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists.`)

      /**
       * 2) Insert new inventory history records
       */
      const foundWorksheetDetails: WorksheetDetail[] = foundWorksheet.worksheetDetails
      await Promise.all(
        foundWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          const inventories: Inventory[] = await getRepository(Inventory).find({
            where: {
              domain: context.state.domain,
              bizplace: customerBizplace,
              batchId: worksheetDetail.targetProduct.batchId,
              location: foundWorksheet.bufferLocation
            },
            relations: ['product', 'warehouse', 'location']
          })

          await getRepository(InventoryHistory).insert(
            inventories.map((inventory: Inventory) => {
              return {
                ...inventory,
                seq: inventory.lastSeq,
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
        ...foundWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Date.now(),
        updater: context.state.user
      })

      /**
       * 4. Update worksheet detail status (EXECUTING => DONE) & issue note
       */
      await Promise.all(
        foundWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          const patchedWD: WorksheetDetail = worksheetDetails.filter(
            (patchedWD: WorksheetDetail) => patchedWD.name === worksheetDetail.name
          )[0]
          if (patchedWD.issue) worksheetDetail.issue = patchedWD.issue

          await getRepository(WorksheetDetail).save({
            ...worksheetDetail,
            status: WORKSHEET_STATUS.DONE,
            updater: context.state.user
          })
        })
      )

      /**
       * 4. Check whether every related worksheet is completed
       *    - if yes => Update Status of arrival notice
       *    - VAS doesn't affect to status of arrival notice
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

      if (relatedWorksheets.length === 0) {
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
        bufferLocation: foundWorksheet.bufferLocation,
        creator: context.state.user,
        updater: context.state.user
      })

      await Promise.all(
        foundWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          const inventories: Inventory[] = await getRepository(Inventory).find({
            where: {
              domain: context.state.domain,
              bizplace: customerBizplace,
              batchId: worksheetDetail.targetProduct.batchId,
              location: foundWorksheet.bufferLocation
            },
            relations: ['product', 'warehouse', 'location']
          })

          await Promise.all(
            inventories.map(async (inventory: Inventory) => {
              await getRepository(WorksheetDetail).save({
                domain: context.state.domain,
                bizplace: customerBizplace,
                name: WorksheetNoGenerator.putawayDetail(),
                type: WORKSHEET_TYPE.PUTAWAY,
                worksheet: putawayWorksheet,
                targetInventory: inventory,
                fromLocation: foundWorksheet.bufferLocation,
                status: WORKSHEET_STATUS.DEACTIVATED,
                creator: context.state.user,
                updater: context.state.user
              })

              await getRepository(InventoryHistory).insert({
                domain: context.state.domain,
                bizplace: customerBizplace,
                name: inventory.name,
                palletId: inventory.palletId,
                batchId: inventory.batchId,
                packingType: inventory.packingType,
                qty: inventory.qty,
                productId: inventory.product.id,
                warehouseId: inventory.warehouse.id,
                locationId: inventory.location.id,
                zone: inventory.zone,
                status: inventory.status,
                creator: inventory.creator,
                updater: inventory.updater
              })
            })
          )
        })
      )

      return foundWorksheet
    })
  }
}
