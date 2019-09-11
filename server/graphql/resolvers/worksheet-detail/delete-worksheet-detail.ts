import { getRepository, In } from 'typeorm'
import { WorksheetDetail } from '../../../entities'
import { Bizplace } from '@things-factory/biz-base'

export const deleteWorksheetDetail = {
  async deleteWorksheetDetail(_: any, { name }, context: any) {
    await getRepository(WorksheetDetail).delete({
      domain: context.state.domain,
      bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
      name
    })

    return true
  }
}
