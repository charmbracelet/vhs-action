import * as fs from 'fs'
import * as path from 'path'
import * as intaller from './installer'
import * as deps from './dependencies'
import * as fonts from './fonts'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

async function run(): Promise<void> {
  try {
    const version = core.getInput('version')
    const filePath = core.getInput('path')

    fs.accessSync(filePath, fs.constants.F_OK)
    fs.accessSync(filePath, fs.constants.R_OK)
    await fonts.install()
    await deps.install()
    const bin = await intaller.install(version)

    core.debug('Adding VHS to PATH')
    core.addPath(path.dirname(bin))

    if (path) {
      await exec.exec(`${bin} ${filePath}`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
