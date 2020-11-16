import { ArrivalNotice, OrderVas, Vas, ORDER_STATUS, ORDER_VAS_STATUS, ORDER_TYPES } from '@things-factory/sales-base'
import uuid from 'uuid/v4'
import { getManager, Equal, getRepository, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { fetchExecutingWorksheet } from '../../../utils'
import { VasWorksheetController, WorksheetController } from '../../../controllers'

export const palletizingPallets = {
  async palletizingPallets(_: any, { refOrderNo, patches }, context: any) {
    return await getManager().transaction(async trxMgr => {
      let arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: refOrderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })

      if (!arrivalNotice) throw new Error(`Couldn't find VAS worksheet by order no (${refOrderNo})`)

      const vasWorksheetController: VasWorksheetController = new VasWorksheetController(trxMgr, context.state.domain, context.state.user)
      const worksheetController: WorksheetController = new WorksheetController(trxMgr, context.state.domain, context.state.user)
      
      for(let patch of patches) {
        let orderVass: OrderVas
        
        const foundOV: OrderVas = await trxMgr.getRepository(OrderVas).findOne({
          where: {
            id: patch.id
          }
        })

        const palletizingVAS: Vas = await trxMgr.getRepository(Vas).findOne({
          where: { domain: context.state.domain, id: patch.vas.id }
        })

        if(foundOV) {
          orderVass = {
            ...foundOV,
            set: patch.set,
            vas: palletizingVAS,
            qty: patch.qty,
            remark: patch.remark,
          }

          let savedOrderVass: OrderVas = await trxMgr.getRepository(OrderVas).save(orderVass)
          let newOrderVass: OrderVas = new OrderVas()
          newOrderVass.id = savedOrderVass.id,
          newOrderVass.name = savedOrderVass.name,
          newOrderVass.set = savedOrderVass.set,
          newOrderVass.vas = savedOrderVass.vas,
          newOrderVass.qty = savedOrderVass.qty,
          newOrderVass.remark = savedOrderVass.remark,
          newOrderVass.targetType = savedOrderVass.targetType,
          newOrderVass.type = savedOrderVass.type,
          newOrderVass.status = savedOrderVass.status,
          newOrderVass.domain = savedOrderVass.domain,
          newOrderVass.bizplace = savedOrderVass.bizplace,
          newOrderVass.arrivalNotice = savedOrderVass.arrivalNotice,
          newOrderVass.creator = savedOrderVass.creator,
          newOrderVass.updater = savedOrderVass.updater

          let vasWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
            where: {
              arrivalNotice,
              type: WORKSHEET_TYPE.VAS
            },
            relations: ['domain', 'bizplace', 'worksheetDetails', 'worksheetDetails.targetVas']
          })
          if(!vasWorksheet) {
            vasWorksheet = await vasWorksheetController.generateVasWorksheet(arrivalNotice)
            let vasWorksheetDetails: WorksheetDetail[] = vasWorksheet.worksheetDetails
    
            await vasWorksheetController.activateVAS(vasWorksheet.name, vasWorksheetDetails)
          }
        } else {
          orderVass = {
            name: uuid(),
            set: patch.set,
            vas: palletizingVAS,
            qty: patch.qty,
            remark: patch.remark,
            targetType: patch.targetType,
            type: ORDER_TYPES.ARRIVAL_NOTICE,
            status: WORKSHEET_STATUS.EXECUTING,
            domain: context.state.domain,
            bizplace: arrivalNotice.bizplace,
            arrivalNotice: arrivalNotice,
            creator: context.state.user,
            updater: context.state.user
          }

          let savedOrderVass: OrderVas = await trxMgr.getRepository(OrderVas).save(orderVass)
          let newOrderVass: OrderVas = new OrderVas()
          newOrderVass.id = savedOrderVass.id,
          newOrderVass.name = savedOrderVass.name,
          newOrderVass.set = savedOrderVass.set,
          newOrderVass.vas = savedOrderVass.vas,
          newOrderVass.qty = savedOrderVass.qty,
          newOrderVass.remark = savedOrderVass.remark,
          newOrderVass.targetType = savedOrderVass.targetType,
          newOrderVass.type = savedOrderVass.type,
          newOrderVass.status = savedOrderVass.status,
          newOrderVass.domain = savedOrderVass.domain,
          newOrderVass.bizplace = savedOrderVass.bizplace,
          newOrderVass.arrivalNotice = savedOrderVass.arrivalNotice,
          newOrderVass.creator = savedOrderVass.creator,
          newOrderVass.updater = savedOrderVass.updater

          let vasWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
            where: {
              arrivalNotice,
              type: WORKSHEET_TYPE.VAS
            },
            relations: ['domain', 'bizplace', 'worksheetDetails', 'worksheetDetails.targetVas']
          })
          if(!vasWorksheet) {
            vasWorksheet = await vasWorksheetController.generateVasWorksheet(arrivalNotice)
            let vasWorksheetDetails: WorksheetDetail[] = vasWorksheet.worksheetDetails
    
            await vasWorksheetController.activateVAS(vasWorksheet.name, vasWorksheetDetails)
          }
          else {
            await worksheetController.createWorksheetDetails(vasWorksheet, WORKSHEET_TYPE.VAS, [newOrderVass])
            
            // if(vasWorksheetDetails) {
            //   vasWorksheetDetails = vasWorksheetDetails.map(wsd => {
            //     return {
            //       ...wsd,
            //       status: WORKSHEET_STATUS.EXECUTING
            //     }
            //   })
            //   await trxMgr.getRepository(WorksheetDetail).save(vasWorksheetDetails)
            // }
          }
        }
      }
    })
  }
}
