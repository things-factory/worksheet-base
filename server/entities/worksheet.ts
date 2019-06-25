import { Entity, Index, Column, OneToMany, OneToOne, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm'
import { Domain, DomainBaseEntity } from '@things-factory/shell'
import { WorksheetDetail } from './worksheet-detail'

@Entity('worksheets')
@Index('ix_worksheet_0', (worksheet: Worksheet) => [worksheet.domain, worksheet.name], { unique: true })
export class Worksheet extends DomainBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(type => Domain)
  domain: Domain

  @Column('text')
  name: string

  @OneToMany(type => WorksheetDetail, worksheetDetail => worksheetDetail.worksheet)
  details: WorksheetDetail[]

  @Column('text', {
    nullable: true
  })
  description: string
}
