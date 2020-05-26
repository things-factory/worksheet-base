import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, OrderVas, ORDER_TYPES, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location, Warehouse } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { OperationGuideInterface, PackingUnits, RefOrderType, RepackagingGuide, RepackedInvInfo } from '../intefaces'

type ReducedAmount = { reducedQty: number; reducedWeight: number }

export const repackagingResolver = {
  async repackaging(_: any, { worksheetDetailName, palletId, locationName, packageQty }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      /**
       * Initialize required variables
       */
      const domain: Domain = context.state.domain
      const user: User = context.state.user

      // Find target worksheet detail & target order vas
      const wsd: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain, name: worksheetDetailName },
        relations: [
          'bizplace',
          'targetVas',
          'targetVas.inventory',
          'targetVas.inventory.product',
          'targetVas.vas',
          'targetVas.arrivalNotice',
          'targetVas.releaseGood',
          'targetVas.shippingOrder',
          'targetVas.vasOrder',
          'worksheet'
        ]
      })

      const bizplace: Bizplace = wsd.bizplace
      const targetVas: OrderVas = wsd.targetVas
      let originInv: Inventory = targetVas.inventory
      const location: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain, name: locationName },
        relations: ['warehouse']
      })
      const warehouse: Warehouse = location.warehouse
      // Update operation guide data for every related repalletizing vas
      const operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(targetVas.operationGuide)
      const operationGuideData: RepackagingGuide = operationGuide.data

      let refOrder: RefOrderType
      if (targetVas?.arrivalNotice?.id) {
        refOrder = targetVas.arrivalNotice
      } else if (targetVas?.releaseGood?.id) {
        refOrder = targetVas.releaseGood
      } else if (targetVas?.shippingOrder?.id) {
        refOrder = targetVas.shippingOrder
      } else if (targetVas?.vasOrder?.id) {
        refOrder = targetVas.vasOrder
      }

      // Validity checking
      if (!wsd) throw new Error(`Couldn't find target worksheet detail`)
      if (!targetVas) throw new Error(`Couldn't find target vas`)
      if (!originInv) throw new Error(`Inventory wasn't assigned to target vas`)
      if (!refOrder) throw new Error(`Couldn't find reference order with current order vas`)
      if (!location) throw new Error(`Couldn't find location by its name (${locationName})`)
      if (!warehouse) throw new Error(`Location (name: ${locationName}) doesn't have any relation with warehouse`)

      let repackedInvs: RepackedInvInfo[] = operationGuideData.repackedInvs || []
      const packingUnit: string = operationGuideData.packingUnit
      const stdAmount: number = operationGuideData.stdAmount
      const unitWeight: number = await getUnitWeight(refOrder, trxMgr, domain, bizplace, originInv)
      const totalRepackedPkgQty: number = repackedInvs.reduce(
        (totalPackageQty: number, inv: RepackedInvInfo) => totalPackageQty + inv.repackedPkgQty,
        0
      )

      let reducedQty: number
      let reducedWeight: number
      if (packingUnit === PackingUnits.WEIGHT) {
        reducedWeight = totalRepackedPkgQty * stdAmount
        reducedQty = reducedWeight / unitWeight
      } else {
        reducedQty = totalRepackedPkgQty * stdAmount
        reducedWeight = reducedQty * unitWeight
      }

      const { remainQty, remainWeight } = await getRemainInventoryAmount(
        refOrder,
        trxMgr,
        domain,
        bizplace,
        originInv,
        reducedQty,
        reducedWeight
      )

      // Validity checking
      let requiredQty: number
      let requiredWeight: number
      if (packingUnit === PackingUnits.WEIGHT) {
        requiredWeight = stdAmount * packageQty
        requiredQty = requiredWeight / unitWeight

        if (remainWeight < requiredWeight) throw new Error(`Weight of pallet is less than required.`)
      } else {
        requiredQty = stdAmount * packageQty
        requiredWeight = requiredQty * unitWeight

        if (remainQty < requiredQty) throw new Error(`Pallet doesn't have enough product to repack.`)
      }

      // Add new repacked inv or append repacked amount
      if (repackedInvs.find((inv: RepackedInvInfo) => inv.palletId === palletId)) {
        // Inventory is exists => append to existing inventory
        const inv: RepackedInvInfo = repackedInvs.find((inv: RepackedInvInfo) => inv.palletId === palletId)
        if (inv.locationName !== locationName)
          throw new Error(`The pallet(${palletId})  location code is ${inv.locationName}`)
        inv.repackedPkgQty = inv.repackedPkgQty + packageQty
      } else {
        // Inventory doesn't exists => add new inventory
        const newRepackedInv: RepackedInvInfo = {
          palletId,
          locationName,
          repackedPkgQty: packageQty
        }

        repackedInvs.push(newRepackedInv)
      }

      const worksheet: Worksheet = wsd.worksheet
      const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain,
          bizplace,
          worksheet
        },
        relations: ['targetVas', 'targetVas.vas']
      })

      // Update related order vas
      const requiredPackageQty: number = operationGuideData.requiredPackageQty - packageQty
      const relatedOrderVass: OrderVas[] = relatedWSDs
        .map((wsd: WorksheetDetail) => wsd.targetVas)
        .filter((ov: OrderVas) => ov.id !== targetVas.id && ov.set === targetVas.set && ov.vas.id === targetVas.vas.id)
        .map((ov: OrderVas) => {
          ov.operationGuide = JSON.parse(ov.operationGuide)
          const refOperationGuideData: RepackagingGuide = {
            packingUnit: ov.operationGuide.data.packingUnit,
            toPackingType: ov.operationGuide.data.toPackingType,
            stdAmount: ov.operationGuide.data.stdAmount,
            repackedInvs: ov.operationGuide.data.repackedInvs,
            requiredPackageQty
          }

          delete ov.operationGuide.data

          const refOperationGuide: OperationGuideInterface<RepackagingGuide> = {
            ...ov.operationGuide,
            data: refOperationGuideData,
            completed: !Boolean(requiredPackageQty)
          }

          return {
            ...ov,
            operationGuide: JSON.stringify(refOperationGuide),
            updater: user
          }
        })

      await trxMgr.getRepository(OrderVas).save(relatedOrderVass)

      // Update current order vas
      const currentOperationGuideData: RepackagingGuide = {
        packingUnit: operationGuideData.packingUnit,
        toPackingType: operationGuideData.toPackingType,
        stdAmount: operationGuideData.stdAmount,
        requiredPackageQty,
        repackedInvs
      }
      delete operationGuide.data

      const currentOperationGuide: OperationGuideInterface<RepackagingGuide> = {
        ...operationGuide,
        data: currentOperationGuideData,
        completed: !Boolean(requiredPackageQty)
      }

      await trxMgr.getRepository(OrderVas).save({
        ...targetVas,
        operationGuide: JSON.stringify(currentOperationGuide),
        updater: user
      })
    })
  }
}

async function getRemainInventoryAmount(
  refOrder: RefOrderType,
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  originInv: Inventory,
  reducedQty: number,
  reducedWeight: number
): Promise<{ remainQty: number; remainWeight: number }> {
  let remainQty: number = 0
  let remainWeight: number = 0

  if (refOrder instanceof ReleaseGood) {
    // Find loading order inventory to figure out unit weight
    const orderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
      where: { domain, bizplace, inventory: originInv, releaseGood: refOrder, type: ORDER_TYPES.RELEASE_OF_GOODS }
    })

    remainQty = orderInv.releaseQty - reducedQty
    remainWeight = orderInv.releaseWeight - reducedWeight
  } else {
    remainQty = originInv.qty - reducedQty
    remainWeight = originInv.weight - reducedWeight
  }
  return { remainQty, remainWeight }
}

async function getUnitWeight(
  refOrder: RefOrderType,
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  originInv: Inventory
): Promise<number> {
  let unitWeight: number

  if (refOrder instanceof ReleaseGood) {
    // Find loading order inventory to figure out unit weight
    const orderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
      where: { domain, bizplace, inventory: originInv, releaseGood: refOrder, type: ORDER_TYPES.RELEASE_OF_GOODS }
    })
    unitWeight = orderInv.releaseWeight / orderInv.releaseQty
  } else {
    unitWeight = originInv.weight / originInv.qty
  }
  return unitWeight
}
