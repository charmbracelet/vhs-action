import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import * as tc from '@actions/tool-cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import * as httpm from '@actions/http-client'

export async function install(): Promise<void> {
  core.info(`Installing dependencies...`)
  await installTtyd()
  await installLatestFfmpeg()
  return Promise.resolve()
}

export async function installTtyd(version?: string): Promise<string> {
  if (!version) {
    version = 'latest'
  }
  version = version.replace(/^v/, '')

  core.info(`Installing ttyd ${version}...`)

  const osPlatform = os.platform()
  const token = core.getInput('token')
  const octo = github.getOctokit(token)
  const cacheFile = tc.find('ttyd', version)
  if (cacheFile) {
    core.info(`Found cached version ${version}`)
    if (['darwin', 'linux'].includes(osPlatform)) {
      fs.chmodSync(cacheFile, '755')
    }
    core.addPath(path.dirname(cacheFile))
    return Promise.resolve(cacheFile)
  }

  let binPath: string | undefined
  let url: string | undefined
  let release
  if (version === 'latest') {
    core.debug('Getting latest release')
    release = await octo.rest.repos.getLatestRelease({
      owner: 'tsl0922',
      repo: 'ttyd'
    })
  } else {
    core.debug(`Getting release for version ${version}`)
    release = await octo.rest.repos.getReleaseByTag({
      owner: 'tsl0922',
      repo: 'ttyd',
      tag: version
    })
  }
  switch (osPlatform) {
    case 'win32': {
      url = release.data.assets.find(
        asset =>
          asset.name.endsWith('win10.exe') || asset.name.endsWith('win32.exe')
      )?.browser_download_url
      core.debug(`Installing ttyd ${version} on Windows from ${url}`)
      break
    }
    case 'linux': {
      url = release.data.assets.find(asset =>
        asset.name.endsWith('x86_64')
      )?.browser_download_url
      core.debug(`Installing ttyd ${version} on Linux from ${url}`)
      break
    }
    case 'darwin': {
      core.debug(`Installing ttyd from HEAD on MacOs`)
      await exec.exec('brew', ['update', '--quiet'])
      const args = ['install', 'ttyd']
      if (version === 'latest') {
        args.push('--HEAD')
      }
      core.debug(`MacOS ttyd does not support versioning`)
      await exec.exec('brew', args)
      const brewPrefixOutput = await exec.getExecOutput('brew', ['--prefix'])
      const brewPrefix = brewPrefixOutput.stdout.trim()
      const cachePath = await tc.cacheFile(
        `${brewPrefix}/bin/ttyd`,
        'ttyd',
        'ttyd',
        version
      )
      return Promise.resolve(path.join(cachePath, 'ttyd'))
    }
    default: {
      return Promise.reject(new Error(`Unsupported platform: ${osPlatform}`))
    }
  }

  if (url) {
    binPath = await tc.downloadTool(url, '', `token ${token}`, {
      accept: 'application/octet-stream'
    })
    core.debug(`Downloaded ttyd to ${binPath}`)
    const cacheDir = await tc.cacheFile(
      binPath,
      `ttyd${osPlatform === 'win32' ? '.exe' : ''}`,
      'ttyd',
      // FIXME fetch version
      version
    )
    core.debug(`Cached ttyd in ${cacheDir}`)
    core.addPath(cacheDir)
    if (['darwin', 'linux'].includes(osPlatform)) {
      fs.chmodSync(path.join(cacheDir, 'ttyd'), '755')
    }
    return Promise.resolve(
      path.join(cacheDir, `ttyd${osPlatform === 'win32' ? '.exe' : ''}`)
    )
  }

  return Promise.reject(new Error(`Could not install ttyd`))
}

export async function installTtydBrewHead(): Promise<void> {
  // Install ttyd from source
  await exec.exec('git', ['clone', 'https://github.com/tsl0922/ttyd'])
  await exec.exec('cd', ['ttyd'])
  await exec.exec('brew', ['update', '--quiet'])
  await exec.exec('brew', [
    'install',
    'cmake',
    'json-c',
    'libevent',
    'libuv',
    'libwebsockets',
    'openssl@1.1'
  ])
  await exec.exec('cmake', [
    '-S',
    '.',
    '-B',
    'build',
    '-DOPENSSL_ROOT_DIR=$(brew --prefix)/opt/openssl@1.1/',
    '-Dlibwebsockets_DIR=$(brew --prefix)/lib/cmake/libwebsockets'
  ])
  await exec.exec('cmake', ['--build', 'build'])
  await exec.exec('cmake', ['--install', 'build'])
  return Promise.resolve()
}

interface FfmpegMacOs {
  name: string
  url: string
  version: string
  download: {
    '7z': {
      url: string
    }
    zip: {
      url: string
    }
  }
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

// Pick a static GPL build from a BtbN/FFmpeg-Builds release. Assets are named
// ffmpeg-<branch>-latest-<os><arch>-<license>[-shared][-<ver>].<ext>, e.g.
// ffmpeg-master-latest-linux64-gpl.tar.xz or
// ffmpeg-n7.1-latest-linuxarm64-gpl-7.1.tar.xz.
// Prefer the master build, fall back to the highest versioned branch, so the
// action keeps working as branches are added and dropped upstream.
export function findBtbNAsset(
  assets: ReleaseAsset[],
  osName: 'linux' | 'win',
  ext: string
): string | undefined {
  const arch = os.arch() === 'arm64' ? 'arm64' : '64'
  const target = `${osName}${arch}-gpl`

  const candidates = assets.filter(
    asset =>
      asset.name.startsWith('ffmpeg-') &&
      asset.name.includes(`-${target}`) &&
      !asset.name.includes('-shared') &&
      asset.name.endsWith(ext)
  )
  if (candidates.length === 0) {
    return undefined
  }

  const master = candidates.find(asset =>
    asset.name.startsWith('ffmpeg-master')
  )
  if (master) {
    return master.browser_download_url
  }

  // Sort by branch version descending, e.g. n8.1 before n7.1.
  const branchVersion = (name: string): number => {
    const match = name.match(/^ffmpeg-n(\d+)\.(\d+)/)
    return match ? Number(match[1]) * 1000 + Number(match[2]) : 0
  }
  candidates.sort((a, b) => branchVersion(b.name) - branchVersion(a.name))
  return candidates[0].browser_download_url
}

// Directory holding the ffmpeg binaries, which is `bin` for the BtbN builds and
// the extracted directory itself for the macOS builds.
export function ffmpegBinDir(dir: string): string {
  const binDir = path.join(dir, 'bin')
  return fs.existsSync(binDir) ? binDir : dir
}

// Some archives extract into a single top level directory instead of the
// binaries directly, so descend into it when that is the case.
export function resolveFfmpegRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, 'bin'))) {
    return dir
  }
  const entries = fs.readdirSync(dir, {withFileTypes: true})
  const dirs = entries.filter(entry => entry.isDirectory())
  if (entries.length === 1 && dirs.length === 1) {
    return path.join(dir, dirs[0].name)
  }
  return dir
}

export async function installLatestFfmpeg(): Promise<string> {
  core.info(`Installing latest ffmpeg...`)

  const http = new httpm.HttpClient('vhs-action')
  const osPlatform = os.platform()
  const token = core.getInput('token')
  const octo = github.getOctokit(token)
  const cacheDir = tc.find('ffmpeg', 'latest')
  if (cacheDir) {
    core.info(`Found cached version latest`)
    const binPath = ffmpegBinDir(cacheDir)
    core.addPath(binPath)
    return Promise.resolve(
      path.join(binPath, `ffmpeg${osPlatform === 'win32' ? '.exe' : ''}`)
    )
  }

  const flags: string[] = []
  let url: string | undefined
  const version = 'latest'
  let release
  let extract: (
    file: string,
    dest?: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flags?: any
  ) => Promise<string>
  switch (osPlatform) {
    case 'linux': {
      // Use https://github.com/BtbN/FFmpeg-Builds builds
      release = await octo.rest.repos.getLatestRelease({
        owner: 'BtbN',
        repo: 'FFmpeg-Builds'
      })
      url = findBtbNAsset(release.data.assets, 'linux', '.tar.xz')
      extract = tc.extractTar
      flags.push('xJ', '--strip-components=1')
      break
    }
    case 'win32': {
      // Use https://github.com/BtbN/FFmpeg-Builds builds
      release = await octo.rest.repos.getLatestRelease({
        owner: 'BtbN',
        repo: 'FFmpeg-Builds'
      })
      url = findBtbNAsset(release.data.assets, 'win', '.zip')
      extract = tc.extractZip
      break
    }
    case 'darwin': {
      // Use https://evermeet.cx/ffmpeg/ builds
      const resp = await http.getJson<FfmpegMacOs>(
        'https://evermeet.cx/ffmpeg/info/ffmpeg/release'
      )
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      // version = resp.result!.version
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      url = resp.result!.download.zip.url
      extract = tc.extractZip
      break
    }
    default: {
      return Promise.reject(new Error(`Unsupported platform: ${osPlatform}`))
    }
  }

  if (url) {
    const dlPath = await tc.downloadTool(url)
    core.debug(`Downloaded ffmpeg to ${dlPath}`)
    const cachePath = await tc.cacheDir(
      // The zip builds are not stripped like the tarballs, so the binaries can
      // sit one directory deeper than the archive root.
      resolveFfmpegRoot(await extract(dlPath, '', flags)),
      'ffmpeg',
      version
    )
    const binDir = ffmpegBinDir(cachePath)
    core.addPath(binDir)
    return Promise.resolve(
      path.join(binDir, `ffmpeg${osPlatform === 'win32' ? '.exe' : ''}`)
    )
  }

  return Promise.reject(new Error('Failed to install ffmpeg'))
}

export async function installFfmpeg(): Promise<void> {
  const osPlatform = os.platform()
  switch (osPlatform) {
    case 'linux': {
      await exec.exec('sudo', ['apt-get', 'update'])
      await exec.exec('sudo', ['apt-get', 'install', 'ffmpeg'])
      break
    }
    case 'win32': {
      await exec.exec('choco', ['install', 'ffmpeg'])
      break
    }
    case 'darwin': {
      await exec.exec('brew', ['update', '--quiet'])
      await exec.exec('brew', ['install', 'ffmpeg'])
      break
    }
    default: {
      return Promise.reject(new Error(`Unsupported platform: ${osPlatform}`))
    }
  }
  return Promise.resolve()
}
