import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location, Warehouse } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { checkPalletDuplication, checkPalletIdenticallity } from '../../../../../utils'
import { executeVas } from '../../vas/execute-vas'
import {
  assignInventory,
  getRemainInventoryAmount,
  getWorksheetDetailByName,
  updateRelatedOrderVas
} from '../common-utils'
import {
  OperationGuideInterface,
  PackingUnits,
  PalletChangesInterface,
  RefOrderType,
  RepackagingGuide,
  RepackedInvInfo
} from '../interfaces'

export const repackagingResolver = {
  async repackaging(_: any, { worksheetDetailName, fromPalletId, toPalletId, locationName, packageQty }, context: any) {
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

      // Find target worksheet detail & target order vas & bizplace
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

      let operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepackagingGuide = operationGuide.data
      if (!operationGuideData.repackedInvs) operationGuideData.repackedInvs = []
      const palletChanges: PalletChangesInterface[] = operationGuideData.repackedInvs
        .map((ri: RepackedInvInfo) => ri.repackedFrom)
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
      const packingUnit: string = operationGuideData.packingUnit
      const stdAmount: number = operationGuideData.stdAmount
      let repackedInv: RepackedInvInfo = getRepackedInv(operationGuideData, toPalletId, locationName)

      let isCompleted: boolean = false // Flag for calling executeVas function to change status of worksheet detail
      if (packingUnit === PackingUnits.QTY) {
        const reducedQty: number = remainQty >= stdAmount * packageQty ? stdAmount * packageQty : remainQty
        const repackedFrom: PalletChangesInterface = {
          fromPalletId,
          toPalletId,
          reducedQty,
          reducedWeight: reducedQty * unitWeight
        }

        repackedInv.repackedFrom.push(repackedFrom)
        const totalPackedQty: number = repackedInv.repackedFrom.reduce(
          (qty: number, rf: PalletChangesInterface) => (qty += rf.reducedQty),
          0
        )
        repackedInv.repackedPkgQty = totalPackedQty / stdAmount
        isCompleted = remainQty <= stdAmount * packageQty
      } else if (packingUnit === PackingUnits.WEIGHT) {
        // Case 1. When batchProcess is true => Reduce as much as remainWeight to complete this repackaging task
        // Case 2. When from pallet has more products than std amount => Reduce as much as stdAmount
        // Case 3. When from pallet has less products than std amount => Reduce as much as remainWeight
        const reducedWeight: number = remainWeight >= stdAmount * packageQty ? stdAmount * packageQty : remainWeight
        const repackedFrom: PalletChangesInterface = {
          fromPalletId,
          toPalletId,
          reducedWeight,
          reducedQty: reducedWeight / unitWeight
        }

        repackedInv.repackedFrom.push(repackedFrom)
        const totalPackedWeight: number = repackedInv.repackedFrom.reduce(
          (weight: number, rf: PalletChangesInterface) => (weight += rf.reducedWeight),
          0
        )
        repackedInv.repackedPkgQty = totalPackedWeight / stdAmount
        isCompleted = remainWeight <= stdAmount * packageQty
      }

      // Get total required package qty to complete this VAS Task
      const requiredPackageQty: number = await getRequiredPackageQty(
        trxMgr,
        domain,
        bizplace,
        wsd.worksheet,
        targetVas,
        packingUnit,
        stdAmount
      )
      // Get total repacked package qty until this transaction
      const repackedPackageQty: number = getRepackedPackageQty(operationGuideData.repackedInvs)
      const remainRequiredPackageQty: number = requiredPackageQty - repackedPackageQty

      operationGuide.data.requiredPackageQty = remainRequiredPackageQty
      operationGuide.data.repackedInvs = operationGuideData.repackedInvs

      // Update every order vas to share same operation guide
      await updateRelatedOrderVas<RepackagingGuide>(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user)

      if (isCompleted || remainRequiredPackageQty === 0) {
        await executeVas(trxMgr, domain, user, wsd)
      }
    })
  }
}

/**
 * @description Get total qty of repacked.
 *
 * @param {RepackedInvInfo[]} repackedInvs
 */
function getRepackedPackageQty(repackedInvs: RepackedInvInfo[]): number {
  return repackedInvs.reduce((repackedPkgQty: number, ri: RepackedInvInfo) => (repackedPkgQty += ri.repackedPkgQty), 0)
}

/**
 * @description Get total required package qty to complete this Repackagine VAS Task.
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {Worksheet} worksheet
 * @param {String} packingUnit
 * @param {Number} stdAmount
 */
async function getRequiredPackageQty(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  worksheet: Worksheet,
  currentOV: OrderVas,
  packingUnit: string,
  stdAmount: number
): Promise<number> {
  const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
    where: { domain, bizplace, worksheet },
    relations: ['targetVas', 'targetVas.vas']
  })

  const orderVASs: OrderVas[] = relatedWSDs.map((wsd: WorksheetDetail) => wsd.targetVas)
  const { qty, weight } = orderVASs
    .filter((ov: OrderVas) => ov.set === currentOV.set && ov.vas.id === currentOV.vas.id)
    .reduce(
      (total: { qty: number; weight: number }, ov: OrderVas) => {
        total.qty += ov.qty
        total.weight += ov.weight

        return total
      },
      { qty: 0, weight: 0 }
    )

  if (packingUnit === PackingUnits.QTY) {
    return qty / stdAmount
  } else if (packingUnit === PackingUnits.WEIGHT) {
    return weight / stdAmount
  }
}

/**
 * @description Find repacked pallet which has same pallet id with passed pallet id as param
 * If there's no repacked pallet init new RepackedInvInfo object and return it
 *
 * @param {RepackagingGuide} operationGuideData
 * @param {String} palletId
 * @param {String} locationName
 */
function getRepackedInv(operationGuideData: RepackagingGuide, palletId: string, locationName: string): RepackedInvInfo {
  let repackedInv: RepackedInvInfo = operationGuideData.repackedInvs.find(
    (ri: RepackedInvInfo) => ri.palletId === palletId
  )
  if (!repackedInv) {
    repackedInv = {
      palletId,
      locationName,
      repackedPkgQty: 0,
      repackedFrom: []
    }
    operationGuideData.repackedInvs.push(repackedInv)
  }

  return repackedInv
}
