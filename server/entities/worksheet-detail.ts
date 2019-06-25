import { Entity, Index, Column, OneToMany, ManyToOne, PrimaryGeneratedColumn, OneToOne } from 'typeorm'
import { Domain, DomainBaseEntity } from '@things-factory/shell'
import { Worksheet } from './worksheet'
import { Worker } from '@things-factory/biz-base'

@Entity('worksheet-details')
@Index('ix_worksheet-detail_0', (worksheetDetail: WorksheetDetail) => [worksheetDetail.domain, worksheetDetail.name], {
  unique: true
})
export class WorksheetDetail extends DomainBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(type => Domain)
  domain: Domain

  @Column('text')
  name: string

  @ManyToOne(type => Worker)
  worker: Worker

  @ManyToOne(type => Worksheet)
  worksheet: Worksheet

  @Column('text', {
    nullable: true
  })
  description: string
}
