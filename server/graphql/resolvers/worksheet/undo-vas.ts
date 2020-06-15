import { OrderVas, ORDER_VAS_STATUS } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const undoVas = {
  async undoVas(_: any, { worksheetDetail }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetailName = worksheetDetail.name

      // Find worksheet detail by its name
      const foundWSD: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.DONE,
          type: WORKSHEET_TYPE.VAS
        },
        relations: ['worksheet', 'targetVas', 'targetVas.vas', 'targetVas.vasOrder', 'targetVas.inventory']
      })

      // Validate record existing
      if (!foundWSD) throw new Error("Worksheet doesn't exists")

      const targetVas: OrderVas = foundWSD.targetVas
      if (!targetVas) throw new Error("VAS doesn't exists")

      // 현재 VAS가 Reference VAS인지 Pure VAS인지 확인

      let isPureVas: boolean = foundWSD.targetVas?.vasOrder

      if (!isPureVas) {
        // Pure VAS가 아닌 경우 작업 대상 Pallet이 동적으로 할당 되기 때문에
        // (동일한 VAS란 같은 set에 속하며 같은 vas id를 가진)
        // 완료되지 않은 동일한 VAS가 존재할 경우 Undo 대상 record를 삭제하고 (worksheet detail & order vas)
        // 완료되지 않은 동일한 VAS가 존재하지 않을 경우 대상 order vas record에 할당 된 inventory를 제거하고
        // Worksheet Detail과 order vas의 상태를 업데이트함
        // Worksheet Detail: DONE => EXECUTING
        // Order Vas: COMPLETED => PROCESSING
        const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne(foundWSD.worksheet.id, {
          relations: [
            'worksheetDetails',
            'worksheetDetails.targetVas',
            'worksheetDetails.targetVas.vas',
            'worksheetDetails.targetVas.inventory'
          ]
        })

        // (동일한 VAS란 같은 set에 속하며 같은 vas id를 가진)
        const nonFinishedWSD: WorksheetDetail = worksheet.worksheetDetails.find(
          (wsd: WorksheetDetail) =>
            wsd.id !== foundWSD.id &&
            wsd.targetVas.set === foundWSD.targetVas.set &&
            wsd.targetVas.vas.id === foundWSD.targetVas.vas.id &&
            wsd.status !== WORKSHEET_STATUS.DONE
        )

        if (nonFinishedWSD) {
          // 완료되지 않은 동일한 VAS가 존재할 경우 Undo 대상 record를 삭제하고 (worksheet detail & order vas)
          // 완료되지 않은 동일한 VAS의 수량을 증가시킴
          nonFinishedWSD.targetVas.qty += foundWSD.targetVas.qty
          await trxMgr.getRepository(WorksheetDetail).delete(foundWSD.id)
          await trxMgr.getRepository(OrderVas).delete(foundWSD.targetVas.id)

          await trxMgr.getRepository(OrderVas).save(nonFinishedWSD.targetVas)
        } else {
          // 완료되지 않은 동일한 VAS가 존재하지 않을 경우 대상 order vas record에 할당 된 inventory를 제거하고
          // Worksheet Detail과 order vas의 상태를 업데이트함
          // Worksheet Detail: DONE => EXECUTING
          // Order Vas: COMPLETED => PROCESSING
          delete foundWSD.targetVas.inventory
          foundWSD.status = WORKSHEET_STATUS.EXECUTING
          foundWSD.targetVas.status = ORDER_VAS_STATUS.PROCESSING

          await trxMgr.getRepository(WorksheetDetail).save(foundWSD)
          await trxMgr.getRepository(OrderVas).save(foundWSD.targetVas)
        }
      } else {
        // Update status of worksheet detail
        await trxMgr.getRepository(WorksheetDetail).save({
          ...foundWSD,
          status: WORKSHEET_STATUS.EXECUTING,
          issue: '',
          updater: context.state.user
        })

        // Update status of order vas
        await trxMgr.getRepository(OrderVas).save({
          ...targetVas,
          status: ORDER_VAS_STATUS.PROCESSING,
          updater: context.state.user
        })
      }
    })
  }
}
