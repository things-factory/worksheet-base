import { Worker, Bizplace } from '@things-factory/biz-base'
import { OrderProduct, OrderVas } from '@things-factory/sales-base'
import { Location } from '@things-factory/warehouse-base'
import { getRepository, In } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const updateWorksheetDetail = {
  async updateWorksheetDetail(_: any, { name, patch }, context: any) {
    const worksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
      where: {
        domain: context.state.domain,
        bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
        name
      }
    })

    if (patch.worker && patch.worker.id) {
      patch.worker = await getRepository(Worker).findOne(patch.worker.id)
    }

    if (patch.targetProduct && patch.targetProduct.id) {
      patch.targetProduct = await getRepository(OrderProduct).findOne(patch.targetProduct.id)
    }

    if (patch.targetVas && patch.targetVas.id) {
      patch.targetVas = await getRepository(OrderVas).findOne(patch.targetVas.id)
    }

    return await getRepository(WorksheetDetail).save({
      ...worksheetDetail,
      patch,
      updater: context.state.updater
    })
  }
}
