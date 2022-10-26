import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as tc from '@actions/tool-cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

const specialNames = {
  '%assetNameName%': (asset: {name: string}) => path.parse(asset.name).name
}

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
    name: 'Source Code Pro',
    staticPath: ['static']
  },
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
    staticPath: ['%assetName%', 'ttf']
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
  core.info(`Installing fonts...`)
  if (osPlatform === 'linux' || osPlatform === 'darwin') {
    await fs.mkdir(fontPath[osPlatform], {recursive: true})
  }
  for (const font of googleFonts) {
    await installGoogleFont(font)
  }
  for (const font of githubFonts) {
    await installGithubFont(font)
  }
  await liberation()
  if (osPlatform === 'linux') {
    await exec.exec('fc-cache', ['-f', '-v'])
  }
}

async function installFonts(dir: string): Promise<void[]> {
  const files = (await fs.readdir(dir)).filter(file => file.endsWith('.ttf'))

  return Promise.all(
    files.map(async file => {
      const filename = path.basename(file)
      const absolutePath = path.resolve(dir, filename)
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

async function installGithubFont(font: GithubFont): Promise<void[]> {
  core.info(`Installing ${font.repo}`)
  const cacheDir = tc.find(font.repo, 'latest')
  if (cacheDir) {
    core.info(`Found cached version of ${font.repo}`)
    for (const file of await fs.readdir(cacheDir)) {
      core.debug(`Found cached ${file}`)
    }
    return installFonts(cacheDir)
  }
  const release = await octo.rest.repos.getLatestRelease({
    owner: font.owner,
    repo: font.repo
  })
  for (const asset of release.data.assets) {
    const url = asset.url
    const name = asset.name
    if (
      name.startsWith(font.assetStartsWith) &&
      name.endsWith(font.assetEndsWith)
    ) {
      core.info(`Downloading ${font.repo}`)
      const zipPath = await tc.downloadTool(url, '', `token ${token}`, {
        accept: 'application/octet-stream'
      })
      const unzipPath = await tc.extractZip(zipPath)
      const staticPath = font.staticPath.map(p => {
        return sanitizeSpecial(p, asset)
      })
      const cacheDir = await tc.cacheDir(
        path.join(unzipPath, ...staticPath),
        font.repo,
        'latest'
      )
      for (const file of await fs.readdir(cacheDir)) {
        core.debug(`Found file ${file}`)
      }
      return installFonts(cacheDir)
    }
  }
  return Promise.reject(new Error(`Could not find ${font.repo}`))
}

async function installGoogleFont(font: GoogleFont): Promise<void[]> {
  core.info(`Installing ${font.name}`)
  const fontCacheName = font.name.toLowerCase().replace(/ /g, '-')
  const escapedName = font.name.replace(/ /g, '%20')
  let cacheDir = tc.find(fontCacheName, 'latest')
  if (cacheDir) {
    core.info(`Found cached version of ${font.name}`)
    for (const file of await fs.readdir(cacheDir)) {
      core.debug(`Found cached ${file}`)
    }
    return installFonts(cacheDir)
  }
  core.info(`Downloading ${font.name}`)
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
  for (const file of await fs.readdir(cacheDir)) {
    core.debug(`Found file ${file}`)
  }
  return installFonts(cacheDir)
}

async function liberation(): Promise<void[]> {
  core.info('Installing Liberation Fonts')
  let cacheDir = tc.find('liberation', 'latest')
  if (cacheDir) {
    core.info(`Found cached version of Liberation`)
    return installFonts(cacheDir)
  }
  core.info(`Downloading Liberation`)
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

// DejaVu fonts have a different structure than the other fonts. The zip
// contains a root folder with the same zip file name without the extension.
function sanitizeSpecial(name: string, asset: {name: string}): string {
  for (const [key, value] of Object.entries(specialNames)) {
    name = name.replace(key, value(asset))
  }
  return name
}
