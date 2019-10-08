import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, ReleaseGood, ShippingOrder, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Location } from '@things-factory/warehouse-base'
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

  @ManyToOne(type => ReleaseGood)
  releaseGood: ReleaseGood

  @ManyToOne(type => VasOrder)
  vasOrder: VasOrder

  @ManyToOne(type => ShippingOrder)
  shippingOrder: ShippingOrder

  @ManyToOne(type => Location)
  bufferLocation: Location

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

  @Column({
    nullable: true
  })
  startedAt: Date

  @Column({
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
