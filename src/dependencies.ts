import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import * as tc from '@actions/tool-cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

export async function installTtyd(version?: string): Promise<string> {
  const token = core.getInput('token')
  const octo = github.getOctokit(token)
  if (!version) {
    version = 'latest'
  }
  version = version.replace(/^v/, '')
  core.info(`Installing ttyd ${version}...`)
  const osPlatform = os.platform()
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
      url = release.data.assets.find(asset =>
        asset.name.endsWith('win10.exe')
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
      core.warning(`MacOS ttyd does not support versioning`)
      await exec.exec('brew', args)
      return Promise.resolve('/usr/local/bin/ttyd')
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
    const dir = path.dirname(binPath)
    core.debug(`Add ${dir} to PATH`)
    core.addPath(dir)
    if (osPlatform === 'linux') {
      fs.chmodSync(binPath, '755')
      fs.renameSync(binPath, path.join(dir, 'ttyd'))
    }
    if (osPlatform === 'win32') {
      fs.renameSync(binPath, path.join(dir, 'ttyd.exe'))
    }
    return Promise.resolve(binPath)
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

export async function installLatestFfmpeg(): Promise<string> {
  core.info(`Installing latest ffmpeg...`)
  const osPlatform = os.platform()
  let url: string
  let extract: (
    file: string,
    dest?: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flags?: any
  ) => Promise<string>
  switch (osPlatform) {
    case 'linux': {
      // Use https://johnvansickle.com/ffmpeg/ builds
      url =
        'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz'
      extract = tc.extractTar
      break
    }
    case 'win32': {
      // Use https://www.gyan.dev/ffmpeg/builds/ builds
      url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.7z'
      extract = tc.extract7z
      break
    }
    case 'darwin': {
      // Use https://evermeet.cx/ffmpeg/ builds
      url = 'https://evermeet.cx/ffmpeg/getrelease/zip'
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
    const dest = await extract(dlPath)
    switch (osPlatform) {
      case 'win32': {
        return Promise.resolve(`${dest}\\bin\\ffmpeg.exe`)
      }
      default: {
        return Promise.resolve(`${dest}/ffmpeg`)
      }
    }
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
