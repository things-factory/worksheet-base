import { Domain } from '@things-factory/shell'
import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { Worksheet } from './worksheet'

@Entity()
@Index('ix_worksheet-movement_0', (worksheetMovement: WorksheetMovement) => [worksheetMovement.domain], {
  unique: true
})
export class WorksheetMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(type => Domain)
  domain: Domain

  @Column({
    nullable: true
  })
  date: Date

  @ManyToOne(type => Worksheet)
  worksheet: Worksheet

  @Column()
  startTime: Date

  @Column()
  endTime: Date

  @Column('text', {
    nullable: true
  })
  description: string
}
