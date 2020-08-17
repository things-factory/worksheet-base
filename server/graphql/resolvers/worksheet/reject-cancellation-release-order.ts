import { getManager, In } from 'typeorm'
import {
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_VAS_STATUS,
  OrderInventory,
  DeliveryOrder,
  OrderVas,
  ReleaseGood
} from '@things-factory/sales-base'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const rejectCancellationReleaseOrder = {
  async rejectCancellationReleaseOrder(_: any, { name }, context: any) {
    return await getManager().transaction(async trxMgr => {
      let foundRO: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name, status: ORDER_STATUS.PENDING_CANCEL },
        relations: [
          'bizplace',
          'orderInventories',
          'orderInventories.inventory',
          'orderInventories.inventory.location',
          'orderInventories.deliveryOrder',
          'orderVass'
        ]
      })

      if (!foundRO) throw new Error(`Release order doesn't exists.`)
      let targetOIs: OrderInventory[] = foundRO.orderInventories
      let foundOVs: OrderVas[] = foundRO.orderVass
      let isDeactivatedPicking = false

      // get the worksheet based on RO number
      let foundWS: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          releaseGood: foundRO
        }
      })

      // check worksheet table if started_at is not null to indicate that the worksheet has been activated 
      if (foundWS && foundWS?.length) {
        foundWS = foundWS.map((ws: Worksheet) => {
          if (ws.startedAt && !ws.endedAt) {
            return {
              ...ws,
              status: WORKSHEET_STATUS.EXECUTING,
              updater: context.state.user
            }
          }
          else if (ws.startedAt && ws.endedAt) {
            return {
              ...ws,
              status: WORKSHEET_STATUS.DONE,
              updater: context.state.user
            }
          }
          else if (!ws.startedAt && !ws.endedAt && ws.type === WORKSHEET_TYPE.PICKING) {
            isDeactivatedPicking = true
            return {
              ...ws,
              status: WORKSHEET_STATUS.DEACTIVATED,
              updater: context.state.user
            }
          }
        })
        await trxMgr.getRepository(Worksheet).save(foundWS)
      }

      // check if the worksheet is in Loading stage
      const isLoadingStage = foundWS.some((ws: Worksheet) => ws.type === WORKSHEET_TYPE.LOADING)
      
      // change the order inventory status accordingly
      let newOrderInventories: OrderInventory[] = targetOIs.map(
        (oi: OrderInventory) => {
          if (isLoadingStage && oi.deliveryOrder && oi.status === ORDER_INVENTORY_STATUS.PENDING_REVERSE)
            oi.status = ORDER_INVENTORY_STATUS.LOADED
              
          else if (isLoadingStage && !oi.deliveryOrder && oi.status === ORDER_INVENTORY_STATUS.PENDING_REVERSE)
            oi.status = ORDER_INVENTORY_STATUS.LOADING

          else if (!isLoadingStage && oi.inventory && isDeactivatedPicking && oi.status === ORDER_INVENTORY_STATUS.PENDING_CANCEL)
            oi.status = ORDER_INVENTORY_STATUS.READY_TO_PICK

          else if (!isLoadingStage && oi.inventory && !isDeactivatedPicking && oi.status === ORDER_INVENTORY_STATUS.PENDING_CANCEL)
            oi.status = ORDER_INVENTORY_STATUS.PICKING

          else if (!isLoadingStage && oi.inventory && !isDeactivatedPicking && oi.status === ORDER_INVENTORY_STATUS.PENDING_REVERSE)
            oi.status = ORDER_INVENTORY_STATUS.PICKED

          else if (!isLoadingStage && !oi.inventory && isDeactivatedPicking && oi.status === ORDER_INVENTORY_STATUS.PENDING_CANCEL)
            oi.status = ORDER_INVENTORY_STATUS.PENDING_SPLIT

          return {
            ...oi,
            updater: context.state.user
          }
      })
      await trxMgr.getRepository(OrderInventory).save(newOrderInventories)

      // find the worksheet details based on order inventories
      let foundWSD: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain: context.state.domain,
          targetInventory: In(newOrderInventories.map((oi: OrderInventory) => oi.id ))
        },
        relations: ['targetInventory']
      })

      if (foundWSD && foundWSD?.length) {
        foundWSD = foundWSD.map((wsd: WorksheetDetail) => {

          //change the worksheet details status accordingly
          newOrderInventories.forEach((oi: OrderInventory) => {
            
            if (wsd.targetInventory?.id === oi.id && wsd.type === WORKSHEET_TYPE.PICKING) {
              switch (oi.status) {
                case ORDER_INVENTORY_STATUS.READY_TO_PICK:
                  wsd.status = WORKSHEET_STATUS.DEACTIVATED
                  break
  
                case ORDER_INVENTORY_STATUS.PICKING:
                  wsd.status = WORKSHEET_STATUS.EXECUTING
                  break
  
                case ORDER_INVENTORY_STATUS.REPLACED:
                  wsd.status = WORKSHEET_STATUS.REPLACED
                  break
  
                case ORDER_INVENTORY_STATUS.PICKED:
                  wsd.status = WORKSHEET_STATUS.DONE
                  break
  
                case ORDER_INVENTORY_STATUS.LOADING:
                  wsd.status = WORKSHEET_STATUS.DONE
                  break
  
                case ORDER_INVENTORY_STATUS.LOADED:
                  wsd.status = WORKSHEET_STATUS.DONE
                  break
              }
            }

            else if (wsd.targetInventory?.id === oi.id && wsd.type === WORKSHEET_TYPE.LOADING) {
              switch (oi.status) {
                case ORDER_INVENTORY_STATUS.LOADING:
                  wsd.status = WORKSHEET_STATUS.EXECUTING
                  break
  
                case ORDER_INVENTORY_STATUS.LOADED:
                  wsd.status = WORKSHEET_STATUS.DONE
                  break
              }
            }
          })
          
          return {
            ...wsd,
            updater: context.state.user
          }
        })

        await trxMgr.getRepository(WorksheetDetail).save(foundWSD)
      }

      if (foundOVs && foundOVs?.length) {

        // update status of order vass to accordingly
        foundOVs = foundOVs.map((orderVas: OrderVas) => {
          if (!isLoadingStage)
            orderVas.status = ORDER_VAS_STATUS.READY_TO_PROCESS
          
          else
            orderVas.status = ORDER_VAS_STATUS.COMPLETED
          
          return {
            ...orderVas,
            updater: context.state.user
          }
        })

        await trxMgr.getRepository(OrderVas).save(foundOVs)
      }

      // find DO and change status to previous status
      let foundDO: DeliveryOrder[] = await trxMgr.getRepository(DeliveryOrder).find({
        where: { domain: context.state.domain, releaseGood: foundRO, status: ORDER_STATUS.PENDING_CANCEL },
        relations: ['transportVehicle']
      })

      if (foundDO && foundDO?.length) {
        foundDO = foundDO.map((deliveryOrder: DeliveryOrder) => {
          return {
            ...deliveryOrder,
            status: ORDER_STATUS.READY_TO_DISPATCH,
            updater: context.state.user
          }
        })
        await trxMgr.getRepository(DeliveryOrder).save(foundDO)
      }

      const isLoadingRO = foundWS.some((ws: Worksheet) =>
        ws.type === WORKSHEET_TYPE.LOADING &&
        ws.status === WORKSHEET_STATUS.EXECUTING
      )

      if (isLoadingRO)
        foundRO.status = ORDER_STATUS.LOADING

      else {
        var isReadyToLoadRO = foundWS.some((ws: Worksheet) => 
          ws.type === WORKSHEET_TYPE.LOADING &&
          ws.status === WORKSHEET_STATUS.DEACTIVATED
        )
      }

      if (isReadyToLoadRO) 
        foundRO.status = ORDER_STATUS.READY_TO_LOAD

      else {
        var isPickingRO = foundWS.some((ws: Worksheet) => 
          ws.type === WORKSHEET_TYPE.PICKING &&
          ws.status === WORKSHEET_STATUS.EXECUTING
        )
      }
      
      if (isPickingRO) 
        foundRO.status = ORDER_STATUS.PICKING

      else {
        var isReadyToPickRO = foundWS.some((ws: Worksheet) => 
          ws.type === WORKSHEET_TYPE.PICKING &&
          ws.status === WORKSHEET_STATUS.DEACTIVATED
        )
      }

      if (isReadyToPickRO) 
        foundRO.status = ORDER_STATUS.READY_TO_PICK

      await trxMgr.getRepository(ReleaseGood).save({
        ...foundRO,
        updater: context.state.user
      })

      return
    })
  }
}
