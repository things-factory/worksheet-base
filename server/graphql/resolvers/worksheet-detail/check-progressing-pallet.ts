import { WorksheetDetail } from '../../../entities'
import { WORKSHEET_STATUS } from '../../../constants'
import { getRepository, SelectQueryBuilder } from 'typeorm'

export const checkProgressingPalletResolver = {
  async checkProgressingPallet(_: any, { palletId }, context: any) {
    const qb: SelectQueryBuilder<WorksheetDetail> = getRepository(WorksheetDetail).createQueryBuilder('WSD')
    const cnt: number = await qb
      .leftJoin('WSD.targetInventory', 'T_INV')
      .leftJoin('T_INV.inventory', 'INV')
      .where('"INV"."domain_id" = :domainId', { domainId: context.state.domain.id })
      .andWhere('"INV"."pallet_id" = :palletId', { palletId })
      .andWhere('"WSD"."status" IN (:...status)', {
        status: [WORKSHEET_STATUS.EXECUTING, WORKSHEET_STATUS.DEACTIVATED],
      })
      .getCount()

    return Boolean(cnt)
  },
}
