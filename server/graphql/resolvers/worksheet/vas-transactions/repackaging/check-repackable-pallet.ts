import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, OrderVas, ORDER_TYPES, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository, Repository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { OperationGuideInterface, RefOrderType, RepackagingGuide, RepackedFrom, RepackedInvInfo } from '../intefaces'

export const checkRepackablePalletResolver = {
  /**
   * @description Check whether passed pallet id is one of candidates for repack VAS order
   */
  async checkRepackablePallet(
    _: any,
    { worksheetDetailName, palletId },
    context: any
  ): Promise<{ qty: number; weight: number }> {
    const domain: Domain = context.state.domain
    const wsdRepo: Repository<WorksheetDetail> = getRepository(WorksheetDetail)

    const worksheetDetail: WorksheetDetail = await wsdRepo.findOne({
      where: { domain, name: worksheetDetailName },
      relations: [
        'bizplace',
        'worksheet',
        'targetVas',
        'targetVas.vas',
        'targetVas.arrivalNotice',
        'targetVas.releaseGood',
        'targetVas.shippingOrder',
        'targetVas.vasOrder'
      ]
    })

    const targetVas: OrderVas = worksheetDetail.targetVas
    const bizplace: Bizplace = worksheetDetail.bizplace
    const worksheet: Worksheet = worksheetDetail.worksheet
    const relatedWSDs: WorksheetDetail[] = await wsdRepo.find({
      where: { domain, bizplace, worksheet },
      relations: ['targetVas', 'targetVas.vas', 'targetVas.inventory']
    })

    let refOrder: RefOrderType
    if (targetVas?.arrivalNotice?.id) refOrder = targetVas.arrivalNotice
    if (targetVas?.releaseGood?.id) refOrder = targetVas.releaseGood
    if (targetVas?.shippingOrder?.id) refOrder = targetVas.shippingOrder
    if (targetVas?.vasOrder?.id) refOrder = targetVas.vasOrder

    const { reducedQty, reducedWeight } = calcInvReducedAmount(palletId, targetVas)
    const vasId: string = worksheetDetail.targetVas.vas.id
    const vasSet: number = worksheetDetail.targetVas.set

    const relatedOVs: OrderVas[] = relatedWSDs
      .filter((wsd: WorksheetDetail) => wsd.targetVas.vas.id === vasId && wsd.targetVas.set === vasSet)
      .map((wsd: WorksheetDetail) => wsd.targetVas)

    // Return available qty of inventory
    const candidateOV: OrderVas = relatedOVs.find((ov: OrderVas) => ov.inventory.palletId === palletId)
    if (!candidateOV) throw new Error(`Pallet (${palletId}) is not acceptable for this Repackaging`)

    if (refOrder instanceof ReleaseGood) {
      const targetInv: OrderInventory = await getTargetInventory(domain, bizplace, refOrder, candidateOV.inventory)
      return {
        qty: targetInv.releaseQty - reducedQty,
        weight: targetInv.releaseWeight - reducedWeight
      }
    } else {
      return {
        qty: candidateOV.inventory.qty - reducedQty,
        weight: candidateOV.inventory.weight - reducedWeight
      }
    }
  }
}

function calcInvReducedAmount(palletId: string, targetVas: OrderVas): { reducedQty: number; reducedWeight: number } {
  const operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(targetVas.operationGuide)
  const operationGuideData: RepackagingGuide = operationGuide.data
  const repackedFromList: RepackedFrom[] = (operationGuideData.repackedInvs || [])
    .map((repacekdInv: RepackedInvInfo) => repacekdInv.repackedFrom)
    .flat()

  return repackedFromList
    .filter((repackedFrom: RepackedFrom) => repackedFrom.fromPalletId === palletId)
    .reduce(
      (
        reducedAmount: {
          reducedQty: number
          reducedWeight: number
        },
        repackedFrom: RepackedFrom
      ) => {
        return {
          reducedQty: reducedAmount.reducedQty + repackedFrom.reducedQty,
          reducedWeight: reducedAmount.reducedWeight + repackedFrom.reducedWeight
        }
      },
      { reducedQty: 0, reducedWeight: 0 }
    )
}

async function getTargetInventory(
  domain: Domain,
  bizplace: Bizplace,
  releaseGood: ReleaseGood,
  inventory: Inventory
): Promise<OrderInventory> {
  return await getRepository(OrderInventory).findOne({
    where: { domain, bizplace, inventory, releaseGood, type: ORDER_TYPES.RELEASE_OF_GOODS }
  })
}
