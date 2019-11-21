import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { getRepository, In } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const worksheetDetailResolver = {
  async worksheetDetail(_: any, { name }, context: any) {
    await getRepository(WorksheetDetail).findOne({
      where: {
        domain: context.state.domain,
        bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
        name
      },
      relations: ['domain', 'bizplace', 'worksheet', 'worker', 'targetProduct', 'targetVas', 'creator', 'updater']
    })
  }
}
