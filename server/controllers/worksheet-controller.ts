import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderInventory,
  OrderProduct,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_VAS_STATUS,
  ReleaseGood,
  VasOrder
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location } from '@things-factory/warehouse-base'
import { EntityManager, EntitySchema, FindOneOptions } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'
import { WorksheetNoGenerator } from '../utils'

type ReferenceOrderType = ArrivalNotice | ReleaseGood | VasOrder

export interface GenerateUnloadingInterface {
  type: 'UNLOADING'
  domain: Domain
  user: User
  arrivalNoticeNo: string
  bufferLocationId: string
}

export interface GeneratePutawayInterface {
  type: 'PUTAWAY'
}

export interface GeneratePickingInterface {
  type: 'PICKING'
  domain: Domain
  user: User
  releaseGoodNo: string
}
export interface GenerateLoadingInterface {
  type: 'LOADING'
}

export interface GenerateVasInterface {
  type: 'VAS'
  domain: Domain
  user: User
  referenceOrder: ReferenceOrderType
}

export class WorksheetController {
  private trxMgr: EntityManager

  public readonly ERROR_MSG = {
    FIND: {
      NO_RESULT: (condition: any) => `There's no results matched with condition ${condition}`
    },
    CREATE: {
      ID_EXISTS: 'Target has ID already',
      EMPTY_CREATOR: 'Cannot create without creator',
      EMPTY_UPDATER: 'Cannot create without updater'
    },
    UPDATE: {
      ID_NOT_EXISTS: `Target doesn't have ID`,
      EMPTY_UPDATER: 'Cannot update without updater'
    }
  }

  constructor(trxMgr: EntityManager) {
    this.trxMgr = trxMgr
  }

  async generate(worksheetInterface: GenerateUnloadingInterface): Promise<Worksheet>
  async generate(worksheetInterface: GeneratePutawayInterface): Promise<Worksheet>
  async generate(worksheetInterface: GeneratePickingInterface): Promise<Worksheet>
  async generate(worksheetInterface: GenerateLoadingInterface): Promise<Worksheet>
  async generate(worksheetInterface: GenerateVasInterface): Promise<Worksheet>
  async generate(worksheetInterface: any): Promise<Worksheet> {
    let worksheet: Worksheet

    switch (worksheetInterface.type) {
      case 'UNLOADING':
        worksheet = await this.generateUnloadingWorksheet(worksheetInterface)
        break

      case 'PUTAWAY':
        worksheet = await this.generatePutawayWorksheet(worksheetInterface)
        break

      case 'PICKING':
        worksheet = await this.generatePickingWorksheet(worksheetInterface)
        break

      case 'LOADING':
        worksheet = await this.generateLoadingWorksheet(worksheetInterface)
        break

      case 'VAS':
        worksheet = await this.generateVasWorksheet(worksheetInterface)
        break
    }

    return worksheet
  }

  /**
   * @summary Generate Unloading Worksheet
   * @description
   * Create unloading worksheet
   *  - status: DEACTIVATED
   *
   * Create unloading worksheet details
   *  - status: DEACTIVATED
   *
   * Update status of orderProducts
   *  - status: ARRIVED => READY_TO_UNLOAD
   *
   * Call generateVasWorksheet function if it's needed
   *
   * Update status of arrival notice
   *  - status: ARRIVED => READY_TO_UNLOAD
   * @param {GenerateUnloadingInterface} worksheetInterface
   * @returns {Promise<Worksheet>}
   */
  async generateUnloadingWorksheet(worksheetInterface: GenerateUnloadingInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    let arrivalNotice: ArrivalNotice = await this.findRefOrder(
      ArrivalNotice,
      {
        domain,
        name: worksheetInterface.arrivalNoticeNo,
        status: ORDER_STATUS.ARRIVED
      },
      ['bizplace', 'orderProducts', 'orderVass']
    )
    const bizplace: Bizplace = arrivalNotice.bizplace
    const orderProducts: OrderProduct[] = arrivalNotice.orderProducts
    const orderVASs: OrderVas[] = arrivalNotice.orderVass

    const bufferLocationId: string = worksheetInterface.bufferLocationId
    const bufferLocation: Location = await this.trxMgr.getRepository(Location).findOne(bufferLocationId)

    const worksheet: Worksheet = await this.createWorksheet({
      domain,
      bizplace,
      name: WorksheetNoGenerator.unloading(),
      bufferLocation,
      arrivalNotice,
      type: WORKSHEET_TYPE.UNLOADING,
      status: WORKSHEET_STATUS.DEACTIVATED,
      creator: user,
      updater: user
    })

    const worksheetDetails: Partial<WorksheetDetail>[] = orderProducts.map((targetProduct: OrderProduct) => {
      return {
        domain,
        bizplace,
        worksheet,
        name: WorksheetNoGenerator.unloadingDetail(),
        type: WORKSHEET_TYPE.UNLOADING,
        targetProduct,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      } as Partial<WorksheetDetail>
    })
    await this.createWorksheetDetails(worksheetDetails)

    orderProducts.forEach((ordProd: OrderProduct) => {
      ordProd.status = ORDER_PRODUCT_STATUS.READY_TO_UNLOAD
      ordProd.updater = user
    })
    await this.updateOrderTargets(OrderProduct, orderProducts)

    if (orderVASs?.length > 0) {
      await this.generateVasWorksheet({
        domain,
        user,
        referenceOrder: arrivalNotice
      } as GenerateVasInterface)
    }

    arrivalNotice.status = ORDER_STATUS.READY_TO_UNLOAD
    arrivalNotice.updater = user
    await this.updateRefOrder(ArrivalNotice, arrivalNotice)

    return worksheet
  }

  async generatePutawayWorksheet(worksheetInterface: GeneratePutawayInterface): Promise<Worksheet> {
    return
  }

  /**
   * @summary Generate Picking Worksheet
   * @description
   * Create picking worksheet
   *  - status: DEACTIVATED
   *
   * Create picking worksheet details
   *  - status: DEACTIVATED
   *
   * Update status of orderInventories
   *  - status: PENDING_RECEIVE => READY_TO_PICK
   *
   * Call generateVasWorksheet function if it's needed
   *
   * Update status of release good
   *  - status: PENDING_RECEIVE => READY_TO_UNLOAD
   * @param {GenerateUnloadingInterface} worksheetInterface
   * @returns {Promise<Worksheet>}
   */
  async generatePickingWorksheet(worksheetInterface: GeneratePickingInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    let releaseGood: ReleaseGood = await this.findRefOrder(
      ReleaseGood,
      {
        domain,
        name: worksheetInterface.releaseGoodNo,
        status: ORDER_STATUS.PENDING_RECEIVE
      },
      ['bizplace', 'orderInventories', 'orderInventories.inventory', 'orderVass']
    )
    const bizplace: Bizplace = releaseGood.bizplace
    const orderInventories: OrderInventory[] = releaseGood.orderInventories
    const orderVASs: OrderVas[] = releaseGood.orderVass

    const worksheet: Worksheet = await this.createWorksheet({
      domain,
      bizplace,
      name: WorksheetNoGenerator.picking(),
      releaseGood,
      type: WORKSHEET_TYPE.PICKING,
      status: WORKSHEET_STATUS.DEACTIVATED,
      creator: user,
      updater: user
    })

    if (orderInventories.every((oi: OrderInventory) => oi.inventory?.id) || releaseGood.crossDocking) {
      const worksheetDetails: Partial<WorksheetDetail>[] = orderInventories.map((targetInventory: OrderInventory) => {
        return {
          domain,
          bizplace,
          worksheet,
          name: WorksheetNoGenerator.pickingDetail(),
          targetInventory,
          type: WORKSHEET_TYPE.PICKING,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: user,
          updater: user
        } as Partial<WorksheetDetail>
      })
      await this.createWorksheetDetails(worksheetDetails)

      const inventories: Inventory[] = orderInventories.map((oi: OrderInventory) => {
        let inventory: Inventory = oi.inventory
        inventory.lockedQty = oi.releaseQty
        inventory.lockedWeight = oi.releaseWeight
        inventory.updater = user
      })

      await this.trxMgr.getRepository(Inventory).save(inventories)
    }

    orderInventories.forEach((oi: OrderInventory) => {
      oi.status =
        oi.crossDocking || oi.inventory?.id
          ? ORDER_INVENTORY_STATUS.READY_TO_PICK
          : ORDER_INVENTORY_STATUS.PENDING_SPLIT
      oi.updater = user
    })
    await this.updateOrderTargets(OrderInventory, orderInventories)

    if (orderVASs?.length > 0) {
      await this.generateVasWorksheet({
        domain,
        user,
        referenceOrder: releaseGood
      } as GenerateVasInterface)
    }

    releaseGood.status = ORDER_STATUS.READY_TO_PICK
    releaseGood.updater = user
    await this.updateRefOrder(ReleaseGood, releaseGood)

    return worksheet
  }

  async generateLoadingWorksheet(worksheetInterface: GenerateLoadingInterface): Promise<Worksheet> {
    return
  }

  /**
   * @summary Generate VAS Worksheet
   * @description
   * Create VAS worksheet
   *  - status: DEACTIVATED
   *
   * Create VAS worksheet details
   *  - status: DEACTIVATED
   *
   * Update status of orderVass
   *  - status: ARRIVED => READY_TO_PROCESS
   *
   * @param {GenerateVasInterface} worksheetInterface
   * @returns {Promise<Worksheet>}
   */
  async generateVasWorksheet(worksheetInterface: GenerateVasInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const referenceOrder: ReferenceOrderType = worksheetInterface.referenceOrder
    const user: User = worksheetInterface.user

    let bizplace: Bizplace
    let worksheet: Partial<Worksheet> = {
      domain,
      name: WorksheetNoGenerator.vas(),
      type: WORKSHEET_TYPE.VAS,
      status: WORKSHEET_STATUS.DEACTIVATED,
      creator: user,
      updater: user
    }

    let orderVASs: OrderVas[]

    if (referenceOrder instanceof ArrivalNotice) {
      if (!referenceOrder.bizplace?.id) {
        const arrivalNotice: ArrivalNotice = await this.findRefOrder(ArrivalNotice, referenceOrder, [
          'bizplace',
          'orderVass'
        ])
        bizplace = arrivalNotice.bizplace
        worksheet.arrivalNotice = arrivalNotice
        worksheet.bizplace = bizplace

        orderVASs = arrivalNotice.orderVass
      }
    } else if (referenceOrder instanceof ReleaseGood) {
      const releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, referenceOrder, ['bizplace', 'orderVass'])
      bizplace = releaseGood.bizplace
      worksheet.releaseGood = releaseGood
      worksheet.bizplace = bizplace

      orderVASs = releaseGood.orderVASs
    } else {
    }

    worksheet = await this.createWorksheet(worksheet)

    const vasWorksheetDetails: Partial<WorksheetDetail>[] = orderVASs.map((targetVas: OrderVas) => {
      return {
        domain,
        bizplace,
        worksheet,
        name: WorksheetNoGenerator.vasDetail(),
        targetVas,
        type: WORKSHEET_TYPE.VAS,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      } as Partial<WorksheetDetail>
    })
    worksheet.worksheetDetails = await this.createWorksheetDetails(vasWorksheetDetails)

    orderVASs.forEach((ordVas: OrderVas) => {
      ordVas.status = ORDER_VAS_STATUS.READY_TO_PROCESS
      ordVas.updater = user
    })
    await this.updateOrderTargets(OrderVas, orderVASs)

    return worksheet as Worksheet
  }

  /**
   * @summary Insert worksheet into worksheet table
   * @description
   * Insert an worksheet into worksheets table
   * Because it's creating function passed worksheet shouldn't have id
   * and should have creator & updater
   * If passed param doesn't fit up those conditions it will throw an error
   *
   * @param {Partial<Worksheet>} worksheet
   * @returns {Promise<Worksheet>}
   */
  async createWorksheet(worksheet: Partial<Worksheet>): Promise<Worksheet> {
    if (worksheet.id) throw new Error(this.ERROR_MSG.CREATE.ID_EXISTS)

    if (!worksheet.creator) throw new Error(this.ERROR_MSG.CREATE.EMPTY_CREATOR)
    if (!worksheet.updater) throw new Error(this.ERROR_MSG.CREATE.EMPTY_UPDATER)

    return await this.trxMgr.getRepository(Worksheet).save(worksheet)
  }

  /**
   * @summary Insert worksheet details into worksheet details table
   * @description
   * Insert worksheetDetails into worksheet_details table
   * Because it's creating function every passed worksheetDetails shouldn't have id
   * and should have creator & updater
   * If passed param doesn't fit up those conditions it will throw an error
   *
   * @param {Partial<WorksheetDetail>[]} worksheetDetails
   * @returns {Promise<WorksheetDetail[]>}
   */
  async createWorksheetDetails(worksheetDetails: Partial<WorksheetDetail>[]): Promise<WorksheetDetail[]> {
    if (worksheetDetails.some((wsd: Partial<WorksheetDetail>) => wsd.id))
      throw new Error(this.ERROR_MSG.CREATE.ID_EXISTS)
    if (worksheetDetails.some((wsd: Partial<WorksheetDetail>) => !wsd.creator))
      throw new Error(this.ERROR_MSG.CREATE.EMPTY_CREATOR)
    if (worksheetDetails.some((wsd: Partial<WorksheetDetail>) => !wsd.updater))
      throw new Error(this.ERROR_MSG.CREATE.EMPTY_UPDATER)

    return await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)
  }

  /**
   * @summary Find reference order (ArrivalNotice, ReleaseGood, VasOrder)
   * @description
   * Find and return reference order with its relations by passed condition & reltaions
   * If there's no found result it will throw an error
   *
   * @param {EntitySchema} entitySchema
   * @param {Partial<ReferenceOrderType>} condition
   * @param {string[]} [relations]
   * @returns {Promise<ReferenceOrderType>}
   */
  async findRefOrder(
    entitySchema: EntitySchema,
    condition: Partial<ReferenceOrderType>,
    relations?: string[]
  ): Promise<ReferenceOrderType> {
    let findOption: FindOneOptions = { where: condition }
    if (relations?.length > 0) findOption.relations = relations

    return await this.trxMgr.getRepository(entitySchema).findOne(findOption)
  }

  /**
   * @summary Update order targets (OrderProduct, OrderInventory, OrderVas)
   * @description
   * Update order targets like (OrderProduct, OrderInventory, OrderVas)
   * Because it's updating function every passed worksheetDetails should have id and updater
   * If passed param is not fitted up with above condition it will throw an error
   *
   * @param {EntitySchema} entitySchema
   * @param {any[]} orderTargets
   * @returns {Promise<any>}
   */
  async updateOrderTargets(entitySchema: EntitySchema, orderTargets: any[]): Promise<any> {
    if (orderTargets.some((orderTarget: any) => !orderTarget.id)) throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)
    if (orderTargets.some((orderTarget: any) => !orderTarget.updater?.id))
      throw new Error(this.ERROR_MSG.UPDATE.EMPTY_UPDATER)

    return await this.trxMgr.getRepository(entitySchema).save(orderTargets)
  }

  /**
   * @summary Update reference order (ArrivalNotice, ReleaseGood, VasOrder)
   * @description
   * Update reference order like (ArrivalNotice, ReleaseGood, VasOrder)
   * Because it's updating function passed refOrder should have id and updater
   * If passed param is not fitted up with above conditions it will throw an error
   *
   * @param {EntitySchema} entitySchema
   * @param {ReferenceOrderType} refOrder
   * @returns {Promise<any>}
   */
  async updateRefOrder(entitySchema: EntitySchema, refOrder: ReferenceOrderType): Promise<any> {
    if (!refOrder.id) throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)
    if (!refOrder.updater?.id) throw new Error(this.ERROR_MSG.UPDATE.EMPTY_UPDATER)

    return await this.trxMgr.getRepository(entitySchema).save(refOrder)
  }
}
