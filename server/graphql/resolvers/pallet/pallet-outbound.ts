import { ReleaseGood } from '@things-factory/sales-base'
import { Pallet, PalletHistory } from '@things-factory/warehouse-base'
import { getManager, getRepository, In } from 'typeorm'

export const palletOutbound = {
  async palletOutbound(_: any, { refOrderNo, patches }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const releaseGood: ReleaseGood = await getRepository(ReleaseGood).findOne({
        where: { name: refOrderNo },
        relations: ['bizplace']
      })

      let palletPatches: Pallet[] =
        patches.length > 0
          ? await getRepository(Pallet).find({
              where: { id: In(patches.map(pallet => pallet.id)) },
              relations: ['owner', 'holder', 'domain', 'creator', 'updater']
            })
          : []

      let releasedPallets: Pallet[] = await getRepository(Pallet).find({
        where: { refOrderNo: refOrderNo },
        relations: ['owner', 'holder', 'domain', 'creator', 'updater']
      })

      // get added pallets
      let addedPallets: Pallet[] = palletPatches
        .filter(e => e.refOrderNo == null)
        .map(pallet => {
          return {
            ...pallet,
            holder: releaseGood.bizplace,
            refOrderNo: refOrderNo,
            seq: pallet.seq + 1
          }
        })

      // get removed pallets
      let removedPallets: Pallet[] = releasedPallets
        .filter(e => !palletPatches.find(patch => patch.id == e.id))
        .map(pallet => {
          return {
            ...pallet,
            holder: pallet.owner,
            refOrderNo: null,
            seq: pallet.seq - 1
          }
        })

      // Add into pallet history for outbound
      await Promise.all(
        addedPallets.map(async pallet => {
          let newHistory = {
            ...pallet,
            pallet: pallet,
            domain: context.state.domain,
            creator: context.state.user,
            updater: context.state.user,
            transactionType: 'OUTBOUND'
          }
          delete newHistory.id

          await trxMgr.getRepository(PalletHistory).save({
            ...newHistory
          })
        })
      )

      // Roll back pallet history
      await Promise.all(
        removedPallets.map(async item => {
          trxMgr.getRepository(PalletHistory).delete({ name: item.name, seq: item.seq + 1 })
        })
      )

      // Update Pallet data
      await Promise.all(
        [...addedPallets, ...removedPallets].map(async item => {
          await trxMgr.getRepository(Pallet).save({
            ...item
          })
        })
      )

      return true
    })
  }
}
