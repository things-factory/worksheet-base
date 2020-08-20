import { User } from '@things-factory/auth-base'
import { ArrivalNotice, OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import {
  Inventory,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS,
  LOCATION_TYPE,
  Pallet
} from '@things-factory/warehouse-base'
import { EntityManager, Equal, getManager, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { generateInventoryHistory } from '../../../utils'

export const putaway = {
  async putaway(_: any, { worksheetDetailName, palletId, toLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // inventory has reusable pallet id
      // client side passed in single worksheetDetail

      let foundReusablePallet: Pallet

      foundReusablePallet = await trxMgr.getRepository(Pallet).findOne({
        where: {
          domain: context.state.domain,
          name: palletId
        },
        relations: ['domain']
      })

      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY
        },
        relations: ['worksheet', 'worksheet.arrivalNotice', 'targetInventory', 'targetInventory.inventory']
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)

      let arrivalNotice: ArrivalNotice = worksheetDetail.worksheet.arrivalNotice

      if (foundReusablePallet) {
        let inventory: Inventory[] = await trxMgr.getRepository(Inventory).find({
          where: {
            domain: context.state.domain,
            reusablePallet: foundReusablePallet,
            refOrderId: arrivalNotice.id,
            status: In([INVENTORY_STATUS.PUTTING_AWAY, INVENTORY_STATUS.UNLOADED])
          }
        })

        // use GAN find worksheet
        const foundWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: {
            domain: context.state.domain,
            arrivalNotice,
            type: WORKSHEET_TYPE.PUTAWAY,
            status: WORKSHEET_STATUS.EXECUTING
          },
          relations: [
            'worksheetDetails',
            'worksheetDetails.targetInventory',
            'worksheetDetails.targetInventory.inventory'
          ]
        })

        await Promise.all(
          inventory.map(async inv => {
            const foundWSD: WorksheetDetail[] = foundWS.worksheetDetails.filter(
              (wsd: WorksheetDetail) => wsd.targetInventory.inventory.name === inv.name
            )

            await executePutaway(
              foundWSD[0],
              arrivalNotice,
              inv.palletId,
              toLocation,
              context.state.domain,
              context.state.user,
              trxMgr
            )
          })
        )
      } else {
        await executePutaway(
          worksheetDetail,
          arrivalNotice,
          palletId,
          toLocation,
          context.state.domain,
          context.state.user,
          trxMgr
        )
      }
    })
  }
}

async function executePutaway(
  worksheetDetail: any,
  arrivalNotice: string,
  palletId: string,
  locationName: string,
  domain: Domain,
  user: User,
  trxMgr: EntityManager
) {
  // 1. get worksheet detail
  let targetInventory: OrderInventory = worksheetDetail.targetInventory
  let inventory: Inventory = targetInventory.inventory
  if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')

  // 3. get to location object
  const location: Location = await trxMgr.getRepository(Location).findOne({
    where: {
      domain,
      name: locationName,
      type: In([LOCATION_TYPE.SHELF, LOCATION_TYPE.BUFFER])
    },
    relations: ['warehouse']
  })
  if (!location) throw new Error(`Location doesn't exists`)

  // 4. update location of inventory (buffer location => toLocation)
  inventory = await trxMgr.getRepository(Inventory).save({
    ...inventory,
    location,
    status: INVENTORY_STATUS.STORED,
    warehouse: location.warehouse,
    zone: location.warehouse.zone,
    updater: user
  })

  // 4. 1) Update status of location
  if (location.status === LOCATION_STATUS.EMPTY) {
    await trxMgr.getRepository(Location).save({
      ...location,
      status: LOCATION_STATUS.OCCUPIED,
      updater: user
    })
  }

  // 5. add inventory history
  await generateInventoryHistory(inventory, arrivalNotice, INVENTORY_TRANSACTION_TYPE.PUTAWAY, 0, 0, user, trxMgr)

  // 6. update status of order inventory
  await trxMgr.getRepository(OrderInventory).save({
    ...targetInventory,
    status: ORDER_INVENTORY_STATUS.TERMINATED,
    updater: user
  })

  // 7. update status of worksheet details (EXECUTING => DONE)
  await trxMgr.getRepository(WorksheetDetail).save({
    ...worksheetDetail,
    status: WORKSHEET_STATUS.DONE,
    updater: user
  })
}
