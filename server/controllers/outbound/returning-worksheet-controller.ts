import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS, INVENTORY_TRANSACTION_TYPE, Location } from '@things-factory/warehouse-base'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { VasWorksheetController } from '../vas/vas-worksheet-controller'

export class ReturningWorksheetController extends VasWorksheetController {
  async generateReturningWorksheet(
    releaseGoodNo: string,
    targetInventories: Partial<OrderInventory>[]
  ): Promise<Worksheet> {
    const releaseGood: ReleaseGood = await this.findRefOrder(
      ReleaseGood,
      { domain: this.domain, name: releaseGoodNo },
      ['bizplace']
    )
    return await this.generateWorksheet(
      WORKSHEET_TYPE.RETURN,
      releaseGood,
      targetInventories,
      ORDER_STATUS.PARTIAL_RETURN,
      ORDER_INVENTORY_STATUS.RETURNING
    )
  }

  async activateReturning(
    worksheetNo: string,
    returningWorksheetDetails: Partial<WorksheetDetail>[]
  ): Promise<Worksheet> {
    const worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.RETURN, [
      'bizplace',
      'releaseGood',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_INVENTORY_STATUS.RETURNING
      targetInventory.updater = this.user
      return targetInventory
    })
    await this.updateOrderTargets(targetInventories)
    return await this.activateWorksheet(worksheet, worksheetDetails, returningWorksheetDetails)
  }

  async returning(worksheetDetailName: string, palletId: string, toLocationName: string): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.RETURN,
      ['worksheet', 'worksheet.releaseGood', 'targetInventory', 'targetInventory.inventory', 'targetInventory.inventory.location']
    )

    const worksheet: Worksheet = worksheetDetail.worksheet
    const releaseGood: ReleaseGood = worksheet.releaseGood
    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    let inventory: Inventory = targetInventory.inventory

    const originLocation: Location = inventory.location
    const originPalletId: string = inventory.palletId

    const toLocation: Location = await this.trxMgr.getRepository(Location).findOne({
      where: { domain: this.domain, name: toLocationName },
      relations: ['warehouse']
    })
    if (!toLocation) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(toLocationName))

    const isPalletDiff: boolean = originPalletId !== palletId
    if (isPalletDiff) {
      throw new Error(this.ERROR_MSG.VALIDITY.CANT_PROCEED_STEP_BY('return', 'pallet ID is not matched'))
    }

    inventory.qty += targetInventory.releaseQty
    inventory.stdUnitValue += targetInventory.releaseStdUnitValue
    inventory.status = INVENTORY_STATUS.STORED

    const isLocationChanged: boolean = originLocation.id !== toLocation.id
    if (isLocationChanged) {
      inventory.location = toLocation
      inventory.warehouse = toLocation.warehouse
      inventory.zone = toLocation.zone
    }

    await this.transactionInventory(
      inventory,
      releaseGood,
      targetInventory.releaseQty,
      targetInventory.releaseStdUnitValue,
      INVENTORY_TRANSACTION_TYPE.RETURN
    )

    // update status of order inventory
    targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])

    // update status of worksheet detail (EXECUTING => DONE)
    worksheetDetail.status = WORKSHEET_STATUS.DONE
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  async completeReturning(releaseGoodNo: string): Promise<Worksheet> {
    const releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, {
      domain: this.domain,
      name: releaseGoodNo,
      status: ORDER_STATUS.PARTIAL_RETURN
    })

    const worksheet: Worksheet = await this.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.RETURN, [
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    return await this.completeWorksheet(worksheet, ORDER_STATUS.DONE)
  }
}
