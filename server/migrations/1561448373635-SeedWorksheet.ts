import { MigrationInterface, QueryRunner, getRepository } from 'typeorm'
import { Domain } from '@things-factory/shell'
import { Worksheet } from '../entities'

const SEED = []

export class SeedWorksheet1561448373635 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    const repository = getRepository(Worksheet)
    const domainRepository = getRepository(Domain)
    const domain = await domainRepository.findOne({
      name: 'SYSTEM'
    })

    try {
      SEED.forEach(async worksheet => {
        await repository.save({
          ...worksheet,
          domain
        })
      })
    } catch (e) {
      console.error(e)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    // const repository = getRepository(Worksheet)
    // SEED.reverse().forEach(async worksheet => {
    //   let record = await repository.findOne({ name: worksheet.name })
    //   await repository.remove(record)
    // })
  }
}
