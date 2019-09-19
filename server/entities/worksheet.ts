import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, ShippingOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Warehouse } from '@things-factory/warehouse-base'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import { WorksheetDetail } from './worksheet-detail'

@Entity()
@Index('ix_worksheet_0', (worksheet: Worksheet) => [worksheet.domain, worksheet.bizplace, worksheet.name], {
  unique: true
})
export class Worksheet {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(type => Domain, {
    nullable: false
  })
  domain: Domain

  @ManyToOne(type => Bizplace, {
    nullable: false
  })
  bizplace: Bizplace

  @ManyToOne(type => ArrivalNotice)
  arrivalNotice: ArrivalNotice

  @ManyToOne(type => ShippingOrder)
  shippingOrder: ShippingOrder

  @ManyToOne(type => Warehouse)
  warehouse: Warehouse

  @Column()
  name: string

  @Column({
    nullable: true
  })
  description: string

  @Column()
  type: string

  @OneToMany(type => WorksheetDetail, worksheetDetail => worksheetDetail.worksheet)
  worksheetDetails: WorksheetDetail[]

  @Column()
  status: string

  @Column('datetime', {
    nullable: true
  })
  startedAt: Date

  @Column('datetime', {
    nullable: true
  })
  endedAt: Date

  @ManyToOne(type => User, {
    nullable: true
  })
  creator: User

  @ManyToOne(type => User, {
    nullable: true
  })
  updater: User

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
