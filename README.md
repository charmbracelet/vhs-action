# VHS Action

GitHub Action to run [VHS](https://github.com/charmbracelet/vhs).

## Example

```yaml
name: vhs

on:
  push:
    paths:
      - demo.tape

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
```

***

Part of [Charm](https://charm.sh).

<a href="https://charm.sh/"><img alt="The Charm logo" src="https://stuff.charm.sh/charm-badge.jpg" width="400"></a>

Charm热爱开源 • Charm loves open source
