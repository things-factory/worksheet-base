import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { getRepository, In } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const deleteWorksheetDetail = {
  async deleteWorksheetDetail(_: any, { id }, context: any) {
    await getRepository(WorksheetDetail).delete({
      domain: context.state.domain,
      bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
      id
    })

    return true
  }
}
