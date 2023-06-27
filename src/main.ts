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

    // Fail fast if file does not exist.
    if (filePath) {
      if (!fs.existsSync(filePath)) {
        core.error(`File ${filePath} does not exist`)
      } else {
        // Check that `filePath` is a file, and that we can read it.
        fs.accessSync(filePath, fs.constants.F_OK)
        fs.accessSync(filePath, fs.constants.R_OK)
      }
    }

    await fonts.install()
    await deps.install()
    const bin = await intaller.install(version)

    core.info('Adding VHS to PATH')
    core.addPath(path.dirname(bin))

    // Unset the CI variable to prevent Termenv from ignoring terminal ANSI
    // sequences.
    core.exportVariable('CI', '')

    if (filePath) {
      core.info('Running VHS')
      await exec.exec(`${bin} ${filePath}`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
