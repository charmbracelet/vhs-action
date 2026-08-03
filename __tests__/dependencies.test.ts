import {describe, expect, jest, test} from '@jest/globals'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import {
  ffmpegBinDir,
  findBtbNAsset,
  resolveFfmpegRoot
} from '../src/dependencies'

// os.arch is not configurable, so replace the module export instead of spying.
jest.mock('os', () => ({
  ...jest.requireActual<typeof os>('os'),
  arch: jest.fn(() => 'x64')
}))

const mockArch = (arch: string): void => {
  ;(os.arch as jest.Mock).mockReturnValue(arch)
}

const asset = (name: string): {name: string; browser_download_url: string} => ({
  name,
  browser_download_url: `https://example.com/${name}`
})

// Subset of a BtbN/FFmpeg-Builds `latest` release, in upstream order.
const assets = [
  asset('checksums.sha256'),
  asset('ffmpeg-master-latest-linux64-gpl-shared.tar.xz'),
  asset('ffmpeg-master-latest-linux64-gpl.tar.xz'),
  asset('ffmpeg-master-latest-linux64-lgpl.tar.xz'),
  asset('ffmpeg-master-latest-linuxarm64-gpl.tar.xz'),
  asset('ffmpeg-master-latest-win64-gpl-shared.zip'),
  asset('ffmpeg-master-latest-win64-gpl.zip'),
  asset('ffmpeg-master-latest-winarm64-gpl.zip'),
  asset('ffmpeg-n7.1-latest-linux64-gpl-7.1.tar.xz'),
  asset('ffmpeg-n7.1-latest-win64-gpl-7.1.zip'),
  asset('ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz'),
  asset('ffmpeg-n8.1-latest-linux64-gpl-shared-8.1.tar.xz'),
  asset('ffmpeg-n8.1-latest-win64-gpl-8.1.zip')
]

describe('findBtbNAsset', () => {
  test('picks the static master build on linux x64', () => {
    mockArch('x64')
    expect(findBtbNAsset(assets, 'linux', '.tar.xz')).toBe(
      'https://example.com/ffmpeg-master-latest-linux64-gpl.tar.xz'
    )
  })

  test('picks the static master build on windows x64', () => {
    mockArch('x64')
    expect(findBtbNAsset(assets, 'win', '.zip')).toBe(
      'https://example.com/ffmpeg-master-latest-win64-gpl.zip'
    )
  })

  test('picks the arm64 build on arm64 runners', () => {
    mockArch('arm64')
    expect(findBtbNAsset(assets, 'linux', '.tar.xz')).toBe(
      'https://example.com/ffmpeg-master-latest-linuxarm64-gpl.tar.xz'
    )
    expect(findBtbNAsset(assets, 'win', '.zip')).toBe(
      'https://example.com/ffmpeg-master-latest-winarm64-gpl.zip'
    )
  })

  test('falls back to the highest branch when master is gone', () => {
    mockArch('x64')
    const noMaster = assets.filter(a => !a.name.includes('master'))
    expect(findBtbNAsset(noMaster, 'linux', '.tar.xz')).toBe(
      'https://example.com/ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz'
    )
  })

  test('still resolves the old n5.1 naming when it is all upstream has', () => {
    mockArch('x64')
    const oldOnly = [asset('ffmpeg-n5.1-latest-linux64-gpl-5.1.tar.xz')]
    expect(findBtbNAsset(oldOnly, 'linux', '.tar.xz')).toBe(
      'https://example.com/ffmpeg-n5.1-latest-linux64-gpl-5.1.tar.xz'
    )
    expect(findBtbNAsset(oldOnly, 'win', '.zip')).toBeUndefined()
  })

  test('returns undefined when nothing matches', () => {
    mockArch('x64')
    expect(
      findBtbNAsset([asset('checksums.sha256')], 'linux', '.tar.xz')
    ).toBeUndefined()
  })

  test('never picks a shared or lgpl build', () => {
    mockArch('x64')
    const url = findBtbNAsset(assets, 'linux', '.tar.xz') as string
    expect(url).not.toContain('shared')
    expect(url).not.toContain('lgpl')
  })
})

const tmpTree = (layout: string[]): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-test-'))
  for (const entry of layout) {
    const full = path.join(root, entry)
    fs.mkdirSync(path.dirname(full), {recursive: true})
    fs.writeFileSync(full, '')
  }
  return root
}

describe('resolveFfmpegRoot', () => {
  test('keeps a directory that already holds bin', () => {
    const root = tmpTree(['bin/ffmpeg', 'LICENSE.txt'])
    expect(resolveFfmpegRoot(root)).toBe(root)
  })

  test('descends into the single top level directory of a zip', () => {
    const root = tmpTree(['ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe'])
    expect(resolveFfmpegRoot(root)).toBe(
      path.join(root, 'ffmpeg-master-latest-win64-gpl')
    )
  })

  test('keeps a flat directory of binaries', () => {
    const root = tmpTree(['ffmpeg', 'ffprobe'])
    expect(resolveFfmpegRoot(root)).toBe(root)
  })
})

describe('ffmpegBinDir', () => {
  test('returns bin when it exists', () => {
    const root = tmpTree(['bin/ffmpeg'])
    expect(ffmpegBinDir(root)).toBe(path.join(root, 'bin'))
  })

  test('returns the directory itself otherwise', () => {
    const root = tmpTree(['ffmpeg'])
    expect(ffmpegBinDir(root)).toBe(root)
  })
})
