import { Worker } from '@things-factory/biz-base'
import { OrderProduct, OrderVas } from '@things-factory/sales-base'
import { Location } from '@things-factory/warehouse-base'
import { getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const createWorksheetDetail = {
  async createWorksheetDetail(_: any, { worksheetDetail }, context: any) {
    worksheetDetail.worksheet = await getRepository(Worksheet).findOne({
      where: { domain: context.state.domain, bizplace: context.state.bizplaces[0], id: worksheetDetail.worksheet.id }
    })

    if (worksheetDetail.worker && worksheetDetail.worker.id) {
      worksheetDetail.worker = await getRepository(Worker).findOne(worksheetDetail.worker.id)
    }

    if (worksheetDetail.targetProduct && worksheetDetail.targetProduct.id) {
      worksheetDetail.targetProduct = await getRepository(OrderProduct).findOne(worksheetDetail.targetProduct.id)
    }

    if (worksheetDetail.targetVas && worksheetDetail.targetVas.id) {
      worksheetDetail.targetVas = await getRepository(OrderVas).findOne(worksheetDetail.targetVas.id)
    }

    return await getRepository(WorksheetDetail).save({
      ...worksheetDetail,
      domain: context.state.domain,
      bizplace: context.state.bizplace[0],
      creator: context.state.user,
      updater: context.state.user
    })
  }
}
