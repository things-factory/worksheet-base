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
      create temp table temp_inventories as(
        WITH RECURSIVE cteinventories AS (
          select i1.id, i1."name", i1.pallet_id, i1.batch_id, i1.ref_order_id, i1."zone", i1.packing_type, i1.weight, i1.locked_weight, 
            i1.qty, i1.locked_qty, i1.last_seq, i1.description, i1.status, i1.other_ref, i1.created_at, i1.updated_at, i1.domain_id, i1.bizplace_id, 
            i1.ref_inventory_id, i1.product_id, i1.warehouse_id, i1.location_id, i1.creator_id, i1.updater_id, i1.order_product_id, 
            i1.reusable_pallet_id, i1.uom, i1.uom_value, i1.locked_uom_value, i1.remark, i1.pallet_id as origin_pallet_id,
            1 as "rank", 
            '1'::varchar as orderSeq, 
            ''::varchar as parent_pallet_id
            from inventories i1
            inner join order_inventories oi on oi.inventory_id = i1.id
            where oi.arrival_notice_id = $1
          UNION
            SELECT i2.id, i2."name", i2.pallet_id, i2.batch_id, i2.ref_order_id, i2."zone", i2.packing_type, i2.weight, i2.locked_weight, 
            i2.qty, i2.locked_qty, i2.last_seq, i2.description, i2.status, i2.other_ref, i2.created_at, i2.updated_at, i2.domain_id, i2.bizplace_id, 
            i2.ref_inventory_id, i2.product_id, i2.warehouse_id, i2.location_id, i2.creator_id, i2.updater_id, i2.order_product_id, 
            i2.reusable_pallet_id, i2.uom, i2.uom_value, i2.locked_uom_value, i2.remark, s.origin_pallet_id as origin_pallet_id,
            s."rank" + 1 as "rank",
            concat(s.orderSeq, '-', row_number() over (partition by s.pallet_id order by i2.pallet_id)::varchar) as orderSeq ,
            s.pallet_id as parent_pallet_id
            from inventories i2
            INNER JOIN cteinventories s ON s.id = i2.ref_inventory_id
        )
        select * from cteInventories order by orderSeq
      );
      `, [foundGAN.id]
    )

    await trxMgr.query(
      `      
      create temp table temp_invHistory as (	
        select i2.id as inventory_id, i2.pallet_id, i2.product_id, i2.packing_type, i2.batch_id,
        ih.id as inventory_history_id, ih.seq, ih.status, ih.transaction_type, ih.qty, ih.opening_qty, ih.uom_value, ih.opening_uom_value, 
        ih.created_at, i2.domain_id, ih.order_no
        from temp_inventories i2
        inner join reduced_inventory_histories ih on ih.pallet_id = i2.pallet_id and ih.domain_id = i2.domain_id
      );
      `
    )

    const invItems: any[] = await trxMgr.query(
    ` 
      select row_number() over(partition by foo.rn ORDER BY foo."productName", foo."originPalletId", foo.orderSeq) as "runningNo", 
      "palletId", "invId", "packingType", "productName", "unloadedQty", "createdAt", "outboundAt", "doName", "palletId", 
      "vasName", "remark"
      from (
        select 
        row_number() over(partition by inv.id, inv.pallet_id, inv.origin_pallet_id, product.name, plt.name, inv.packing_type, inv.orderSeq 
        ORDER BY product.name, inv.origin_pallet_id, inv.orderSeq) as rn, 
        inv.origin_pallet_id as "originPalletId", inv.id AS "invId", inv.packing_type AS "packingType", 
        product.name AS "productName", inv.orderSeq,
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
        min(inv.created_at) as "createdAt"
        STRING_AGG (case when do2.name is not null then (CONCAT(do2.delivery_date, ' (', orderInv.release_qty, ') ', do2.name, ', ', case when do2.own_collection = true then 'TPT N' else 'TPT Y' end )) else null end, ', ')  AS "doName",
        case when plt.name is not null then (CONCAT(inv.pallet_id, ' (', plt.name, ')')) else inv.pallet_id end AS "palletId",
        STRING_AGG (vas.name, ', ') AS "vasName",
        case when inv.orderSeq <> '1' then 'R' else '' end as remark
        from temp_inventories inv
        LEFT JOIN order_inventories orderInv ON orderInv.inventory_id = inv.id AND orderInv.release_good_id is not null and orderInv.status <> 'CANCELLED'
        LEFT JOIN order_vass orderVass ON orderVass.inventory_id = inv.id  
        LEFT JOIN vass vas ON vas.id = orderVass.vas_id  
        LEFT JOIN pallets plt on plt.id = inv.reusable_pallet_id
        LEFT JOIN delivery_orders do2 ON do2.id = orderInv.delivery_order_id  
        LEFT JOIN products product ON product.id=inv.product_id 
        LEFT JOIN order_inventories oi on oi.inventory_id = inv.id
        GROUP BY inv.id, inv.pallet_id, inv.origin_pallet_id, product.name, plt.name, inv.packing_type, inv.orderSeq
      ) foo
      ORDER BY foo."productName", foo."originPalletId", foo.orderSeq
    `
    )

    await trxMgr.query(
      `
      drop table temp_invHistory, temp_inventories;
      `
    )

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
