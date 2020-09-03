import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, OrderVas, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { VasWorksheetController } from '../vas/vas-worksheet-controller'

export class PickingWorksheetController extends VasWorksheetController {
  async generatePickingWorksheet(releaseGoodNo: string): Promise<Worksheet> {
    let releaseGood: ReleaseGood = await this.findRefOrder(
      ReleaseGood,
      {
        domain: this.domain,
        name: releaseGoodNo,
        status: ORDER_STATUS.PENDING_RECEIVE
      },
      ['bizplace', 'orderInventories', 'orderInventories.inventory', 'orderVass']
    )
    const bizplace: Bizplace = releaseGood.bizplace
    const orderInventories: OrderInventory[] = releaseGood.orderInventories
    const orderVASs: OrderVas[] = releaseGood.orderVass

    let worksheet: Worksheet = await this.createWorksheet(bizplace, releaseGood, WORKSHEET_TYPE.PICKING)

    if (orderInventories.every((oi: OrderInventory) => oi.inventory?.id) || releaseGood.crossDocking) {
      worksheet.worksheetDetails = await this.createWorksheetDetails(
        worksheet,
        WORKSHEET_TYPE.PICKING,
        orderInventories
      )

      const inventories: Inventory[] = orderInventories.map((oi: OrderInventory) => {
        let inventory: Inventory = oi.inventory
        inventory.lockedQty = oi.releaseQty
        inventory.lockedWeight = oi.releaseWeight
        inventory.updater = this.user
      })

      await this.trxMgr.getRepository(Inventory).save(inventories)
    }

    orderInventories.forEach((oi: OrderInventory) => {
      oi.status =
        oi.crossDocking || oi.inventory?.id
          ? ORDER_INVENTORY_STATUS.READY_TO_PICK
          : ORDER_INVENTORY_STATUS.PENDING_SPLIT
      oi.updater = this.user
    })
    await this.updateOrderTargets(orderInventories)

    if (orderVASs?.length > 0) {
      await this.generateVasWorksheet(releaseGood)
    }

    releaseGood.status = ORDER_STATUS.READY_TO_PICK
    releaseGood.updater = this.user
    await this.updateRefOrder(releaseGood)

    return worksheet
  }

  async activatePicking(worksheetNo: string): Promise<Worksheet> {
    let worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.PICKING, [
      'releaseGood',
      'worksheetDetails',
      'worksheetDestails.targetInventory'
    ])

    const worksheetDestails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetInventories: OrderInventory[] = worksheetDestails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_INVENTORY_STATUS.PICKING
      targetInventory.updater = this.user
      return targetInventory
    })
    this.updateOrderTargets(targetInventories)

    let releaseGood: ReleaseGood = worksheet.releaseGood
    releaseGood.status = ORDER_STATUS.PICKING
    releaseGood.updater = this.user
    this.updateRefOrder(releaseGood)

    worksheet = await this.activateWorksheet(worksheet, worksheetDestails, [])

    const vasWorksheet: Worksheet = await this.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.VAS)
    if (vasWorksheet) {
      await this.activateVAS(vasWorksheet.name, vasWorksheet.worksheetDetails)
    }

    const pendingSplitOIs: OrderInventory[] = await this.trxMgr.getRepository(OrderInventory).find({
      where: { domain: this.domain, releaseGood, status: ORDER_INVENTORY_STATUS.PENDING_SPLIT }
    })
    if (pendingSplitOIs?.length) {
      const ids: string[] = pendingSplitOIs.map((oi: OrderInventory) => oi.id)
      await this.trxMgr.getRepository(OrderInventory).delete(ids)
    }

    return worksheet
  }

  async completePicking(releaseGoodNo: string): Promise<Worksheet> {
    let releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, {
      domain: this.domain,
      name: releaseGoodNo,
      status: ORDER_STATUS.PICKING
    })

    const worksheet: Worksheet = await this.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.PICKING, [
      'worksheetDestails',
      'worksheetDestails.targetInventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    return await this.completWorksheet(worksheet, ORDER_STATUS.LOADING)
  }
}
