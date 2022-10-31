import * as fs from 'fs'
import * as intaller from './installer'
import * as deps from './dependencies'
import * as fonts from './fonts'
import * as core from '@actions/core'
import * as exec from '@actions/exec'

async function run(): Promise<void> {
  try {
    const version = core.getInput('version')
    const path = core.getInput('path')
    const installFonts = core.getInput('install-fonts') === 'true'

    fs.accessSync(path, fs.constants.F_OK)
    fs.accessSync(path, fs.constants.R_OK)
    if (installFonts) {
      await fonts.install()
    }
    await deps.install()
    const bin = await intaller.install(version)

    await exec.exec(`${bin} ${path}`)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
