import { Attachment, STORAGE } from '@things-factory/attachment-base'
import { Bizplace, Partner } from '@things-factory/biz-base'
import { config } from '@things-factory/env'
import { Product } from '@things-factory/product-base'
import { ArrivalNotice, JobSheet, OrderProduct, ORDER_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, InventoryHistory } from '@things-factory/warehouse-base'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { getRepository, IsNull, Not,  getManager, EntityManager } from 'typeorm'
import { TEMPLATE_TYPE, WORKSHEET_TYPE } from '../constants'
import { Worksheet } from '../entities'
import { DateTimeConverter } from '../utils/datetime-util'

const REPORT_API_URL = config.get('reportApiUrl', 'http://localhost:8888/rest/report/show_html')

export async function renderJobSheet({ domain: domainName, ganNo, timezoneOffSet }) {
  const domain: Domain = await getRepository(Domain).findOne({
    where: { subdomain: domainName }
  }) //.. find domain

  // find GAN
  const foundGAN: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
    where: { domain, name: ganNo },
    relations: ['bizplace', 'jobSheet']
  })

  // find job sheet
  const foundJS: JobSheet = foundGAN.jobSheet

  // customer bizplace
  const partnerBiz: Bizplace = foundGAN.bizplace

  // find domain bizplace name, address, brn
  const foundDomainBizId: Partner = await getRepository(Partner).findOne({
    where: { partnerBizplace: partnerBiz.id },
    relations: ['domainBizplace']
  })

  // owner domain bizplace
  const foundDomainBiz: Bizplace = await getRepository(Bizplace).findOne({
    where: { id: foundDomainBizId.domainBizplace.id }
  })

  const foundTemplate: Attachment = await getRepository(Attachment).findOne({
    where: { domain, category: TEMPLATE_TYPE.JOB_TEMPLATE }
  })

  const foundLogo: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
      category: TEMPLATE_TYPE.LOGO
    }
  })

  const template = await STORAGE.readFile(foundTemplate.path, 'utf-8')
  let logo = null
  if (foundLogo?.path) {
    logo = 'data:' + foundLogo.mimetype + ';base64,' + (await STORAGE.readFile(foundLogo.path, 'base64'))
  }

  // find unloading worksheet for getting unloading time
  const foundWS: Worksheet = await getRepository(Worksheet).findOne({
    where: { domain, arrivalNotice: foundGAN, type: WORKSHEET_TYPE.UNLOADING },
    relations: ['updater']
  })

  // find list of unloaded product
  const targetProducts: OrderProduct[] = await getRepository(OrderProduct).find({
    where: { domain, arrivalNotice: foundGAN, actualPalletQty: Not(IsNull()) },
    relations: ['product']
  })

  const products: Product[] = targetProducts.map((op: OrderProduct) => op.product)
  const prodType: any[] = products.map(prod => prod.type)

  return await getManager().transaction(async (trxMgr: EntityManager) => {
    await trxMgr.query(
      `
      create temp table temp_invHistory as (
        select i2.id as inventory_id, i2.pallet_id, i2.product_id, i2.packing_type, i2.batch_id,
        ih.id as inventory_history_id, ih.seq, ih.status, ih.transaction_type, ih.qty, ih.opening_qty, ih.weight, ih.opening_weight, ih.created_at
        from (
          select i2.* from inventories i2 
            inner join order_inventories oi on oi.inventory_id = i2.id
          where oi.arrival_notice_id = $1
        ) i2
        inner join reduced_inventory_histories ih on ih.pallet_id = i2.pallet_id and ih.domain_id = i2.domain_id 
      )
      `, [foundGAN.id]
    )

    const invItems: any[] = await trxMgr.query(
    ` 
      SELECT inv.id AS "inv_id", inv.pallet_id AS "palletId", inv.packing_type AS "packingType", inv.created_at AS "createdAt", product.name AS "productName", 
      (	
        select distinct on(pallet_id) COALESCE(qty, 0) AS unloadedQty from temp_invHistory invh 
        where invh.status = 'UNLOADED' and invh.inventory_id = inv.id
        order by pallet_id, seq asc
      ) AS "unloadedQty", 
      (
        select distinct on(pallet_id) COALESCE(created_at, null) AS outboundAt from temp_invHistory invh 
        where invh.status = 'TERMINATED' and invh.inventory_id = inv.id
        order by pallet_id, seq desc
      ) AS "outboundAt",
      STRING_AGG (case when do2.name is not null then (CONCAT(do2.name, ' (', orderInv.release_qty, ')')) else null end, ', ')  AS "doName",
      SUM(orderInv.release_qty) as "qty",
      do2.own_collection AS "ownTransport",
      STRING_AGG (vas.name, ', ') AS "vasName" 
      FROM inventories inv 
      LEFT JOIN order_inventories orderInv ON orderInv.inventory_id = inv.id AND orderInv.release_good_id is not null  
      LEFT JOIN order_vass orderVass ON orderVass.inventory_id = inv.id  
      LEFT JOIN vass vas ON vas.id = orderVass.vas_id  
      LEFT JOIN delivery_orders do2 ON do2.id = orderInv.delivery_order_id  
      LEFT JOIN products product ON product.id=inv.product_id 
      inner join order_inventories oi on oi.inventory_id = inv.id
      where oi.arrival_notice_id = $1
      AND inv.domain_id = $2
      GROUP BY inv.id, product.name, do2.own_collection 
      ORDER BY inv.pallet_id, product.name asc
    `, [foundGAN.id, domain.id ]
    )

    await trxMgr.query(
      `
        drop table temp_invHistory
      `
    )

    // const subQueryInvHis = await getRepository(InventoryHistory)
    //   .createQueryBuilder('invHis')
    //   .select('invHis.palletId')
    //   .addSelect('invHis.domain')
    //   .addSelect('invHis.status')
    //   .addSelect('MAX(invHis.seq)', 'seq')
    //   .where("invHis.transactionType IN ('UNLOADING','ADJUSTMENT','TERMINATED')")
    //   .andWhere('invHis.domain = :domainId', { domainId: domain.id })
    //   .groupBy('invHis.palletId')
    //   .addGroupBy('invHis.status')
    //   .addGroupBy('invHis.domain')

    // const query = await getRepository(Inventory)
    //   .createQueryBuilder('inv')
    //   .select('inv.id')
    //   .addSelect(subQuery => {
    //     return subQuery
    //       .select('COALESCE("invh".qty, 0)', 'unloadedQty')
    //       .from('inventory_histories', 'invh')
    //       .innerJoin(
    //         '(' + subQueryInvHis.getQuery() + ')',
    //         'invhsrc',
    //         '"invhsrc"."invHis_pallet_id" = "invh"."pallet_id" AND "invhsrc"."seq" = "invh"."seq" AND "invhsrc"."domain_id" = "invh"."domain_id"'
    //       )
    //       .where('"invhsrc"."invHis_status" = \'UNLOADED\'')
    //       .andWhere('"invh"."pallet_id" = "inv"."pallet_id"')
    //       .andWhere('"invh"."domain_id" = "inv"."domain_id"')
    //   }, 'unloadedQty')
    //   .addSelect(subQuery => {
    //     return subQuery
    //       .select('COALESCE("invh".created_at, null)', 'outboundAt')
    //       .from('inventory_histories', 'invh')
    //       .innerJoin(
    //         '(' + subQueryInvHis.getQuery() + ')',
    //         'invhsrc',
    //         '"invhsrc"."invHis_pallet_id" = "invh"."pallet_id" AND "invhsrc"."seq" = "invh"."seq" AND "invhsrc"."domain_id" = "invh"."domain_id"'
    //       )
    //       .where('"invhsrc"."invHis_status" = \'TERMINATED\'')
    //       .andWhere('"invh"."pallet_id" = "inv"."pallet_id"')
    //       .andWhere('"invh"."domain_id" = "inv"."domain_id"')
    //   }, 'outboundAt')
    //   .addSelect('inv.palletId', 'palletId')
    //   .addSelect('inv.packingType', 'packingType')
    //   .addSelect('inv.createdAt', 'createdAt')
    //   .addSelect('product.name', 'productName')
    //   .addSelect('STRING_AGG ("do2".name, \', \')', 'doName')
    //   .addSelect('do2.own_collection', 'ownTransport')
    //   .addSelect('STRING_AGG ("vas".name, \', \')', 'vasName')
    //   .leftJoin(
    //     'order_inventories',
    //     'orderInv',
    //     '"orderInv"."inventory_id" = "inv"."id" AND "orderInv"."release_good_id" is not null'
    //   )
    //   .leftJoin('order_vass', 'orderVass', '"orderVass"."inventory_id" = "inv"."id"')
    //   .leftJoin('vass', 'vas', '"vas"."id" = "orderVass"."vas_id"')
    //   .leftJoin('delivery_orders', 'do2', '"do2"."id" = "orderInv"."delivery_order_id"')
    //   .leftJoin('inv.product', 'product')
    //   .where(qb => {
    //     const subQuery = qb
    //       .subQuery()
    //       .select('oi.inventory_id')
    //       .from('order_inventories', 'oi')
    //       .where('oi.arrival_notice_id = :arrivalNoticeId', { arrivalNoticeId: foundGAN.id })
    //       .getQuery()
    //     return 'inv.id IN ' + subQuery
    //   })
    //   .andWhere('inv.domain_id = :domainId', { domainId: domain.id })
    //   .groupBy('inv.id')
    //   .addGroupBy('product.name')
    //   .addGroupBy('do2.own_collection')
    //   .addOrderBy('product.name')

    // const invItems: any[] = await query.getRawMany()

    const sumPackQty = targetProducts.map((op: OrderProduct) => op.actualPackQty).reduce((a, b) => a + b, 0)

    let sumPalletQty = 0
    if (foundJS?.sumPalletQty) {
      sumPalletQty = foundJS.sumPalletQty
    }

    const data = {
      logo_url: logo,
      customer_biz: partnerBiz.name,
      company_domain: foundDomainBiz.name,
      company_brn: foundDomainBiz.description,
      company_address: foundDomainBiz.address,
      container_no: foundGAN?.containerNo ? foundGAN.containerNo : foundGAN.deliveryOrderNo,
      container_size: foundJS ? foundJS.containerSize : null,
      eta: foundGAN?.ata ? DateTimeConverter.datetime(foundGAN.ata, timezoneOffSet) : null,
      ata: foundGAN?.ata ? DateTimeConverter.date(foundGAN.ata) : null,
      unloading_date: foundWS?.startedAt ? DateTimeConverter.date(foundWS.startedAt) : '',
      mt_date: foundJS?.containerMtDate ? DateTimeConverter.date(foundJS.containerMtDate) : '',
      advise_mt_date: foundJS.adviseMtDate ? DateTimeConverter.datetime(foundJS.adviseMtDate, timezoneOffSet) : '',
      loose_item: foundGAN.looseItem ? 'N' : 'Y',
      no_of_pallet:
        (sumPalletQty > 1 ? `${sumPalletQty} PALLETS` : `${sumPalletQty} PALLET`) +
        `, ` +
        (sumPackQty ? `${sumPackQty} CTN` : 0),
      commodity: prodType.filter((a, b) => prodType.indexOf(a) === b).join(', '),
      created_on: DateTimeConverter.date(foundJS.createdAt),
      job_no: foundJS ? foundJS.name : null,
      ref_no: foundGAN.name,
      product_list: invItems.map((item, idx) => {
        return {
          idx: idx + 1,
          pallet_id: item.palletId,
          product_name: item.productName,
          product_type: item.packingType,
          in_pallet: DateTimeConverter.date(item.createdAt),
          out_pallet: item?.outboundAt ? DateTimeConverter.date(item.outboundAt) : null,
          do_list: item.doName,
          transport: item?.doName ? (item.ownTransport ? 'N' : 'Y') : null,
          product_qty: item.unloadedQty,
          remark: foundGAN.looseItem ? 'STRETCH FILM' : null
        }
      })
    }
    const formData = new FormData()

    formData.append('template', template)
    formData.append('jsonString', JSON.stringify(data))

    const response = await fetch(REPORT_API_URL, {
      method: 'POST',
      body: formData
    })

    return await response.text()
  })
}
