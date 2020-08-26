import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, InventoryCheck, ReleaseGood, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { WORKSHEET_STATUS } from 'server/constants'
import { EntityManager, EntitySchema, FindOneOptions } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../entities'
import { WorksheetNoGenerator } from '../utils'

export type ReferenceOrderType = ArrivalNotice | ReleaseGood | VasOrder | InventoryCheck

export interface GenerateInterface {
  domain: Domain
  user: User
}

export class WorksheetController {
  protected trxMgr: EntityManager

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
  async createWorksheet(
    domain: Domain,
    bizplace: Bizplace,
    refOrder: ReferenceOrderType,
    type: string,
    user: User,
    ...additionlProps: Partial<Worksheet>[]
  ): Promise<Worksheet> {
    let refOrderType: string = ''
    if (refOrder instanceof ArrivalNotice) {
      refOrderType = 'arrivalNotice'
    } else if (refOrder instanceof ReleaseGood) {
      refOrderType = 'releaseGood'
    } else {
      refOrderType = 'vasOrder'
    }

    const worksheet: Partial<Worksheet> = {
      domain,
      bizplace,
      name: WorksheetNoGenerator.generate(type),
      type,
      status: WORKSHEET_STATUS.DEACTIVATED,
      creator: user,
      updater: user,
      [refOrderType]: refOrder,
      ...additionlProps
    }

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

  async findWorksheet(
    domain: Domain,
    refOrder: ReferenceOrderType,
    type: string,
    relations: string[] = ['worksheetDetails']
  ): Promise<Worksheet> {
    let condition: FindOneOptions = { where: { domain, type }, relations }
    if (refOrder instanceof ArrivalNotice) {
      condition.where['arrivalNotice'] = refOrder
    } else if (refOrder instanceof ReleaseGood) {
      condition.where['releaseGood'] = refOrder
    } else if (refOrder instanceof InventoryCheck) {
      condition.where['inventoryCheck'] = refOrder
    } else {
      condition.where['vasOrder'] = refOrder
    }

    const worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne(condition)
    if (!worksheet) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(type))

    return worksheet
  }
}
