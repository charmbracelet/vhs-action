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
    // set a default value to be backward compatible
    const filePath = core.getInput('path') || 'vhs.tape'

    fs.accessSync(filePath, fs.constants.F_OK)
    fs.accessSync(filePath, fs.constants.R_OK)
    await fonts.install()
    await deps.install()
    const bin = await intaller.install(version)

    core.info('Adding VHS to PATH')
    core.addPath(path.dirname(bin))

    // If the file exists, run it
    // Otherwise, just install the binary
    if (fs.existsSync(filePath)) {
      core.info('Running VHS')
      await exec.exec(`${bin} ${filePath}`)
    } else {
      core.error(`File ${filePath} does not exist`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
