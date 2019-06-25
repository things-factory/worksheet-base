import { MigrationInterface, QueryRunner, getRepository } from 'typeorm'
import { Domain } from '@things-factory/shell'
import { WorksheetDetail } from '../entities'

const SEED = []

export class SeedWorksheetDetail1561448464085 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    const repository = getRepository(WorksheetDetail)
    const domainRepository = getRepository(Domain)
    const domain = await domainRepository.findOne({
      name: 'SYSTEM'
    })

    try {
      SEED.forEach(async worksheetDetail => {
        await repository.save({
          ...worksheetDetail,
          domain
        })
      })
    } catch (e) {
      console.error(e)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    // const repository = getRepository(WorksheetDetail)
    // SEED.reverse().forEach(async worksheetDetail => {
    //   let record = await repository.findOne({ name: worksheetDetail.name })
    //   await repository.remove(record)
    // })
  }
}
