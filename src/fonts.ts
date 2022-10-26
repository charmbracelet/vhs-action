// https://www.jetbrains.com/lp/mono/
// https://fonts.google.com/

import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as tc from '@actions/tool-cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

interface GithubFont {
  owner: string
  repo: string
  assetStartsWith: string
  assetEndsWith: string
  staticPath: string[]
}

interface GoogleFont {
  name: string
  staticPath: string[]
}

const googleFonts: GoogleFont[] = [
  {
    name: 'Inconsolata',
    staticPath: ['static', 'Inconsolata']
  },
  {
    name: 'Noto Sans Mono',
    staticPath: ['static', 'NotoSansMono']
  },
  {
    name: 'Roboto Mono',
    staticPath: ['static']
  },
  {
    name: 'Ubuntu Mono',
    staticPath: []
  }
]

const githubFonts: GithubFont[] = [
  {
    owner: 'adobe-fonts',
    repo: 'source-code-pro',
    assetStartsWith: 'TTF',
    assetEndsWith: '.zip',
    staticPath: []
  },
  {
    owner: 'dejavu-fonts',
    repo: 'dejavu-fonts',
    assetStartsWith: 'dejavu-fonts-ttf',
    assetEndsWith: '.zip',
    staticPath: ['ttf']
  },
  {
    owner: 'tonsky',
    repo: 'FiraCode',
    assetStartsWith: 'Fira_Code',
    assetEndsWith: '.zip',
    staticPath: ['ttf']
  },
  {
    owner: 'source-foundry',
    repo: 'Hack',
    assetStartsWith: 'Hack',
    assetEndsWith: '-ttf.zip',
    staticPath: []
  },
  {
    owner: 'JetBrains',
    repo: 'JetBrainsMono',
    assetStartsWith: 'JetBrainsMono',
    assetEndsWith: '.zip',
    staticPath: ['fonts', 'ttf']
  }
]

const fontPath = {
  linux: '~/.local/share/fonts',
  darwin: '~/Library/Fonts'
}

const token = core.getInput('token')
const octo = github.getOctokit(token)
const osPlatform: string = os.platform()

export async function install(): Promise<void> {
  if (osPlatform === 'linux') {
    await fs.mkdir('~/.local/share/fonts', {recursive: true})
  }
  await Promise.all([
    ...githubFonts.map(async font => installGithubFont(font)),
    ...googleFonts.map(async font => installGoogleFont(font)),
    liberation()
  ]).catch(err => {
    core.warning(err.message)
  })
  if (osPlatform === 'linux') {
    await exec.exec('fc-cache', ['-f', '-v'])
  }
}

async function installFonts(dir: string): Promise<void> {
  return fs.readdir(dir).then(async files => {
    await Promise.all(
      files
        .filter(file => file.endsWith('.ttf'))
        .map(async file => {
          const filename = path.basename(file)
          const absolutePath = path.resolve(dir, file)
          switch (osPlatform) {
            case 'linux':
            case 'darwin': {
              return fs.copyFile(
                absolutePath,
                path.join(fontPath[osPlatform], filename)
              )
            }
            case 'win32': {
              return installWindowsFont(absolutePath)
            }
          }
          return Promise.reject(new Error('Unsupported platform'))
        })
    )
  })
}

// based on https://superuser.com/a/201899/985112
async function installWindowsFont(file: string): Promise<void> {
  await exec.exec('Set', ['objShell', '=', 'CreateObject("Shell.Application")'])
  await exec.exec('Set', [
    'objFolder',
    '=',
    'objShell.Namespace("C:\\Windows\\Font")'
  ])
  await exec.exec('Set', [
    'objFolderItem',
    '=',
    `objFolder.ParseName("${file}")`
  ])
  await exec.exec('objFolderItem.InvokeVerb("Install")')
}

async function installGithubFont(font: GithubFont): Promise<void> {
  const cacheDir = tc.find(font.repo, 'latest')
  if (cacheDir) {
    core.info(`Found cached version of ${font.repo}`)
    return installFonts(cacheDir)
  }
  const release = await octo.rest.repos.getLatestRelease({
    owner: font.owner,
    repo: font.repo
  })
  for (const asset of release.data.assets) {
    const url = asset.browser_download_url
    const name = asset.name
    if (
      name.startsWith(font.assetStartsWith) &&
      name.endsWith(font.assetEndsWith)
    ) {
      const zipPath = await tc.downloadTool(url, '', token)
      const unzipPath = await tc.extractZip(zipPath)
      const cacheDir = await tc.cacheDir(
        path.join(unzipPath, ...font.staticPath),
        font.repo,
        'latest'
      )
      return installFonts(cacheDir)
    }
  }
  return Promise.reject(new Error(`Could not find ${font.repo}`))
}

async function installGoogleFont(font: GoogleFont): Promise<void> {
  const fontCacheName = font.name.toLowerCase().replace(/ /g, '-')
  const escapedName = font.name.replace(/ /g, '%20')
  let cacheDir = tc.find(fontCacheName, 'latest')
  if (cacheDir) {
    core.info(`Found cached version of ${font.name}`)
    return installFonts(cacheDir)
  }
  const zipPath = await tc.downloadTool(
    `https://fonts.google.com/download?family=${escapedName}`,
    '',
    token
  )
  const unzipPath = await tc.extractZip(zipPath)
  cacheDir = await tc.cacheDir(
    path.join(unzipPath, ...font.staticPath),
    fontCacheName,
    'latest'
  )
  return installFonts(cacheDir)
}

async function liberation(): Promise<void> {
  let cacheDir = tc.find('liberation', 'latest')
  if (cacheDir) {
    core.info(`Found cached version of Liberation`)
    return installFonts(cacheDir)
  }
  // FIXME liberation-fonts don't upload their fonts to GitHub releases, instead in the release description :/
  const zipPath = await tc.downloadTool(
    'https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz',
    '',
    token
  )
  const unzipPath = await tc.extractTar(zipPath)
  cacheDir = await tc.cacheDir(unzipPath, 'liberation', 'latest')
  return installFonts(cacheDir)
}
