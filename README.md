# WireViz Preview

A simple extension for Visual Studio Code to preview WireViz YAML files.

![Screenshot](/img/screenshot.png)

## Prerequisites
- Install extension from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=NanangP.vscode-wireviz-preview) - or build from source.
- [WireViz](https://github.com/wireviz/WireViz) 0.3.2 or later; which requires [Python](https://www.python.org/downloads/) 3.7 or later, and [Graphviz](https://graphviz.org/download/)

## Running
1. Open a WireViz YAML file.
2. Use the `WireViz: Preview` button on the editor toolbar (right of tabs),
   or using the default <kbd>F8</kbd> shortcut key.
4. Once the preview is open, it will refresh every time you save the file.  
   This behaviour can be disabled by turning off `WireViz: Refresh Preview on Save` in the settings UI, or adding `"wireviz.refreshPreviewOnSave":false` to your `settings.json`.

## Limitations
- Only tested with VSCode on Windows (without WSL). If anyone manages to run this on other platforms, please let us know.

## Changelog
See [CHANGELOG.md](CHANGELOG.md)

## License
[GPL-3.0](https://spdx.org/licenses/GPL-3.0-only.html) was chosen to match the WireViz license.
