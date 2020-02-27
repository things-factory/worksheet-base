import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { OrderInventory, OrderProduct, OrderVas } from '@things-factory/sales-base'
import { getRepository, In } from 'typeorm'
import { Worksheet } from '../../../entities'

interface IWorksheet extends Worksheet {
  orderProducts: OrderProduct[]
  orderInventories: OrderInventory[]
  orderVass: OrderVas[]
}

export const worksheetResolver = {
  async worksheet(_: any, { name }, context: any) {
    const worksheet: IWorksheet = (await getRepository(Worksheet).findOne({
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
        'releaseGood',
        'vasOrder',
        'worksheetDetails',
        'worksheetDetails.toLocation',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas',
        'worksheetDetails.targetVas.inventory',
        'worksheetDetails.targetVas.inventory.location',
        'worksheetDetails.targetInventory',
        'worksheetDetails.targetInventory.inventory',
        'worksheetDetails.targetInventory.inventory.product',
        'worksheetDetails.targetInventory.inventory.warehouse',
        'worksheetDetails.targetInventory.inventory.location',
        'creator',
        'updater'
      ]
    })) as IWorksheet

    if (worksheet?.arrivalNotice?.id) {
      worksheet.orderProducts = await getRepository(OrderProduct).find({
        where: {
          domain: context.state.domain,
          bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
          arrivalNotice: worksheet.arrivalNotice
        }
      })

      worksheet.orderVass = await getRepository(OrderVas).find({
        where: {
          domain: context.state.domain,
          bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
          arrivalNotice: worksheet.arrivalNotice
        }
      })
    }

    if (worksheet?.releaseGood?.id) {
      worksheet.orderInventories = await getRepository(OrderInventory).find({
        where: {
          domain: context.state.domain,
          bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
          releaseOrder: worksheet.releaseGood
        }
      })

      worksheet.orderVass = await getRepository(OrderVas).find({
        where: {
          domain: context.state.domain,
          bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
          arrivalNotice: worksheet.releaseGood
        }
      })
    }

    if (worksheet?.vasOrder?.id) {
      worksheet.orderVass = await getRepository(OrderVas).find({
        where: {
          domain: context.state.domain,
          bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
          arrivalNotice: worksheet.vasOrder
        }
      })
    }

    return worksheet
  }
}
