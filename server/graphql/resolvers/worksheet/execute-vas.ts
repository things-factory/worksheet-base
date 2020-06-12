import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderNoGenerator, OrderVas, ORDER_VAS_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { WorksheetNoGenerator } from 'server/utils'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const executeVasResolver = {
  async executeVas(_: any, { worksheetDetail, palletId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const domain: Domain = context.state.domain
      const user: User = context.state.user

      /**
       * @description If pallet id param is exists.
       * Meaning, the VAS order have been requested with Arrival Notice or Release Order
       * Those types of VAS doesn't have flow to assign specific vas target inventory
       * Assignment should be done within executeVas transaction.
       */
      await executeVas(trxMgr, worksheetDetail, domain, user, palletId)
    })
  }
}

async function checkPalletAcceptable(
  trxMgr: EntityManager,
  palletId: string,
  vasWS: Worksheet,
  vasWSD: WorksheetDetail,
  domain: Domain
): Promise<Inventory> {
  // inventory가 존재해야함
  const inventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
    where: { domain, palletId },
    relations: ['product']
  })
  if (!inventory) throw new Error(`Can't find inventory by pallet ID (${palletId})`)

  // refOrder에 따라 적절한 상태를 가지고 있어야함
  // Arrival Notice = 'PARTIALLY_UNLOADED or PUTTING_AWAY
  const refOrder: ArrivalNotice | ReleaseGood = vasWS.arrivalNotice || vasWS.releaseGood
  if (refOrder instanceof ArrivalNotice) {
    const acceptableStatus = [INVENTORY_STATUS.PARTIALLY_UNLOADED, INVENTORY_STATUS.PUTTING_AWAY]
    if (acceptableStatus.indexOf(inventory.status) < 0)
      throw new Error(`The pallet doesn't have right status for doing VAS`)
  }

  // target vas의 조건에 충족해야 함 (targetBatchId, targetProduct)
  const { targetBatchId, targetProduct } = vasWSD.targetVas
  if (targetBatchId && targetBatchId !== inventory.batchId) {
    throw new Error(`The pallet (${inventory.palletId}) doesn't have correct batch ID (${targetBatchId})`)
  }

  if (targetProduct?.id && targetProduct.id !== inventory.product.id) {
    throw new Error(`The pallet (${inventory.palletId}) doesn't have correct product (${targetProduct.name})`)
  }

  // reference order와 관계되어 있는 inventory여야 함
  if (refOrder instanceof ArrivalNotice) {
    if (inventory.refOrderId !== refOrder.id)
      throw new Error(`The pallet ${inventory.palletId} is not related with GAN (${refOrder.name})`)
  }

  // 다른 vas order set에 포함되어 있지 않아야함
  vasWS = await trxMgr.getRepository(Worksheet).findOne(vasWS.id, {
    relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.inventory']
  })
  const relatedInvs: Inventory[] = vasWS.worksheetDetails
    .filter(
      (
        wsd: WorksheetDetail // 현재 작업대상이 아니고 현재 작업 대상과 같은 세트가 아니고 인벤토리 값이 있는
      ) => wsd.id !== vasWSD.id && wsd.targetVas.set !== vasWSD.targetVas.set && wsd.targetVas.inventory
    )
    .map((wsd: WorksheetDetail) => wsd.targetVas.inventory)

  if (relatedInvs.find((relInv: Inventory) => relInv.palletId === inventory.palletId)) {
    throw new Error(`The pallet (${inventory.palletId}) is already assigned for another VAS SET`)
  }

  return inventory
}

export async function executeVas(
  trxMgr: EntityManager,
  worksheetDetail: WorksheetDetail,
  domain: Domain,
  user: User,
  palletId?: string
) {
  const worksheetDetailName = worksheetDetail.name
  const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
    where: {
      domain,
      name: worksheetDetailName,
      status: WORKSHEET_STATUS.EXECUTING,
      type: WORKSHEET_TYPE.VAS
    },
    relations: [
      'bizplace',
      'worksheet',
      'worksheet.arrivalNotice',
      'worksheet.releaseGood',
      'targetVas',
      'targetVas.targetProduct'
    ]
  })
  if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")
  const bizplace: Bizplace = foundWorksheetDetail.bizplace

  const worksheet: Worksheet = foundWorksheetDetail.worksheet

  if (palletId) {
    const inventory: Inventory = await checkPalletAcceptable(trxMgr, palletId, worksheet, foundWorksheetDetail, domain)

    let targetVas: OrderVas = foundWorksheetDetail.targetVas
    const totalTargetQty: number = targetVas.qty
    // inventory assigment
    targetVas.inventory = inventory
    // 현재 작업 대상 target vas의 수량을 inventory의 수량 만큼 감소 시킴
    targetVas.qty = targetVas.qty - inventory.qty
    targetVas = await trxMgr.getRepository(OrderVas).save(targetVas)
    // 남은 수량이 있다면 새로운 worksheet detail과 target vas를 생성

    const remainQty: number = totalTargetQty - targetVas.qty
    if (remainQty > 0) {
      let copiedWS: Worksheet = Object.assign({}, worksheet)
      delete copiedWS.id

      let copiedOV: OrderVas = Object.assign({}, targetVas)
      delete copiedOV.id

      copiedOV = await trxMgr.getRepository(OrderVas).save({
        ...copiedOV,
        domain,
        bizplace,
        name: OrderNoGenerator.orderVas(),
        qty: remainQty,
        creator: user,
        updater: user
      })

      // Create new worksheet detail
      await trxMgr.getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        domain,
        bizplace,
        name: WorksheetNoGenerator.vasDetail(),
        copiedOV,
        creator: user,
        updater: user
      })
    }
  }

  let targetVas: OrderVas = foundWorksheetDetail.targetVas
  if (!targetVas) throw new Error("VAS doesn't exists")

  // 1. update status of worksheetDetail (EXECUTING => DONE)
  await trxMgr.getRepository(WorksheetDetail).save({
    ...foundWorksheetDetail,
    ...worksheetDetail,
    status: WORKSHEET_STATUS.DONE,
    updater: user
  })

  // 2. update vas
  await trxMgr.getRepository(OrderVas).save({
    ...targetVas,
    status: ORDER_VAS_STATUS.COMPLETED,
    updater: user
  })
}
