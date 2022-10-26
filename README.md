# VHS Action

GitHub Action to run [VHS][vhs].

[![welcome to vhs!](vhs.gif)][vhs]

[vhs]: https://github.com/charmbracelet/vhs

## Inputs

### `path`

The path to the VHS tape file. Default `"vhs.tape"`.

### `version`

The version of VHS to use. Default `"latest"`.

### `token`

The GitHub token to use. Default `"${{ github.token }}"`.

### `install-fonts`

Whether to install fonts. Default `"true"`.

## Example

Auto commit new GIFs on tape change:

```yaml
name: vhs
on:
  push:
    paths:
      - vhs.tape
jobs:
  vhs:
    runs-on: ubuntu-latest
    name: gifs
    steps:
      - uses: actions/checkout@v3
      - uses: charmbracelet/vhs-action@main
        with:
          path: 'vhs.tape'
      - uses: stefanzweifel/git-auto-commit-action@v4
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          commit_message: Update generated VHS GIF
          branch: main
          commit_user_name: vhs-action 📼
          commit_user_email: actions@github.com
          commit_author: vhs-action 📼 <actions@github.com>
          file_pattern: '*.gif'
```

## Fonts

The action installs a few fonts by default.

* Bitstream Vera Sans Mono Nerd
* DejaVu
* DejaVu Sans Mono Nerd
* Fira Code
* Fira Code Nerd
* Hack
* Hack Nerd
* IBM Plex Mono Nerd
* Inconsolata
* Inconsolata Nerd
* InconsolataGo Nerd
* JetBrains Mono
* JetBrains Mono Nerd
* Liberation
* Liberation Mono Nerd
* Noto Sans Mono
* Roboto Mono
* Source Code Pro
* Source Code Pro Nerd
* Ubuntu Mono
* Ubuntu Mono Nerd

***

Part of [Charm](https://charm.sh).

<a href="https://charm.sh/"><img alt="The Charm logo" src="https://stuff.charm.sh/charm-badge.jpg" width="400"></a>

Charm热爱开源 • Charm loves open source
