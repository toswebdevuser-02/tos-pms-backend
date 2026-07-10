/**
 * Settings Service - Application settings.
 */

import * as settingsRepository from '../repository/settingsRepository'

interface Row {
  [key: string]: any
}

export async function get(): Promise<Row> {
  return settingsRepository.get()
}

export async function update(patch: Row): Promise<Row> {
  return settingsRepository.update(patch)
}
