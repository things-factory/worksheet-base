import { MigrationInterface, QueryRunner, getRepository } from 'typeorm'
import { Domain } from '@things-factory/shell'
import { WorksheetMovement } from '../entities'

const SEED = []

export class SeedWorksheetMovement1561448571277 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    const repository = getRepository(WorksheetMovement)
    const domainRepository = getRepository(Domain)
    const domain = await domainRepository.findOne({
      name: 'SYSTEM'
    })

    try {
      SEED.forEach(async worksheetMovement => {
        await repository.save({
          ...worksheetMovement,
          domain
        })
      })
    } catch (e) {
      console.error(e)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    // const repository = getRepository(WorksheetMovement)
    // SEED.reverse().forEach(async worksheetMovement => {
    //   let record = await repository.findOne({ name: worksheetMovement.name })
    //   await repository.remove(record)
    // })
  }
}
