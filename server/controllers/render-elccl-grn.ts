import { Attachment, STORAGE } from '@things-factory/attachment-base'
import { Bizplace, ContactPoint, Partner } from '@things-factory/biz-base'
import { config } from '@things-factory/env'
import { ArrivalNotice, GoodsReceivalNote, ORDER_PRODUCT_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { LOCATION_TYPE } from '@things-factory/warehouse-base'
import { Domain } from '@things-factory/shell'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { EntityManager, getManager, getRepository } from 'typeorm'
import { TEMPLATE_TYPE, TRANSACTION_TYPE } from '../constants'
import { Worksheet } from '../entities'
import { DateTimeConverter } from '../utils/datetime-util'

const REPORT_API_URL = config.get('reportApiUrl', 'http://localhost:8888/rest/report/show_html')

export async function renderElcclGRN({ domain: domainName, grnNo }) {
  // 1. find domain
  const domain: Domain = await getRepository(Domain).findOne({
    where: { subdomain: domainName }
  })

  // 2. find grn
  const foundGRN: GoodsReceivalNote = await getRepository(GoodsReceivalNote).findOne({
    where: { domain, name: grnNo },
    relations: ['domain', 'bizplace', 'arrivalNotice']
  })

  // 3. find GAN
  const foundGAN: ArrivalNotice = foundGRN.arrivalNotice
  const ownRefNo = foundGAN.refNo

  // 4. find customer bizplace
  const partnerBiz: Bizplace = foundGRN.bizplace

  // 5. find domain bizplace id
  const foundDomainBizId: Partner = await getRepository(Partner).findOne({
    where: { partnerBizplace: partnerBiz.id },
    relations: ['domainBizplace']
  })

  // 6. found domain bizplace object
  const foundDomainBiz: Bizplace = await getRepository(Bizplace).findOne({
    where: { id: foundDomainBizId.domainBizplace.id }
  })

  // 7. find domain contact point
  const foundCP: ContactPoint = await getRepository(ContactPoint).findOne({
    where: { domain, bizplace: foundDomainBiz }
  })

  // 8. find unloading worksheet
  const foundWS: Worksheet = await getRepository(Worksheet).findOne({
    where: { domain, arrivalNotice: foundGAN, type: ORDER_PRODUCT_STATUS.UNLOADING, status: ORDER_STATUS.DONE },
    relations: ['worksheetDetails']
  })

  // const targetProducts: OrderProduct[] = await getRepository(OrderProduct).find({
  //   where: { domain, arrivalNotice: foundGAN, actualPalletQty: Not(IsNull()), actualPackQty: Not(IsNull()) },
  //   relations: ['product']
  // })

  // 9. find grn template based on category
  const foundTemplate: Attachment = await getRepository(Attachment).findOne({
    where: { domain, category: TEMPLATE_TYPE.GRN_TEMPLATE }
  })

  // 10. find grn logo
  const foundLogo: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
      category: TEMPLATE_TYPE.LOGO
    }
  })

  // 11. find signature
  const foundSignature: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
      category: TEMPLATE_TYPE.SIGNATURE
    }
  })

  const foundCop: Attachment = await getRepository(Attachment).findOne({
    where: {
      domain,
      category: TEMPLATE_TYPE.COP
    }
  })

  const template = await STORAGE.readFile(foundTemplate.path, 'utf-8')

  let logo = null
  if (foundLogo?.path) {
    logo = 'data:' + foundLogo.mimetype + ';base64,' + (await STORAGE.readFile(foundLogo.path, 'base64'))
  }

  let signature = null
  if (foundSignature?.path) {
    signature = 'data:' + foundSignature.mimetype + ';base64,' + (await STORAGE.readFile(foundSignature.path, 'base64'))
  }

  let cop = null
  if (foundCop?.path) {
    cop = 'data:' + foundSignature.mimetype + ';base64,' + (await STORAGE.readFile(foundCop.path, 'base64'))
  }

  let invItems: any

  await getManager().transaction(async (trxMgr: EntityManager) => {
    await trxMgr.query(
      `
      create temp table tmp as(
        select invh.*, invh2.ref_order_id as release_order_id, invh2.qty as release_qty, invh.qty as inbound_qty, 
        invh.qty + invh2.qty as remaining_qty, invh2.uom_value as release_uom_value, invh.uom_value as inbound_uom_value, 
        invh.uom_value + invh2.uom_value as remaining_uom_value
        from reduced_inventory_histories invh 
        left join reduced_inventory_histories invh2 on 
          invh2.domain_id = invh.domain_id and 
          invh2.pallet_id = invh.pallet_id and 
          invh2.seq = invh.seq + 1 and 
          invh2.transaction_type='PICKING'
        where invh.ref_order_id is not null and invh.ref_order_id::uuid = $1 and invh.transaction_type = $2
      )
    `,
      [foundGAN.id, TRANSACTION_TYPE.UNLOADING]
    )

    await trxMgr.query(
      `
      create temp table tmp2 as(
        select id,seq,ref_order_id,order_no,"name",pallet_id,batch_id,product_id,warehouse_id,location_id,"zone",order_ref_no,packing_type,uom as unit,qty,
        opening_qty,uom_value,opening_weight,description,status,transaction_type,created_at,updated_at,domain_id,bizplace_id,creator_id,updater_id,
        reusable_pallet_id,release_order_id,release_qty,inbound_qty,remaining_qty, inbound_qty as loose_amt, release_uom_value, inbound_uom_value,remaining_uom_value, 
        inbound_uom_value as loose_wgt, null as cross_dock, inventory_id
        from tmp where release_qty > 0 or release_qty is null
        union all 
        select id,seq,ref_order_id,order_no,"name",pallet_id,batch_id,product_id,warehouse_id,location_id,"zone",order_ref_no,packing_type,uom as unit,qty,
        opening_qty,uom_value,opening_weight,description,status,transaction_type,created_at,updated_at,domain_id,bizplace_id,creator_id,updater_id,
        reusable_pallet_id,release_order_id,release_qty,inbound_qty,remaining_qty, remaining_qty as loose_amt, release_uom_value, inbound_uom_value,remaining_uom_value, 
        remaining_uom_value as loose_wgt, null as cross_dock, inventory_id
        from tmp where release_qty < 0 and remaining_qty > 0
        union all 
        select id,seq,ref_order_id,order_no,"name",pallet_id,batch_id,product_id,warehouse_id,location_id,"zone",order_ref_no,packing_type,uom as unit,qty,
        opening_qty,uom_value,opening_weight,description,status,transaction_type,created_at,updated_at,domain_id,bizplace_id,creator_id,updater_id,
        reusable_pallet_id,release_order_id,release_qty,inbound_qty,remaining_qty, -release_qty as loose_amt, release_uom_value,inbound_uom_value,remaining_uom_value, 
        -release_uom_value as loose_wgt, '[C/D]' as cross_dock, inventory_id
        from tmp where release_qty < 0
      )
    `
    )

    await trxMgr.query(
      `
      create temp table tmp3 as (
        select main.*, concat(p2.name, ' (', p2.description, ')') as product_name, plt.name as pallet_name,
        case when main.reusable_pallet_id notnull then concat(main.qty, ' ', main.packing_type, '(S) ', plt.name) else concat(main.pallet, ' PALLET(S)')
        end as remarks,
        row_number() over (
          partition by p2.name, main.packing_type
          order by p2.name, reusable_pallet_id desc, cross_dock desc
        ) as sort
        from (
          select product_id, reusable_pallet_id, packing_type, cross_dock, sum(qty) as ori_qty, sum(loose_amt) as qty, sum(coalesce(release_qty, 0)) as release_qty, 
          sum(loose_wgt) as uom_value, count(distinct pallet_id) as pallet
          from tmp2 
          group by cross_dock, reusable_pallet_id, product_id, packing_type
        ) as main
        inner join products p2 on p2.id::varchar = main.product_id
        left join pallets plt on plt.id = main.reusable_pallet_id
        order by product_name, sort, remarks
      )
    `
    )

    invItems = await trxMgr.query(
    `
      select product_name, qty, uom_value, concat(remarks, ' ', cross_dock) as remarks, 0 as rank from (
        select product_name, sum(qty) as qty, sum(uom_value) as uom_value, string_agg(remarks,' ' order by product_name, sort, remarks) as remarks, cross_dock
        from tmp3 group by product_name, cross_dock
      ) as foo
      union 
      select vas.name as product_name, qty, 0 as uom_value, remark as remarks, 1 as rank 
      from order_vass ov 
      inner join vass vas on vas.id = ov.vas_id 
      where arrival_notice_id = $1 and vas.type = 'MATERIALS'
      order by rank, product_name, remarks
    `, [foundGAN.id]
    )

    await trxMgr.query(`
      drop table tmp, tmp2, tmp3
    `)
  })

  const data = {
    logo_url: logo,
    sign_url: signature,
    cop_url: cop,
    customer_biz: partnerBiz.name,
    customer_address: partnerBiz.address,
    company_domain: foundDomainBiz.name,
    company_phone: foundCP.phone,
    company_email: foundCP.email,
    company_brn: foundDomainBiz.description,
    company_address: foundDomainBiz.address,
    order_no: foundGRN.name,
    unload_date: DateTimeConverter.date(foundWS.endedAt),
    ref_no: ownRefNo ? `${foundGAN.name} / ${foundGAN.refNo}` : `${foundGAN.name}`,
    received_date: DateTimeConverter.date(foundWS.endedAt),
    truck_no: foundGAN.truckNo || '',
    container_no: foundGAN?.containerNo ? foundGAN.containerNo : foundGAN.deliveryOrderNo,
    product_list: invItems.map((item, idx) => {
      return {
        list_no: idx + 1,
        product_name: item.product_name,
        product_type: item.packing_type,
        product_batch: item.batch_id,
        product_qty: item.qty,
        product_uom_value: item.uom_value,
        pallet_qty: item.pallet_count,
        remark: item.remarks
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
}
