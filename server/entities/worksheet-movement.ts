import { Entity, Index, Column, OneToMany, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { Domain, DomainBaseEntity } from '@things-factory/shell'
import { Worksheet } from './worksheet'

@Entity('worksheet-movements')
@Index('ix_worksheet-movement_0', (worksheetMovement: WorksheetMovement) => [worksheetMovement.domain], {
  unique: true
})
export class WorksheetMovement extends DomainBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(type => Domain)
  domain: Domain

  @Column('date')
  date: Date

  @ManyToOne(type => Worksheet)
  worksheet: Worksheet

  @Column('datetime')
  startTime: Date

  @Column('datetime')
  endTime: Date

  @Column('text', {
    nullable: true
  })
  description: string
}
