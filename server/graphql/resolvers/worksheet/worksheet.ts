import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { OrderInventory, OrderProduct, OrderVas, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { getRepository, In, Not, Equal } from 'typeorm'
import { Worksheet } from '../../../entities'

interface WorksheetInterface extends Worksheet {
  orderProducts: OrderProduct[]
  orderInventories: OrderInventory[]
  orderVass: OrderVas[]
}

export const worksheetResolver = {
  async worksheet(_: any, { name }, context: any) {
    const worksheet: WorksheetInterface = (await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
        name
      },
      relations: [
        'domain',
        'bizplace',
        'bufferLocation',
        'bufferLocation.warehouse',
        'arrivalNotice',
        'arrivalNotice.releaseGood',
        'releaseGood',
        'releaseGood.arrivalNotice',
        'returnOrder',
        'inventoryCheck',
        'vasOrder',
        'worksheetDetails',
        'worksheetDetails.toLocation',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas',
        'worksheetDetails.targetVas.inventory',
        'worksheetDetails.targetVas.inventory.location',
        'worksheetDetails.targetVas.targetProduct',
        'worksheetDetails.targetInventory',
        'worksheetDetails.targetInventory.product',
        'worksheetDetails.targetInventory.inventory',
        'worksheetDetails.targetInventory.inventory.product',
        'worksheetDetails.targetInventory.inventory.warehouse',
        'worksheetDetails.targetInventory.inventory.location',
        'worksheetDetails.targetInventory.inspectedLocation',
        'creator',
        'updater'
      ]
    })) as WorksheetInterface

    if (worksheet?.arrivalNotice?.id) {
      worksheet.orderProducts = await getRepository(OrderProduct).find({
        where: {
          domain: context.state.domain,
          bizplace: worksheet.bizplace,
          arrivalNotice: worksheet.arrivalNotice
        }
      })

      worksheet.orderVass = await getRepository(OrderVas).find({
        where: {
          domain: context.state.domain,
          bizplace: worksheet.bizplace,
          arrivalNotice: worksheet.arrivalNotice
        },
        relations: ['targetProduct']
      })
    }

    if (worksheet?.releaseGood?.id) {
      worksheet.orderInventories = await getRepository(OrderInventory).find({
        where: {
          domain: context.state.domain,
          bizplace: worksheet.bizplace,
          releaseGood: worksheet.releaseGood,
          status: Not(Equal(ORDER_INVENTORY_STATUS.CANCELLED))
        },
        relations: ['product', 'inventory', 'inventory.location']
      })

      worksheet.orderVass = await getRepository(OrderVas).find({
        where: {
          domain: context.state.domain,
          bizplace: worksheet.bizplace,
          releaseGood: worksheet.releaseGood
        },
        relations: ['targetProduct']
      })
    }

    if (worksheet?.returnOrder?.id) {
      worksheet.orderInventories = await getRepository(OrderInventory).find({
        where: {
          domain: context.state.domain,
          bizplace: worksheet.bizplace,
          returnOrder: worksheet.returnOrder,
          status: Not(Equal(ORDER_INVENTORY_STATUS.CANCELLED))
        },
        relations: ['product', 'inventory', 'inventory.location']
      })

      worksheet.orderVass = await getRepository(OrderVas).find({
        where: {
          domain: context.state.domain,
          bizplace: worksheet.bizplace,
          returnOrder: worksheet.returnOrder
        },
        relations: ['targetProduct']
      })
    }

    if (worksheet?.inventoryCheck?.id) {
      worksheet.orderInventories = await getRepository(OrderInventory).find({
        where: {
          domain: context.state.domain,
          bizplace: worksheet.bizplace,
          inventoryCheck: worksheet.inventoryCheck
        },
        relations: ['product', 'inventory', 'inventory.location']
      })
    }

    if (worksheet?.vasOrder?.id) {
      worksheet.orderVass = await getRepository(OrderVas).find({
        where: {
          domain: context.state.domain,
          bizplace: worksheet.bizplace,
          vasOrder: worksheet.vasOrder
        },
        relations: ['targetProduct']
      })
    }

    return worksheet
  }
}
