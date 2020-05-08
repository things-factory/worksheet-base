import { OrderVas } from '@things-factory/sales-base'
import { EntityManager } from 'typeorm'

export async function relabel(trxMgr: EntityManager, orderVas: OrderVas, context: any): Promise<void> {
  console.log(orderVas)
}
