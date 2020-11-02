import { Role, User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  DeliveryOrder,
  InventoryCheck,
  OrderInventory,
  OrderProduct,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ORDER_PRODUCT_STATUS,
  ORDER_VAS_STATUS,
  ReleaseGood,
  VasOrder
} from '@things-factory/sales-base'
import { Domain, sendNotification } from '@things-factory/shell'
import { Inventory, Pallet, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, EntitySchema, Equal, FindOneOptions, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'
import { generateInventoryHistory, WorksheetNoGenerator } from '../utils'

export type ReferenceOrderType = ArrivalNotice | ReleaseGood | VasOrder | InventoryCheck | DeliveryOrder
export type OrderTargetTypes = OrderProduct | OrderInventory | OrderVas

export enum ReferenceOrderFields {
  ArrivalNotice = 'arrivalNotice',
  ReleaseGood = 'releaseGood',
  VasOrder = 'vasOrder',
  InventoryCheck = 'inventoryCheck'
}

export enum OrderTargetFields {
  OrderProduct = 'targetProduct',
  OrderInventory = 'targetInventory',
  OrderVas = 'targetVas'
}

export interface BasicInterface {
  domain: Domain
  user: User
}

export type NotificationMsgInterface = {
  title: string
  message: string
  url: string
}

export class WorksheetController {
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
    },
    VALIDITY: {
      UNEXPECTED_FIELD_VALUE: (field: string, expectedValue: any, actualValue: any) =>
        `Expected ${field} value is ${expectedValue} but got ${actualValue}`,
      DUPLICATED: (field: string, value: any) => `There is duplicated ${field} value (${value})`,
      CANT_PROCEED_STEP_BY: (step: string, reason: string) => `Can't proceed to ${step} it because ${reason}`
    }
  }

  private readonly ROLE_NAMES: Record<string, string> = {
    OFFICE_ADMIN: 'Office Admin'
  }

  protected trxMgr: EntityManager
  protected domain: Domain
  protected user: User

  constructor(trxMgr: EntityManager, domain: Domain, user: User) {
    this.trxMgr = trxMgr
    this.domain = domain
    this.user = user
  }

  private getRefOrderField(refOrder: ReferenceOrderType): string {
    if (refOrder instanceof ArrivalNotice) {
      return ReferenceOrderFields.ArrivalNotice
    } else if (refOrder instanceof ReleaseGood) {
      return ReferenceOrderFields.ReleaseGood
    } else if (refOrder instanceof VasOrder) {
      return ReferenceOrderFields.VasOrder
    } else if (refOrder instanceof InventoryCheck) {
      return ReferenceOrderFields.InventoryCheck
    } else {
      throw new Error(
        this.ERROR_MSG.VALIDITY.UNEXPECTED_FIELD_VALUE('refOrder', 'One of referece order type', refOrder)
      )
    }
  }

  private getOrderTargetField(orderTarget: OrderTargetTypes): string {
    if (orderTarget instanceof OrderProduct) {
      return OrderTargetFields.OrderProduct
    } else if (orderTarget instanceof OrderInventory) {
      return OrderTargetFields.OrderInventory
    } else if (orderTarget instanceof OrderVas) {
      return OrderTargetFields.OrderVas
    } else {
      this.ERROR_MSG.VALIDITY.UNEXPECTED_FIELD_VALUE('orderTarget', 'One of order target type', orderTarget)
    }
  }

  /**
   * @summary Find reference order (ArrivalNotice, ReleaseGood, VasOrder, etc...)
   * @description
   * Find and return reference order with its relations based on passed condition & reltaions
   */
  async findRefOrder(
    entitySchema: EntitySchema,
    condition: Partial<ReferenceOrderType>,
    relations?: string[]
  ): Promise<ReferenceOrderType> {
    condition = this.tidyConditions(condition)
    let findOption: FindOneOptions = { where: condition }
    if (relations?.length > 0) findOption.relations = relations

    const refOrder: ReferenceOrderType = await this.trxMgr.getRepository(entitySchema).findOne(findOption)
    if (!refOrder) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(findOption))

    return refOrder
  }

  /**
   * @summary find worksheet by passed condition
   * @description find worksheey based on passed condition
   * It will return worksheetDetail as its relation by default
   * If you want to get additional relations you need to define reltaions
   * ex) findWorksheet(condition, ['arrivalNotice', 'releaseGood'])
   */
  async findWorksheet(condition: Record<string, any>, relations: string[] = ['worksheetDetails']): Promise<Worksheet> {
    condition = this.tidyConditions(condition)
    const worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
      where: {
        domain: this.domain,
        ...condition
      },
      relations
    })

    if (!worksheet) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(condition))
    return worksheet
  }

  /**
   * @summary Find worksheet by passed params
   * @description Find and return worksheet based on passed ID
   * It will return worksheetDetail as its relation by default
   * If you want to get additional relations you need to define reltaions
   * ex) findWorksheetById(id, ['arrivalNotice', 'releaseGood'])
   */
  async findWorksheetById(id: string, relations: string[] = ['worksheetDetails']): Promise<Worksheet> {
    const worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne(id, { relations })
    if (!worksheet) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(id))

    return worksheet
  }

  /**
   * @summary Find worksheet by passed params
   * @description Find and return worksheet based on worksheet no
   * It will return worksheetDetail as its relation by default
   * If you want to get additional relations you need to define reltaions
   * ex) findWorksheetByNo(worksheetNo, ['arrivalNotice', 'releaseGood'])
   */
  async findWorksheetByNo(worksheetNo: string, relations: string[] = ['worksheetDetails']): Promise<Worksheet> {
    const worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
      where: { domain: this.domain, name: worksheetNo },
      relations
    })

    if (!worksheet) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(worksheetNo))

    return worksheet
  }

  /**
   * @summary Find worksheet by passed params.
   * @description Find and return worksheet based on worksheet no
   * It will return worksheetDetail as its relation by default
   * If you want to get additional relations you need to define reltaions
   * ex) findWorksheetByNo(worksheetNo, ['arrivalNotice', 'releaseGood'])
   */
  async findWorksheetByRefOrder(
    refOrder: ReferenceOrderType,
    type: string,
    relations: string[] = ['worksheetDetails']
  ): Promise<Worksheet> {
    const refOrderField: string = this.getRefOrderField(refOrder)
    if (!refOrder.bizplace?.id) {
      switch (refOrderField) {
        case ReferenceOrderFields.ArrivalNotice:
          refOrder = await this.findRefOrder(ArrivalNotice, refOrder, ['bizplace'])
          break

        case ReferenceOrderFields.ReleaseGood:
          refOrder = await this.findRefOrder(ReleaseGood, refOrder, ['bizplace'])
          break

        case ReferenceOrderFields.VasOrder:
          refOrder = await this.findRefOrder(VasOrder, refOrder, ['bizplace'])
          break

        case ReferenceOrderFields.InventoryCheck:
          refOrder = await this.findRefOrder(InventoryCheck, refOrder, ['bizplace'])
          break
      }
    }

    const bizplace: Bizplace = refOrder.bizplace
    const condition: FindOneOptions = {
      where: {
        bizplace,
        domain: this.domain,
        type,
        [refOrderField]: refOrder
      },
      relations
    }

    const worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne(condition)
    if (!worksheet) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(type))

    return worksheet
  }

  /**
   * @summary Find activatable worksheet by worksheet no and type
   * @description Find worksheet by passed worksheet no
   * and check validity by passed type and status (DEACTIVATED)
   * It will return worksheetDetail as its relation by default
   * If you want to get additional relations you need to define reltaions
   * ex) findActivatableWorksheet(worksheetNo, type, ['arrivalNotice])
   */
  async findActivatableWorksheet(
    worksheetNo: string,
    type: string,
    relations: string[] = ['worksheetDetails']
  ): Promise<Worksheet> {
    const worksheet: Worksheet = await this.findWorksheetByNo(worksheetNo, relations)
    this.checkRecordValidity(worksheet, { type, status: WORKSHEET_STATUS.DEACTIVATED })

    return worksheet
  }

  /**
   * @summary Find executable worksheet detail by its name
   * @description Find worksheet detail by passwd worksheet detail name
   * and check validity by passed type and status (EXECUTING)
   * If you want to get additional relations you need to define relations
   * ex) findExecutableWorksheetDetailByName(worksheetDetailName, type, ['arrivalNotice'])
   */
  async findActivatableWorksheetDetailByName(
    worksheetDetailName: string,
    type: string,
    relations: string[] = []
  ): Promise<WorksheetDetail> {
    const worksheetDetail: WorksheetDetail = await this.findWorksheetDetailByName(worksheetDetailName, relations)
    this.checkRecordValidity(worksheetDetail, { type, status: WORKSHEET_STATUS.DEACTIVATED })

    return worksheetDetail
  }

  /**
   * @summary find worksheet detail by passed condition
   * @description find worksheey based on passed condition
   * If you want to get additional relations you need to define reltaions
   * ex) findWorksheetDetail(condition, ['worksheet'])
   */
  async findWorksheetDetail(condition: Record<string, any>, relations?: string[]): Promise<WorksheetDetail> {
    condition = this.tidyConditions(condition)
    const worksheetDetail: WorksheetDetail = await this.trxMgr.getRepository(WorksheetDetail).findOne({
      where: {
        domain: this.domain,
        ...condition
      },
      relations
    })

    if (!worksheetDetail) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(condition))
    return worksheetDetail
  }

  /**
   * @summary find worksheet detail by passed worksheet detail name
   * @description find worksheey based on passed name of worksheet detail
   * If you want to get additional relations you need to define reltaions
   * ex) findWorksheetDetail(condition, ['worksheet'])
   */
  async findWorksheetDetailByName(worksheetDetailName: string, relations?: string[]): Promise<WorksheetDetail> {
    const worksheetDetail: WorksheetDetail = await this.trxMgr.getRepository(WorksheetDetail).findOne({
      where: { domain: this.domain, name: worksheetDetailName },
      relations
    })

    if (!worksheetDetail) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(worksheetDetailName))
    return worksheetDetail
  }

  /**
   * @summary Find executable worksheet detail by its name
   * @description Find worksheet detail by passwd worksheet detail name
   * and check validity by passed type and status (EXECUTING)
   * If you want to get additional relations you need to define relations
   * ex) findExecutableWorksheetDetailByName(worksheetDetailName, type, ['arrivalNotice'])
   */
  async findExecutableWorksheetDetailByName(
    worksheetDetailName: string,
    type: string,
    relations: string[] = []
  ): Promise<WorksheetDetail> {
    const worksheetDetail: WorksheetDetail = await this.findWorksheetDetailByName(worksheetDetailName, relations)
    this.checkRecordValidity(worksheetDetail, { type, status: WORKSHEET_STATUS.EXECUTING })

    return worksheetDetail
  }

  /**
   * @summary Creating worksheet
   * @description creating worksheet by passed params
   * It will set status as DEACTIVATED by default
   * If you want to define status by yourself, need to pass status in additionalProps
   * ex) createWorksheet(refOrder, type, { status: WORKSHEET_STATUS.ACTIVATED })
   */
  async createWorksheet(
    refOrder: ReferenceOrderType,
    type: string,
    additionalProps: Partial<Worksheet> = {}
  ): Promise<Worksheet> {
    let refOrderType: string = this.getRefOrderField(refOrder)
    const bizplace: Bizplace = await this.extractBizplaceFromRefOrder(refOrder)

    const worksheet: Partial<Worksheet> = {
      domain: this.domain,
      bizplace,
      name: WorksheetNoGenerator.generate(type),
      type,
      status: WORKSHEET_STATUS.DEACTIVATED,
      creator: this.user,
      updater: this.user,
      [refOrderType]: refOrder,
      ...additionalProps
    }

    if (worksheet.id) throw new Error(this.ERROR_MSG.CREATE.ID_EXISTS)

    return await this.trxMgr.getRepository(Worksheet).save(worksheet)
  }

  /**
   * @summary Creating worksheet details
   * @description creating worksheet details by passed params
   * It will set status as DEACTIVATED by default
   * If you want to define status by yourself, need to pass status in additionalProps
   * ex) createWorksheetDetails(refOrder, type, { status: WORKSHEET_STATUS.ACTIVATED })
   *
   */
  async createWorksheetDetails(
    worksheet: Worksheet,
    type: string,
    orderTargets: OrderTargetTypes[],
    additionalProps: Partial<WorksheetDetail> = {}
  ): Promise<WorksheetDetail[]> {
    if (!worksheet.bizplace?.id) {
      worksheet = await this.findWorksheetById(worksheet.id, ['bizplace'])
    }
    const bizplace: Bizplace = worksheet.bizplace

    const worksheetDetails: Partial<WorksheetDetail>[] = orderTargets.map((orderTarget: OrderTargetTypes) => {
      const orderTargetField: string = this.getOrderTargetField(orderTarget)
      return {
        domain: this.domain,
        bizplace,
        worksheet,
        name: WorksheetNoGenerator.generate(type, true),
        type,
        status: WORKSHEET_STATUS.DEACTIVATED,
        [orderTargetField]: orderTarget,
        creator: this.user,
        updater: this.user,
        ...additionalProps
      }
    })

    if (worksheetDetails.some((wsd: Partial<WorksheetDetail>) => wsd.id))
      throw new Error(this.ERROR_MSG.CREATE.ID_EXISTS)

    return await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)
  }

  /**
   * @summary Update reference order (ArrivalNotice, ReleaseGood, VasOrder, InventoryCheck)
   * @description
   * Update reference order like (ArrivalNotice, ReleaseGood, VasOrder, InventoryCheck)
   */
  async updateRefOrder(refOrder: ReferenceOrderType, entitySchema?: EntitySchema): Promise<any> {
    if (!entitySchema) {
      if (refOrder instanceof ArrivalNotice) {
        entitySchema = ArrivalNotice
      } else if (refOrder instanceof ReleaseGood) {
        entitySchema = ReleaseGood
      } else if (refOrder instanceof VasOrder) {
        entitySchema = VasOrder
      } else if (refOrder instanceof InventoryCheck) {
        entitySchema = InventoryCheck
      }
    }

    if (!refOrder.id) throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)
    if (!refOrder.updater?.id) refOrder = this.setStamp(refOrder)

    return await this.trxMgr.getRepository(entitySchema).save(refOrder)
  }

  /**
   * @summary Update order targets (OrderProduct, OrderInventory, OrderVas)
   * @description
   * Update order targets like (OrderProduct, OrderInventory, OrderVas)
   */
  async updateOrderTargets(orderTargets: OrderTargetTypes[], entitySchema?: EntitySchema): Promise<any> {
    if (!entitySchema) {
      if (orderTargets[0] instanceof OrderProduct) {
        entitySchema = OrderProduct
      } else if (orderTargets[0] instanceof OrderInventory) {
        entitySchema = OrderInventory
      } else if (orderTargets[0] instanceof OrderVas) {
        entitySchema = OrderVas
      }
    }

    if (orderTargets.some((orderTarget: any) => !orderTarget.id)) throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)
    orderTargets.forEach((orderTarget: OrderTargetTypes) => {
      if (!orderTarget.updater?.id) orderTarget = this.setStamp(orderTarget)
    })

    return await this.trxMgr.getRepository(entitySchema).save(orderTargets)
  }

  /**
   * @summary generate worksheet and worksheet details
   * @description It will generate worksheet and worksheet details in onetime
   * Step 1. Call createWorksheet to create worksheet
   *  The status of worksheet will be DEACTIVATED by default
   *  You can change it through passing additionalProps
   * Step 2. Update status of order targets
   *  Beacuse its status can be different based on type of worksheet
   * Step 3. Call createWorksheetDetails to create worksheet details
   * Step 4. Call updateRefOrder to change status of reference order
   */
  async generateWorksheet(
    worksheetType: string,
    refOrder: ReferenceOrderType,
    orderTargets: OrderTargetTypes[],
    refOrderStatus: string,
    orderTargetStatus: string,
    additionalProps: Partial<Worksheet> = {}
  ): Promise<Worksheet> {
    const worksheet: Worksheet = await this.createWorksheet(refOrder, worksheetType, additionalProps)

    orderTargets.forEach((orderTarget: OrderTargetTypes) => {
      orderTarget.status = orderTargetStatus
    })
    orderTargets = await this.updateOrderTargets(orderTargets)

    worksheet.worksheetDetails = await this.createWorksheetDetails(worksheet, worksheetType, orderTargets)

    refOrder.status = refOrderStatus
    await this.updateRefOrder(refOrder)

    return worksheet
  }

  /**
   * @summary Activate worksheet
   * @description It will activate passed worksheet
   * Every passed worksheet and worksheet details should have value on its id field
   * Because this function has logic to update worksheet and worksheet details
   * Step 1. Check whether every passed worksheet and worksheet details has id
   * Step 2. Change worksheet properly and update it
   * Step 3. Change worksheet details properly and update it
   */
  async activateWorksheet(
    worksheet: Worksheet,
    worksheetDetails: WorksheetDetail[],
    changedWorksheetDetails: Partial<WorksheetDetail>[]
  ): Promise<Worksheet> {
    if (!worksheet.id || worksheetDetails.some((wsd: WorksheetDetail) => !wsd.id)) {
      throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)
    }

    worksheet.status = WORKSHEET_STATUS.EXECUTING
    worksheet.startedAt = new Date()
    worksheet.updater = this.user
    worksheet = await this.trxMgr.getRepository(Worksheet).save(worksheet)

    worksheetDetails = this.renewWorksheetDetails(worksheetDetails, changedWorksheetDetails, 'name', {
      status: WORKSHEET_STATUS.EXECUTING,
      updater: this.user
    })
    worksheet.worksheetDetails = await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

    return worksheet
  }

  /**
   * @summary Complete worksheet
   * @description It will activate passed worksheet
   * Passed worksheet should have value on its id field
   * Because this function has logic to update worksheet
   * Step 1. Check whether passed worksheet has id
   * Step 2. Change worksheet properly and update it
   * Step 3. Renew worksheet with relations which is needed to complete worksheet
   * Step 4. Change order targets properly and update it based on type of worksheet
   * Step 5. If passed updatedRefOrderStatus has value it update reference order status
   */
  async completeWorksheet(worksheet: Worksheet, updatedRefOrderStatus?: string): Promise<Worksheet> {
    if (!worksheet.id) throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)

    worksheet.status = WORKSHEET_STATUS.DONE
    worksheet.endedAt = new Date()
    worksheet.updater = this.user
    worksheet = await this.trxMgr.getRepository(Worksheet).save(worksheet)

    const worksheetType: string = worksheet.type
    worksheet = await this.findWorksheet(worksheet, [
      'worksheetDetails',
      'worksheetDetails.targetProduct',
      'worksheetDetails.targetInventory',
      'worksheetDetails.targetVas'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails

    worksheetDetails.forEach((wsd: WorksheetDetail) => {
      wsd.status = WORKSHEET_STATUS.DONE
      wsd.updater = this.user
    })
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

    if (worksheetType === WORKSHEET_TYPE.UNLOADING) {
      const targetProducts: OrderProduct[] = worksheet.worksheetDetails.map((wsd: WorksheetDetail) => {
        let targetProduct: OrderProduct = wsd.targetProduct
        targetProduct.status = ORDER_PRODUCT_STATUS.TERMINATED
        targetProduct.updater = this.user
        return targetProduct
      })

      await this.updateOrderTargets(targetProducts)
    } else if (worksheetType === WORKSHEET_TYPE.VAS) {
      const targetVASs: OrderVas[] = worksheet.worksheetDetails.map((wsd: WorksheetDetail) => {
        let targetVAS: OrderVas = wsd.targetVas
        targetVAS.status = ORDER_VAS_STATUS.TERMINATED
        targetVAS.updater = this.user
        return targetVAS
      })

      await this.updateOrderTargets(targetVASs)
    } else if (
      worksheetType === WORKSHEET_TYPE.PUTAWAY ||
      worksheetType === WORKSHEET_TYPE.PICKING ||
      worksheetType === WORKSHEET_TYPE.LOADING ||
      worksheetType === WORKSHEET_TYPE.RETURN
    ) {
      const targetInventories: OrderInventory[] = worksheet.worksheetDetails.map((wsd: WorksheetDetail) => {
        let targetInventory: OrderInventory = wsd.targetInventory
        targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
        targetInventory.updater = this.user
        return targetInventory
      })

      await this.updateOrderTargets(targetInventories)
    }

    if (updatedRefOrderStatus) {
      const refOrder: ReferenceOrderType = await this.extractRefOrderFromWorksheet(worksheet)
      refOrder.status = updatedRefOrderStatus
      refOrder.updater = this.user
      await this.updateRefOrder(refOrder)
    }

    return worksheet
  }

  /**
   * @summary Renew worksheet details by changed worksheet details
   * @description When you want to merge changed worksheet detail list into original worksheet detail list
   * you can use this function
   * it will loop through whole passed original worksheet details and find out matched changed one by value of 'ID' or its 'name'
   * Because of this, every passed origin worksheet details and changed worksheet details should have one of those values
   */
  renewWorksheetDetails(
    originWSDs: WorksheetDetail[],
    changedWSDs: Partial<WorksheetDetail>[],
    identifier: string,
    additionalProps: Partial<WorksheetDetail> = {}
  ): WorksheetDetail[] {
    if (
      originWSDs.some((wsd: WorksheetDetail) => !wsd[identifier]) ||
      changedWSDs.some((wsd: Partial<WorksheetDetail>) => !wsd[identifier])
    ) {
      throw new Error(
        this.ERROR_MSG.VALIDITY.CANT_PROCEED_STEP_BY(
          'renew worksheet details',
          `some passed parameter doesn't have identifier (${identifier})`
        )
      )
    }

    return originWSDs.map((originWSD: WorksheetDetail) => {
      const changedWSD: Partial<WorksheetDetail> = this.findMatchedWSD(originWSD[identifier], changedWSDs)

      return {
        ...originWSD,
        ...changedWSD,
        ...additionalProps
      }
    })
  }

  /**
   * @summary Find out matched worksheet detail by identifier
   * @description Find out matched worksheet detail by identifier
   * identifier can be 'ID' or 'name' of worksheet detail
   */
  findMatchedWSD(identifier: string, candidates: any[]): any {
    return candidates.find(
      (candidate: Partial<WorksheetDetail>) => candidate.id === identifier || candidate.name === identifier
    )
  }

  /**
   * @summary Valitiy checker
   * @description It will try to check whether passed record has same properties with passed conditions
   * Basically it will check equality of value
   * If you want to check advanced validation you can pass function to customize the logic of validation
   * Passed function will be call with actual value of record as parameter
   */
  checkRecordValidity(record: Record<string, any>, conditions: Record<string, any>): void {
    for (let field in conditions) {
      let isValid: boolean = false
      if (typeof conditions[field] === 'function') {
        isValid = conditions[field](record[field])
      } else {
        isValid = conditions[field] === record[field]
      }

      if (!isValid)
        throw new Error(this.ERROR_MSG.VALIDITY.UNEXPECTED_FIELD_VALUE(field, conditions[field], record[field]))
    }
  }

  /**
   * @summary Notify to passed users
   * @description Passed notification message will be sent to passed users
   */
  notifyToUsers(users: User[], message: NotificationMsgInterface): void {
    users.forEach((user: User) => {
      sendNotification({
        receiver: user.id,
        message: JSON.stringify(message)
      })
    })
  }

  /**
   * @summary Notify to office admin
   * @description Passed notification message will be sent to office admin of current domain
   * default role name is defiend as ROLE_NAME.OFFICE_ADMIn by default
   * You can change role name by passing roleName as parameter
   */
  async notifyToOfficeAdmin(message: NotificationMsgInterface, roleName?: string): Promise<void> {
    const users: User[] = await this.trxMgr
      .getRepository('users_roles')
      .createQueryBuilder('ur')
      .select('ur.users_id', 'id')
      .where(qb => {
        const subQuery = qb
          .subQuery()
          .select('role.id')
          .from(Role, 'role')
          .where('role.name = :roleName', { roleName: roleName || this.ROLE_NAMES.OFFICE_ADMIN })
          .andWhere('role.domain_id = :domainId', { domainId: this.domain.id })
          .getQuery()
        return 'ur.roles_id IN ' + subQuery
      })
      .getRawMany()

    this.notifyToUsers(users, message)
  }

  /**
   * @summary Notify to customer of passed bizplace
   * @description Passed notification message will be sent to customer of passed bizplace
   */
  async notifyToCustomer(bizplace: Bizplace, message: NotificationMsgInterface): Promise<void> {
    const users: any[] = await this.trxMgr
      .getRepository('bizplaces_users')
      .createQueryBuilder('bu')
      .select('bu.user_id', 'id')
      .where(qb => {
        const subQuery = qb
          .subQuery()
          .select('bizplace.id')
          .from(Bizplace, 'bizplace')
          .where('bizplace.name = :bizplaceName', { bizplaceName: bizplace.name })
          .getQuery()
        return 'bu.bizplace_id IN ' + subQuery
      })
      .getRawMany()

    this.notifyToUsers(users, message)
  }

  /**
   * @summary extract out referenc order from given worksheet
   * @description If it doesn't have any reference order
   * find worksheet with every possible reference order once again
   * and extract out reference order from found worksheet
   */
  async extractRefOrderFromWorksheet(worksheet: Worksheet): Promise<ReferenceOrderType> {
    let refOrder: ReferenceOrderType =
      worksheet.arrivalNotice || worksheet.releaseGood || worksheet.vasOrder || worksheet.inventoryCheck || null
    if (!refOrder) {
      const wsWithRefOrd: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne(worksheet.id, {
        relations: ['arrivalNotice', 'releaseGood', 'vasOrder', 'inventoryCheck']
      })

      refOrder =
        wsWithRefOrd.arrivalNotice ||
        wsWithRefOrd.releaseGood ||
        wsWithRefOrd.vasOrder ||
        wsWithRefOrd.inventoryCheck ||
        null
      if (!refOrder) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(worksheet.id))
    }

    return refOrder
  }

  /**
   * @summary Check whether passed pallet is existing alreay
   * @description It will try to count inventories which has same domain and same pallet Id and not terminated one
   * If there's positive result it will throw an error cause pallet is duplicated
   */
  async checkPalletDuplication(palletId: string): Promise<void> {
    const duplicatedPalletCnt: number = await this.trxMgr.getRepository(Inventory).count({
      domain: this.domain,
      palletId,
      status: Not(Equal(INVENTORY_STATUS.TERMINATED))
    })

    if (duplicatedPalletCnt) throw new Error(this.ERROR_MSG.VALIDITY.DUPLICATED('Pallet ID', palletId))

    const duplicatedReusablePalletCnt: number = await this.trxMgr.getRepository(Pallet).count({
      where: {
        domain: this.domain,
        name: palletId
      }
    })

    if (duplicatedReusablePalletCnt) throw new Error(this.ERROR_MSG.VALIDITY.DUPLICATED('Pallet ID', palletId))
  }

  async createInventory(inventory: Partial<Inventory> | Partial<Inventory>[]): Promise<Inventory | Inventory[]> {
    inventory = this.setStamp(inventory)
    return await this.trxMgr.getRepository(Inventory).save(inventory)
  }

  /**
   * @summary Update inventory record
   * @description It will update inventory after set a stamp (domain, updater)
   * The special point of this function is that this changes won't generate inventory history
   * If you want to generate inventory history automatically you would better to use transactionInventory function
   */
  async updateInventory(inventory: Partial<Inventory> | Partial<Inventory>[]): Promise<Inventory | Inventory[]> {
    if (!inventory.id) throw new Error(this.ERROR_MSG.UPDATE.ID_NOT_EXISTS)
    inventory = this.setStamp(inventory)
    return await this.trxMgr.getRepository(Inventory).save(inventory)
  }

  /**
   * @summary Do transaction on inventory record
   * @description It will update inventory after set a temp (domain, updater)
   * and then generate inventory history based on current changes
   */
  async transactionInventory(
    inventory: Partial<Inventory>,
    referencOrder: ReferenceOrderType,
    changedQty: number,
    changedWeight: number,
    transactionType: string
  ): Promise<Inventory> {
    if (inventory.id) {
      inventory = await this.updateInventory(inventory)
    } else {
      inventory = await this.createInventory(inventory)
    }

    await generateInventoryHistory(
      inventory,
      referencOrder,
      transactionType,
      changedQty,
      changedWeight,
      this.user,
      this.trxMgr
    )

    return inventory
  }

  /**
   * @summary set common stamp like domain, creator, updater
   * @description Set common stamp to passed record
   * If it doesn't have id it will handle it as creating one
   * If it has id it will handle it as updating one
   */
  setStamp(record: Record<string, any>): Record<string, any> {
    if (!record.domain) record.domain = this.domain
    if (!record.id && !record.creator) record.creator = this.user
    if (!record.updater) record.updater = this.user

    return record
  }

  /**
   * @summary Extract bizplace from reference order
   * @description It will find reference order with bizplace and return only bizplace to extract it out
   */
  async extractBizplaceFromRefOrder(refOrder: ReferenceOrderType, entitySchema?: EntitySchema): Promise<Bizplace> {
    if (!entitySchema) {
      if (refOrder instanceof ArrivalNotice) {
        entitySchema = ArrivalNotice
      } else if (refOrder instanceof ReleaseGood) {
        entitySchema = ReleaseGood
      } else if (refOrder instanceof VasOrder) {
        entitySchema = VasOrder
      } else if (refOrder instanceof InventoryCheck) {
        entitySchema = InventoryCheck
      }
    }

    const { bizplace }: { bizplace: Bizplace } = await this.findRefOrder(entitySchema, refOrder, ['bizplace'])
    return bizplace
  }

  tidyConditions(record: Record<string, any>): Record<string, any> {
    Object.keys(record).forEach((key: string) => {
      if (record[key] === null || record[key] instanceof Date) delete record[key]
    })

    return record
  }
}
