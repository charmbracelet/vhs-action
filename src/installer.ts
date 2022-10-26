import * as os from 'os'
import * as path from 'path'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as tc from '@actions/tool-cache'

const cacheName = 'vhs'

export async function install(version: string): Promise<string> {
  core.info(`Installing VHS ${version}...`)

  const osPlatform: string = os.platform()
  const osArch: string = os.arch()
  const token = core.getInput('token')
  const octo = github.getOctokit(token)
  let release
  if (version === 'latest') {
    core.debug('Getting latest release')
    release = await octo.rest.repos.getLatestRelease({
      owner: 'charmbracelet',
      repo: 'vhs'
    })
  } else {
    core.debug(`Getting release for version ${version}`)
    release = await octo.rest.repos.getReleaseByTag({
      owner: 'charmbracelet',
      repo: 'vhs',
      tag: version
    })
  }

  version = release.data.tag_name.replace(/^v/, '')

  // find cached version
  const cacheDir = tc.find(cacheName, version)
  if (cacheDir) {
    core.info(`Found cached version ${version}`)
    return Promise.resolve(
      path.join(cacheDir, osPlatform === 'win32' ? 'vhs.exe' : 'vhs')
    )
  }

  core.info(`Downloading VHS ${version}...`)

  let platform = osPlatform
  let arch = osArch
  let ext = 'tar.gz'
  switch (osArch) {
    case 'x64': {
      arch = 'x86_64'
      break
    }
    case 'x32': {
      arch = 'i386'
      break
    }
    case 'arm': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arm_version: string = (process.config.variables as any).arm_version
      arch = arm_version ? 'armv' + arm_version : 'arm'
      break
    }
  }
  switch (osPlatform) {
    case 'darwin': {
      platform = 'Darwin'
      break
    }
    case 'win32': {
      platform = 'Windows'
      ext = 'zip'
      break
    }
    case 'linux': {
      platform = 'Linux'
      break
    }
  }

  let dlUrl: string | undefined
  const archiveName = `vhs_${version}_${platform}_${arch}.${ext}`
  core.debug(`Looking for ${archiveName}`)
  for (const asset of release.data.assets) {
    core.debug(`Checking asset ${asset.name}`)
    if (asset.name === archiveName) {
      dlUrl = asset.url
      break
    }
  }

  if (!dlUrl) {
    return Promise.reject(
      new Error(
        `Unable to find VHS version ${version} for platform ${platform} and architecture ${arch}`
      )
    )
  }

  core.info(`Downloading ${dlUrl}...`)
  const dlPath = await tc.downloadTool(dlUrl, '', `token ${token}`, {
    accept: 'application/octet-stream'
  })
  core.debug(`Downloaded to ${dlPath}`)

  core.info('Extracting VHS...')
  let extPath: string
  if (osPlatform == 'win32') {
    extPath = await tc.extractZip(dlPath)
  } else {
    extPath = await tc.extractTar(dlPath)
  }
  core.debug(`Extracted to ${extPath}`)

  const cachePath: string = await tc.cacheDir(extPath, cacheName, version)
  core.debug(`Cached to ${cachePath}`)

  const binPath: string = path.join(
    cachePath,
    osPlatform == 'win32' ? 'vhs.exe' : 'vhs'
  )
  core.debug(`Bin path is ${binPath}`)

  return Promise.resolve(binPath)
}
