import { Attachment } from '@things-factory/attachment-base'
import { Bizplace, ContactPoint, Partner } from '@things-factory/biz-base'
import { ORDER_STATUS, DeliveryOrder, OrderInventory, ReleaseGood } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { Equal, getRepository, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE, TEMPLATE_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const deliveryOrderByWorksheetResolver = {
  async deliveryOrderByWorksheet(_: any, { name }, context: any) {
    const foundDO: DeliveryOrder = await getRepository(DeliveryOrder).findOne({
      where: {
        domain: context.state.domain,
        name
      },
      relations: ['domain', 'bizplace', 'transportDriver', 'transportVehicle', 'releaseGood', 'creator', 'updater']
    })

    const foundRO: ReleaseGood = foundDO.releaseGood

    const partnerBiz: Bizplace = await getRepository(Bizplace).findOne({
      where: { id: foundDO.bizplace.id }
    })

    const partnerContactPoint: ContactPoint[] = await getRepository(ContactPoint).find({
      where: { domain: context.state.domain, bizplace: partnerBiz }
    })

    const foundDomainBizId: Partner = await getRepository(Partner).findOne({
      where: { partnerBizplace: partnerBiz.id },
      relations: ['domainBizplace']
    })

    const foundDomainBiz: Bizplace = await getRepository(Bizplace).findOne({
      where: { id: foundDomainBizId.domainBizplace.id }
    })

    const foundTemplate: Attachment = await getRepository(Attachment).findOne({
      where: {
        domain: context.state.domain,
        category: TEMPLATE_TYPE.DO_TEMPLATE
      }
    })

    const foundLogo: Attachment = await getRepository(Attachment).findOne({
      where: {
        domain: context.state.domain,
        category: TEMPLATE_TYPE.LOGO
      }
    })

    const foundWS: Worksheet = await getRepository(Worksheet).findOne({
      where: { domain: context.state.domain, releaseGood: foundRO },
      relations: ['updater']
    })

    const targetInventories: OrderInventory[] = await getRepository(OrderInventory).find({
      where: { domain: context.state.domain, deliveryOrder: foundDO },
      relations: ['inventory']
    })
    const orderInvIds: string[] = targetInventories.map((oi: any) => oi.id)

    const foundWSD: WorksheetDetail[] = await getRepository(WorksheetDetail).find({
      where: {
        domain: context.state.domain,
        targetInventory: In(orderInvIds),
        type: WORKSHEET_TYPE.LOADING,
        status: Equal(WORKSHEET_STATUS.DONE)
      },
      relations: [
        'targetInventory',
        'targetInventory.inventory',
        'targetInventory.inventory.location',
        'targetInventory.inventory.product',
        'updater'
      ]
    })

    let foundDriver: any = null
    if (foundDO.status !== ORDER_STATUS.READY_TO_DISPATCH) {
      if (foundDO?.ownCollection && foundDO?.otherDriver) {
        foundDriver = foundDO.otherDriver
      } else {
        foundDriver = foundDO.transportDriver.name
      }

      if (!foundDriver) throw new Error('Driver is not found')
    }

    return {
      deliveryOrderInfo: {
        partnerBizplace: partnerBiz.name,
        domainBizplace: foundDomainBiz.name,
        domainBrn: foundDomainBiz.description,
        domainAddress: foundDomainBiz.address,
        reportURL: foundTemplate.fullpath,
        logoURL: foundLogo.fullpath,
        ownCollection: foundDO.ownCollection,
        to: foundDO.to || '',
        palletQty: foundDO.palletQty,
        driverName: foundDriver,
        updaterName: foundWS.updater.name,
        deliveryDate: foundDO.deliveryDate || '',
        releaseGoodNo: foundDO.releaseGood.name,
        truckNo: foundDO.truckNo || '',
        doStatus: foundDO.status
      },
      loadedInventoryInfo: foundWSD.map(async (wsd: WorksheetDetail) => {
        const targetInventory: OrderInventory = wsd.targetInventory
        const inventory: Inventory = targetInventory.inventory
        return {
          palletId: inventory.palletId,
          batchId: inventory.batchId,
          product: inventory.product,
          packingType: inventory.packingType,
          releaseQty: targetInventory.releaseQty,
          releaseWeight: targetInventory.releaseWeight,
          status: wsd.status,
          productDescription: inventory.product.description,
          inventory: targetInventory.inventory,
          remark: targetInventory.remark
        }
      }),
      contactPointInfo: partnerContactPoint.map(async (cp: ContactPoint) => {
        return {
          address: cp.address || '',
          email: cp.email || '',
          fax: cp.fax || '',
          phone: cp.phone || '',
          contactName: cp.name || ''
        }
      })
    }
  }
}
