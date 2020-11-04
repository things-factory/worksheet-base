import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location, Pallet, PALLET_TYPES, Warehouse } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WorksheetDetail } from '../../../../../entities'
import { checkPalletDuplication, checkPalletIdenticallity } from '../../../../../utils'
import { executeVas } from '../../vas/execute-vas'
import {
  assignInventory,
  getCurrentAmount,
  getRemainInventoryAmount,
  getWorksheetDetailByName,
  updateRelatedOrderVas
} from '../common-utils'
import {
  OperationGuideInterface,
  PalletChangesInterface,
  RefOrderType,
  RepalletizedInvInfo,
  RepalletizingGuide
} from '../interfaces'

export const repalletizingResolver = {
  async repalletizing(_: any, { worksheetDetailName, fromPalletId, toPalletId, locationName }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const domain: Domain = context.state.domain
      const user: User = context.state.user
      const location: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain, name: locationName },
        relations: ['warehouse']
      })
      if (!location) throw new Error(`Couldn't find location by its name (${locationName})`)
      const warehouse: Warehouse = location.warehouse
      if (!warehouse) throw new Error(`Location (name: ${locationName}) doesn't have any relation with warehouse`)

      const wsd: WorksheetDetail = await getWorksheetDetailByName(trxMgr, domain, worksheetDetailName)
      let { bizplace, targetVas }: { bizplace: Bizplace; targetVas: OrderVas } = wsd

      // Check whether from pallet has valid condition compared with customer's request
      // Batch ID, product and packing type
      const { identicallity, errorMessage } = await checkPalletIdenticallity(
        domain,
        bizplace,
        fromPalletId,
        targetVas.targetBatchId,
        targetVas.targetProduct,
        targetVas.packingType,
        trxMgr
      )
      if (!identicallity) throw new Error(errorMessage)

      // Check whether there's duplicated inventory in warehouse.
      if (await checkPalletDuplication(domain, bizplace, toPalletId, trxMgr))
        throw new Error(`The Pallet ID (${toPalletId}) is duplicated.`)

      // Init refOrder
      const { arrivalNotice, releaseGood, vasOrder }: { [key: string]: RefOrderType } = targetVas
      const refOrder: RefOrderType = arrivalNotice || releaseGood || vasOrder || null
      if (!refOrder) throw new Error(`Couldn't find reference order with current order vas`)

      // Assign inventory if specific inventory isn't assigned yet.
      // This case is occured when the VAS order comes with Arrival Notice or Release Good
      if (!targetVas.inventory) {
        targetVas = await assignInventory(trxMgr, domain, bizplace, user, wsd, refOrder, targetVas, fromPalletId)
      }

      let originInv: Inventory = targetVas.inventory
      let operationGuide: OperationGuideInterface<RepalletizingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepalletizingGuide = operationGuide.data

      const palletType: string = operationGuideData.palletType
      if (palletType === PALLET_TYPES.REUSABLE_PALLET) {
        // Check whether the pallet is available
        const pallet: Pallet = await trxMgr.getRepository(Pallet).findOne({
          where: { domain, name: toPalletId },
          relatoins: ['inventory']
        })
        if (!pallet) throw new Error(`Couldn't find reusable pallet by its ID (${toPalletId})`)
        if (pallet.inventory) throw new Error(`The pallet (${toPalletId}) is located already.`)
      }

      if (!operationGuideData.repalletizedInvs) operationGuideData.repalletizedInvs = []
      const repalletizedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs
      const palletChanges: PalletChangesInterface[] = repalletizedInvs
        .map((ri: RepalletizedInvInfo) => ri.repalletizedFrom)
        .flat()
      const { remainQty, remainWeight } = await getRemainInventoryAmount(
        trxMgr,
        refOrder,
        domain,
        bizplace,
        originInv,
        palletChanges,
        fromPalletId
      )
      const unitWeight: number = remainWeight / remainQty
      const stdQty: number = operationGuideData.stdQty
      const { qty } = getCurrentAmount(palletChanges, toPalletId)
      const requiredQty: number = stdQty - qty
      if (requiredQty === 0) throw new Error(`The pallet (${toPalletId}) is repalletized already.`)
      const reducedQty: number = remainQty >= requiredQty ? requiredQty : remainQty

      const repalletizedInv: RepalletizedInvInfo = getRepalletizedInv(operationGuideData, toPalletId, locationName)
      const repalletizedFrom: PalletChangesInterface = {
        fromPalletId,
        toPalletId,
        reducedQty,
        reducedWeight: reducedQty * unitWeight
      }
      repalletizedInv.repalletizedFrom.push(repalletizedFrom)

      const isCompleted: boolean = qty + reducedQty === stdQty
      let requiredPalletQty: number = isCompleted
        ? operationGuideData.requiredPalletQty - 1
        : operationGuideData.requiredPalletQty

      operationGuide.data = {
        palletType: operationGuideData.palletType,
        stdQty: operationGuideData.stdQty,
        requiredPalletQty,
        repalletizedInvs
      }

      // Update every order vas to share same operation guide
      await updateRelatedOrderVas<RepalletizingGuide>(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user)

      // If pallet is created completely
      // If there's no more products on from pallet
      if (remainQty - reducedQty === 0 || requiredPalletQty === 0) {
        await executeVas(trxMgr, domain, user, wsd)
      }
    })
  }
}

/**
 * @description Find repalletized pallet which has same pallet id with passed pallet id as param
 * If there's no repalletized pallet init new RepalletizedInvInfo object and return it
 *
 * @param {RepalletizedInvInfo} operationGuideData
 * @param {String} palletId
 * @param {String} locationName
 */
function getRepalletizedInv(
  operationGuideData: RepalletizingGuide,
  palletId: string,
  locationName: string
): RepalletizedInvInfo {
  let repalletizedInv: RepalletizedInvInfo = operationGuideData.repalletizedInvs.find(
    (ri: RepalletizedInvInfo) => ri.palletId === palletId
  )

  if (!repalletizedInv) {
    repalletizedInv = {
      palletId,
      locationName,
      repalletizedFrom: []
    }
    operationGuideData.repalletizedInvs.push(repalletizedInv)
  }
  return repalletizedInv
}
