import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as tc from '@actions/tool-cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import * as glob from '@actions/glob'

const specialNames = {
  '%assetNameName%': (asset: {name: string}) => path.parse(asset.name).name
}

// Nerd Font asset name
interface NerdFont {
  name: string
  isDefault?: boolean
}

interface GithubFont {
  owner: string
  repo: string
  assetStartsWith: string
  assetEndsWith: string
  staticPath: string[]
  isDefault?: boolean
}

interface GoogleFont {
  name: string
  pattern: string
  isDefault?: boolean
}

const nerdFonts = [
  {
    name: 'JetBrainsMono.zip',
    isDefault: true
  },
  {
    name: 'BitstreamVeraSansMono.zip'
  },
  {
    name: 'DejaVuSansMono.zip'
  },
  {
    name: 'FiraCode.zip'
  },
  {
    name: 'Hack.zip'
  },
  {
    name: 'IBMPlexMono.zip'
  },
  {
    name: 'Inconsolata.zip'
  },
  {
    name: 'InconsolataGo.zip'
  },
  {
    name: 'LiberationMono.zip'
  },
  {
    name: 'SourceCodePro.zip'
  },
  {
    name: 'UbuntuMono.zip'
  }
]

const googleFonts: GoogleFont[] = [
  {
    name: 'Source Code Pro',
    pattern: 'SourceCodePro*.ttf'
  },
  {
    name: 'Inconsolata',
    pattern: 'Inconsolata*.ttf'
  },
  {
    name: 'Noto Sans Mono',
    pattern: 'NotoSansMono*.ttf'
  },
  {
    name: 'Roboto Mono',
    pattern: 'RobotoMono*.ttf'
  },
  {
    name: 'Ubuntu Mono',
    pattern: 'UbuntuMono*.ttf'
  }
]

const githubFonts: GithubFont[] = [
  {
    owner: 'JetBrains',
    repo: 'JetBrainsMono',
    isDefault: true,
    assetStartsWith: 'JetBrainsMono',
    assetEndsWith: '.zip',
    staticPath: ['fonts', 'ttf']
  },
  {
    owner: 'dejavu-fonts',
    repo: 'dejavu-fonts',
    assetStartsWith: 'dejavu-fonts-ttf',
    assetEndsWith: '.zip',
    staticPath: ['%assetNameName%', 'ttf']
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
  }
]

const fontPath = {
  linux: `${os.homedir()}/.local/share/fonts`,
  darwin: `${os.homedir()}/Library/Fonts`,
  win32: '%LocalAppData%\\Microsoft\\Windows\\Fonts'
}

const installExtraFonts = core.getInput('install-fonts') === 'true'
const token = core.getInput('token')
const octo = github.getOctokit(token)
const osPlatform: string = os.platform()

const ps1Install = `$fonts = (New-Object -ComObject Shell.Application).Namespace(0x14)
Get-ChildItem -Recurse -include *.ttf | % { $fonts.CopyHere($_.fullname) }`
const ps1InstallPath = path.join(os.homedir(), 'install.ps1')

export async function install(): Promise<void> {
  core.info(`Installing ${installExtraFonts ? 'all' : 'default'} fonts...`)
  if (osPlatform === 'linux' || osPlatform === 'darwin') {
    core.debug(`Creating font directory ${fontPath[osPlatform]}`)
    await fs.mkdir(fontPath[osPlatform], {recursive: true})
  }
  if (osPlatform === 'win32') {
    // Create the install script
    await fs.writeFile(ps1InstallPath, ps1Install)
  }
  for (const font of googleFonts) {
    if (font.isDefault || installExtraFonts) {
      await installGoogleFont(font)
    }
  }
  for (const font of githubFonts) {
    if (font.isDefault || installExtraFonts) {
      await installGithubFont(font)
    }
  }
  for (const font of nerdFonts) {
    if (font.isDefault || installExtraFonts) {
      await installNerdFont(font)
    }
  }
  if (installExtraFonts) {
    await liberation()
  }
  if (osPlatform === 'linux') {
    await exec.exec('fc-cache', ['-f', '-v'])
  }
}

async function installFonts(dir: string): Promise<void[]> {
  const files = (await fs.readdir(dir)).filter(file => file.endsWith('.ttf'))

  // Windows installs all fonts at once
  if (osPlatform === 'win32') {
    return installWindowsFont(path.resolve(dir)).then(() => [])
  }
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
      }
      return Promise.reject(new Error('Unsupported platform'))
    })
  )
}

// based on https://superuser.com/a/788759/985112
async function installWindowsFont(dirPath: string): Promise<number> {
  core.debug(`Running PS1 install script for ${dirPath}`)
  return exec.exec(
    'powershell.exe',
    ['-ExecutionPolicy', 'Bypass', ps1InstallPath],
    {
      cwd: dirPath
    }
  )
}

async function installGithubFont(font: GithubFont): Promise<void[]> {
  core.info(`Installing ${font.repo}`)
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
      return installFonts(cacheDir)
    }
  }
  return Promise.reject(new Error(`Could not find ${font.repo}`))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nerdFontsRelease: any | undefined

async function installNerdFont(font: NerdFont): Promise<void[]> {
  if (!nerdFontsRelease) {
    nerdFontsRelease = await octo.rest.repos.getLatestRelease({
      owner: 'ryanoasis',
      repo: 'nerd-fonts'
    })
  }
  const fontName = `${path.parse(font.name).name}-nerd`
  for (const asset of nerdFontsRelease.data.assets) {
    const url = asset.url
    const name = asset.name
    if (font.name === name) {
      core.info(`Installing ${fontName}`)
      let cacheDir = tc.find(fontName, 'latest')
      if (cacheDir) {
        core.info(`Found cached version of ${fontName}`)
        return installFonts(cacheDir)
      }
      core.info(`Downloading ${fontName}`)
      const zipPath = await tc.downloadTool(url, '', `token ${token}`, {
        accept: 'application/octet-stream'
      })
      const unzipPath = await tc.extractZip(zipPath)
      cacheDir = await tc.cacheDir(unzipPath, fontName, 'latest')
      return installFonts(cacheDir)
    }
  }
  return Promise.reject(new Error(`Could not find ${fontName}`))
}

let googleFontsPath = ''

async function installGoogleFont(font: GoogleFont): Promise<void[]> {
  const cacheDir = tc.find(font.name, 'latest')
  if (cacheDir) {
    core.info(`Found cached version of ${font.name}`)
    return installFonts(cacheDir)
  }
  if (!googleFontsPath) {
    core.info('Downloading Google Fonts repository archive')
    const zipPath = await tc.downloadTool(
      'https://github.com/google/fonts/archive/refs/heads/main.zip',
      '',
      token
    )
    googleFontsPath = await tc.extractZip(zipPath)
  }
  core.info(`Installing ${font.name}`)
  const globber = await glob.create(
    path.join(googleFontsPath, '**', font.pattern)
  )
  const files = await globber.glob()
  const cacheDirs: {[key: string]: string} = {}
  for (const file of files) {
    if (!cacheDirs[font.name]) {
      cacheDirs[font.name] = await tc.cacheDir(
        path.dirname(file),
        font.name,
        'latest'
      )
    }
  }
  return Promise.all(
    Object.keys(cacheDirs).map(async key => {
      await installFonts(cacheDirs[key])
    })
  )
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
