import { Bizplace } from '@things-factory/biz-base'
import { getRepository, In } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const worksheetDetailResolver = {
  async worksheetDetail(_: any, { name }, context: any) {
    await getRepository(WorksheetDetail).findOne({
      where: {
        domain: context.state.domain,
        bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
        name
      },
      relations: [
        'domain',
        'bizplace',
        'worksheet',
        'worker',
        'fromLocation',
        'toLocation',
        'targetProduct',
        'targetVas',
        'creator',
        'updater'
      ]
    })
  }
}
