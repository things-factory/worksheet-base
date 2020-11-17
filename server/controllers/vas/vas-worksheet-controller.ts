import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderNoGenerator,
  OrderVas,
  ORDER_STATUS,
  ORDER_TYPES,
  ORDER_VAS_STATUS,
  ReleaseGood,
  VasOrder
} from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import {
  completeRelabeling,
  completeRepackaging,
  completeRepalletizing
} from '../../graphql/resolvers/worksheet/vas-transactions'
import { ReferenceOrderType, WorksheetController } from '.././worksheet-controller'

type CompleteTransactionType = (trxMgr: EntityManager, orderVas: OrderVas, user: User) => Promise<void>

export class VasWorksheetController extends WorksheetController {
  private readonly COMPLETE_TRX_MAP: Record<string, CompleteTransactionType> = {
    'vas-repalletizing': completeRepalletizing,
    'vas-repack': completeRepackaging,
    'vas-relabel': completeRelabeling
  }

  async generateVasWorksheet(referenceOrder: ReferenceOrderType): Promise<Worksheet> {
    let orderVASs: OrderVas[]

    if (referenceOrder instanceof ArrivalNotice) {
      const arrivalNotice: ArrivalNotice = await this.findRefOrder(ArrivalNotice, referenceOrder, ['orderVass'])
      orderVASs = arrivalNotice.orderVass
    } else if (referenceOrder instanceof ReleaseGood) {
      const releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, referenceOrder, ['orderVass'])
      orderVASs = releaseGood.orderVass
    } else {
      const vasOrder: VasOrder = await this.findRefOrder(VasOrder, referenceOrder, ['orderVass'])
      orderVASs = vasOrder.orderVass
    }

    return await this.generateWorksheet(
      WORKSHEET_TYPE.VAS,
      referenceOrder,
      orderVASs,
      referenceOrder.status,
      ORDER_VAS_STATUS.READY_TO_PROCESS
    )
  }

  async assignInventories(worksheetDetailIds: string[], inventories: Partial<Inventory>): Promise<void> {
    const worksheetDetails: WorksheetDetail[] = await this.trxMgr
      .getRepository(WorksheetDetail)
      .findByIds(worksheetDetailIds, {
        relations: [
          'worksheet',
          'targetVas',
          'targetVas.arrivalNotice',
          'targetVas.releaseGood',
          'targetVas.shippingOrder',
          'targetVas.vasOrder',
          'targetVas.vas',
          'targetVas.targetProduct'
        ]
      })

    let seq: number = 0

    for (let worksheetDetail of worksheetDetails) {
      const worksheet: Worksheet = worksheetDetail.worksheet
      const targetVAS: OrderVas = worksheetDetail.targetVas

      let newWorksheetDetail: Partial<WorksheetDetail> = Object.assign({}, worksheetDetail)
      delete newWorksheetDetail.id

      for (let inventory of inventories) {
        let newTargetVAS: OrderVas = Object.assign({}, targetVAS)
        delete newTargetVAS.id

        inventory = await this.trxMgr.getRepository(Inventory).findOne(inventory.id)
        const unitStdUnitValue: number = inventory.stdUnitValue / inventory.qty

        newTargetVAS.domain = this.domain
        newTargetVAS.name = OrderNoGenerator.orderVas()
        newTargetVAS.qty = inventories.qty
        newTargetVAS.stdUnitValue = inventory.qty * unitStdUnitValue
        newTargetVAS.inventory = inventory
        newTargetVAS.creator = this.user
        newTargetVAS.updater = this.user
        newTargetVAS = await this.trxMgr.getRepository(OrderVas).save(newTargetVAS)

        await this.createWorksheetDetails(worksheet, WORKSHEET_TYPE.VAS, [newTargetVAS])
        seq++
      }

      await this.trxMgr.getRepository(WorksheetDetail).delete(worksheetDetail.id)
      await this.trxMgr.getRepository(OrderVas).delete(targetVAS.id)
    }
  }

  async activateVAS(worksheetNo: string, vasWorksheetDetails: Partial<WorksheetDetail>[]): Promise<Worksheet> {
    const worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.VAS, [
      'vasOrder',
      'worksheetDetails',
      'worksheetDetails.targetVas'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetVASs: OrderVas[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetVAS: OrderVas = wsd.targetVas
      targetVAS.status = ORDER_VAS_STATUS.PROCESSING
      targetVAS.updater = this.user
      return targetVAS
    })

    // Update VAS Order if it's pure VAS Order (status: READY_TO_PROCESS => PROCESSING)
    let vasOrder: VasOrder = worksheet.vasOrder
    if (vasOrder?.id) {
      vasOrder.status = ORDER_STATUS.PROCESSING
      vasOrder.updater = this.user

      await this.updateRefOrder(vasOrder)
    }

    await this.updateOrderTargets(targetVASs)
    return await this.activateWorksheet(worksheet, worksheetDetails, vasWorksheetDetails)
  }

  async executeVAS(worksheetDetail: Partial<WorksheetDetail>, palletId?: string): Promise<void> {
    const worksheetDetailName = worksheetDetail.name
    let foundWorksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.VAS,
      [
        'bizplace',
        'worksheet',
        'worksheet.arrivalNotice',
        'worksheet.releaseGood',
        'targetVas',
        'targetVas.vas',
        'targetVas.arrivalNotice',
        'targetVas.releaseGood',
        'targetVas.vasOrder',
        'targetVas.targetProduct'
      ]
    )
    const bizplace: Bizplace = foundWorksheetDetail.bizplace
    const worksheet: Worksheet = foundWorksheetDetail.worksheet

    if (palletId) {
      const inventory: Inventory = await this.checkPalletAcceptable(palletId, worksheet, foundWorksheetDetail)

      let targetVAS: OrderVas = foundWorksheetDetail.targetVas
      const totalTargetQty: number = targetVAS.qty
      // inventory assigment
      targetVAS.inventory = inventory
      // 현재 작업 대상 target vas의 수량을 inventory의 수량 만큼 감소 시킴
      targetVAS.qty = inventory.qty
      targetVAS = await this.trxMgr.getRepository(OrderVas).save(targetVAS)
      // 남은 수량이 있다면 새로운 worksheet detail과 target vas를 생성

      const remainQty: number = totalTargetQty - inventory.qty
      if (remainQty > 0) {
        let newTargetVAS: Partial<OrderVas> = Object.assign({}, targetVAS)
        delete newTargetVAS.id
        newTargetVAS.domain = this.domain
        newTargetVAS.bizplace = bizplace
        newTargetVAS.name = OrderNoGenerator.orderVas()
        newTargetVAS.qty = remainQty
        newTargetVAS.creator = this.user
        newTargetVAS.updater = this.user
        newTargetVAS = await this.trxMgr.getRepository(OrderVas).save(newTargetVAS)

        // Create new worksheet detail
        await this.createWorksheetDetails(worksheet, WORKSHEET_TYPE.VAS, [newTargetVAS], {
          status: foundWorksheetDetail.status
        })
      }
    }

    let targetVAS: OrderVas = foundWorksheetDetail.targetVas
    if (!targetVAS) throw new Error("VAS doesn't exists")

    // 1. update status of worksheetDetail (EXECUTING => DONE)
    foundWorksheetDetail = Object.assign(foundWorksheetDetail, worksheetDetail)
    foundWorksheetDetail.status = WORKSHEET_STATUS.DONE
    foundWorksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(foundWorksheetDetail)

    // 2. update vas
    targetVAS.status = ORDER_VAS_STATUS.COMPLETED
    targetVAS.updater = this.user
    await this.updateOrderTargets([targetVAS])
  }

  async undoVAS(worksheetDetail: Partial<WorksheetDetail>): Promise<void> {
    const worksheetDetailName: string = worksheetDetail.name
    worksheetDetail = await this.findWorksheetDetailByName(worksheetDetailName, [
      'worksheet',
      'targetVas',
      'targetVas.vas',
      'targetVas.vasOrder',
      'targetVas.inventory'
    ])
    this.checkRecordValidity(worksheetDetail, { status: WORKSHEET_STATUS.DONE, type: WORKSHEET_TYPE.VAS })

    let targetVAS: OrderVas = worksheetDetail.targetVas
    targetVAS.status = ORDER_VAS_STATUS.PROCESSING
    targetVAS.updater = this.user
    await this.updateOrderTargets([targetVAS])

    worksheetDetail.status = WORKSHEET_STATUS.EXECUTING
    worksheetDetail.issue = ''
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  private async checkPalletAcceptable(
    palletId: string,
    worksheet: Worksheet,
    worksheetDetail: WorksheetDetail
  ): Promise<Inventory> {
    // inventory가 존재해야함
    const inventory: Inventory = await this.trxMgr.getRepository(Inventory).findOne({
      where: { domain: this.domain, palletId },
      relations: ['product']
    })
    if (!inventory) throw new Error(`Can't find inventory by pallet ID (${palletId})`)

    // 현재 작업 set에서 하나라도 모두 완료된 유형의 VAS가 존재할 경우
    // 해당 VAS를 처리한 pallet 리스트에 한하여 작업을 수행 해야함 (동일한 SET는 동일한 군집의 Pallet을 대상으로 처리되어야 하기 때문에)
    worksheet = await this.trxMgr.getRepository(Worksheet).findOne(worksheet.id, {
      relations: [
        'worksheetDetails',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.inventory',
        'worksheetDetails.targetVas.vas'
      ]
    })

    const vasIds: string[] = worksheet.worksheetDetails
      .filter((wsd: WorksheetDetail) => wsd.targetVas.set === worksheetDetail.targetVas.set)
      .map((wsd: WorksheetDetail) => wsd.targetVas.vas.id)

    let completedCnt: { [key: string]: number } = {}
    vasIds.forEach((vasId: string) => (completedCnt[vasId] = 0))
    worksheet.worksheetDetails.forEach((wsd: WorksheetDetail) => {
      if (wsd.status !== WORKSHEET_STATUS.DONE) {
        completedCnt[wsd.targetVas.vas.id]++
      }
    })
    let finishedVasId: string
    for (let vasId in completedCnt) {
      if (completedCnt[vasId] === 0) {
        finishedVasId = vasId
        break
      }
    }

    if (finishedVasId) {
      const availPalletIds: string[] = worksheet.worksheetDetails
        .filter((wsd: WorksheetDetail) => wsd.targetVas.vas.id === finishedVasId)
        .map((wsd: WorksheetDetail) => wsd.targetVas.inventory.palletId)

      if (availPalletIds.indexOf(inventory.palletId) >= 0) {
        return inventory
      } else {
        throw new Error(
          this.ERROR_MSG.VALIDITY.CANT_PROCEED_STEP_BY('execute VAS', `${palletId} is not suitable for doing this VAS`)
        )
      }
    }

    // refOrder에 따라 적절한 상태를 가지고 있어야함
    // Arrival Notice = 'PARTIALLY_UNLOADED or PUTTING_AWAY
    const refOrder: ArrivalNotice | ReleaseGood = worksheet.arrivalNotice || worksheet.releaseGood
    if (refOrder instanceof ArrivalNotice) {
      const acceptableStatus = [INVENTORY_STATUS.PARTIALLY_UNLOADED, INVENTORY_STATUS.PUTTING_AWAY]
      if (acceptableStatus.indexOf(inventory.status) < 0)
        throw new Error(`The pallet doesn't have right status for doing VAS`)
    } else if (refOrder instanceof ReleaseGood) {
      throw new Error('TODO: Status check for Release Good')
    }

    // target vas의 조건에 충족해야 함 (targetBatchId, targetProduct)
    const { targetBatchId, targetProduct } = worksheetDetail.targetVas
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
    const relatedInvs: Inventory[] = worksheet.worksheetDetails
      .filter(
        (
          wsd: WorksheetDetail // 현재 작업대상이 아니고 현재 작업 대상과 같은 세트가 아니고 인벤토리 값이 있는
        ) =>
          wsd.id !== worksheetDetail.id &&
          wsd.targetVas.set !== worksheetDetail.targetVas.set &&
          wsd.targetVas.inventory
      )
      .map((wsd: WorksheetDetail) => wsd.targetVas.inventory)

    if (relatedInvs.find((relInv: Inventory) => relInv.palletId === inventory.palletId)) {
      throw new Error(`The pallet (${inventory.palletId}) is already assigned for another VAS SET`)
    }

    // 현재 작업유형에 동이한 pallet으로 처리된 이력이 없어야함
    const completedWSD: WorksheetDetail[] = worksheet.worksheetDetails.filter(
      (wsd: WorksheetDetail) =>
        wsd.status === WORKSHEET_STATUS.DONE &&
        wsd.targetVas.set === worksheetDetail.targetVas.set &&
        wsd.targetVas.vas.id === worksheetDetail.targetVas.vas.id
    )

    if (completedWSD.find((wsd: WorksheetDetail) => wsd.targetVas.inventory.palletId === palletId)) {
      throw new Error(
        this.ERROR_MSG.VALIDITY.CANT_PROCEED_STEP_BY('execute VAS', `VAS is finished for pallet (${palletId}) already`)
      )
    }

    return inventory
  }

  async completeVAS(orderNo: string, orderType: string): Promise<Worksheet> {
    const ENTITY_MAP: { [key: string]: ArrivalNotice | ReleaseGood | VasOrder } = {
      [ORDER_TYPES.ARRIVAL_NOTICE]: ArrivalNotice,
      [ORDER_TYPES.RELEASE_OF_GOODS]: ReleaseGood,
      [ORDER_TYPES.VAS_ORDER]: VasOrder
    }
    let refOrder: ReferenceOrderType = await this.findRefOrder(ENTITY_MAP[orderType], {
      domain: this.domain,
      name: orderNo
    })
    let worksheet: Worksheet = await this.findWorksheetByRefOrder(refOrder, WORKSHEET_TYPE.VAS, [
      'worksheetDetails',
      'worksheetDetails.targetVas',
      'worksheetDetails.targetVas.vas'
    ])

    const isPureVAS: boolean = refOrder instanceof VasOrder
    if (isPureVAS) {
      refOrder.status = ORDER_STATUS.DONE
      await this.updateRefOrder(refOrder)
    }

    // Do complete operation transactions if there it is
    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetVASs: OrderVas[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetVas)

    for (const targetVAS of targetVASs) {
      const { issue }: { issue: string } = worksheetDetails.find(
        (wsd: WorksheetDetail) => wsd.targetVas.id === targetVAS.id
      )

      if (targetVAS.operationGuide && !issue) {
        await this.doOperationTransaction(targetVAS)
      }
    }

    worksheet = await this.completeWorksheet(worksheet, ORDER_STATUS.DONE)
    return worksheet
  }

  async doOperationTransaction(targetVAS: OrderVas): Promise<void> {
    const operationGuide: string = targetVAS.vas?.operationGuide
    if (operationGuide) {
      await this.COMPLETE_TRX_MAP[operationGuide](this.trxMgr, targetVAS, this.user)
    }
  }
}
